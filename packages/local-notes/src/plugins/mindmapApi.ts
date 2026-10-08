import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { LocalNotesOptions } from "../options";
import { resolveLocalNotesOptions } from "../options";

/**
 * 思维导图本地保存 API（仅 dev 生效，apply: "serve"）
 *
 * 思维导图组件（<MindMap src="<assetPrefix>....mindmap.json">）在编辑模式下
 * 需要把导图数据持久化回 vault 本地文件（而非浏览器 localStorage）。浏览器
 * 无法直接写盘，由 dev 中间件提供两个 REST 路由：
 *
 * - GET `<apiBase>/mindmap/ping` → {"ok":true}，前端探测「编辑保存服务是否可用」；
 *   build/preview 产物下该路由 404，前端据此隐藏编辑入口。
 * - PUT `<apiBase>/mindmap` → body 形如 {"path":"notes/xxx.mindmap.json","data":{…}}，
 *   校验通过后原子写入 vault 内对应文件。
 *
 * 安全（与静态资源服务同思路，且更严——写比读危险）：
 * - path 必须以完整后缀 .mindmap.json 结尾（拒绝 .md / 通用 .json 等一切其他后缀，
 *   防止误覆盖笔记或任意文件）；
 * - 不含 \0 与 ".." 路径段；decodeURIComponent + path.resolve 后必须仍位于 vaultDir
 *   内（防目录穿越）；
 * - 不得落在工程/隐私目录（内置 + extraSkipDirs 合并后的跳过目录，任一路径段
 *   命中即拒）与隐藏目录内——这些目录同样不会进 build 产物（collectAssets 跳过），
 *   保持 dev 可写面与产物一致；
 * - data 必须是对象且含 root.data（mind-map 的导图数据根节点结构）；
 * - 落盘用 <dest>.tmp + renameSync 原子写，避免半截 JSON；异常返回 500 不崩进程。
 */

const SUFFIX = ".mindmap.json";

/** body 大小上限：导图数据通常远小于此，防御异常超大请求 */
const MAX_BODY_BYTES = 32 * 1024 * 1024;

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(Buffer.byteLength(body)));
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("body 超过大小上限"), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (err) => reject(err));
  });
}

interface MindmapApiContext {
  vaultDir: string;
  apiBase: string;
  skipDirs: Set<string>;
}

function mindmapApiContext(options: LocalNotesOptions): MindmapApiContext {
  const resolved = resolveLocalNotesOptions(options);
  return {
    vaultDir: path.resolve(resolved.vaultDir),
    apiBase: resolved.apiBase,
    skipDirs: new Set(resolved.skipDirs),
  };
}

/** 校验并解析请求里的相对路径为 vault 内绝对路径；不合法返回原因 */
function resolveMindmapTarget(ctx: MindmapApiContext, rawRel: unknown): { abs: string } | { error: string } {
  const vaultDir = ctx.vaultDir;
  if (typeof rawRel !== "string" || rawRel.trim() === "") return { error: "path 必须是非空字符串" };
  if (rawRel.includes("\0")) return { error: "path 非法（含空字节）" };
  let rel: string;
  try {
    rel = decodeURIComponent(rawRel);
  } catch {
    return { error: "path URL 编码非法" };
  }
  const segs = rel.split(/[\\/]+/).filter(Boolean);
  if (segs.length === 0) return { error: "path 必须是非空字符串" };
  for (const seg of segs) {
    if (seg === "..") return { error: "path 不允许包含 .. 路径段" };
    if (seg.startsWith(".")) return { error: `path 不允许指向隐藏目录/文件：${seg}` };
    if (ctx.skipDirs.has(seg)) return { error: `path 不允许落在工程/隐私目录内：${seg}` };
  }
  // 完整后缀特判：extname 会把 a.mindmap.json 判成 .json，必须按文件名整体判断
  if (!rel.toLowerCase().endsWith(SUFFIX)) return { error: "path 必须以 .mindmap.json 结尾" };
  const abs = path.resolve(vaultDir, rel);
  // 目录穿越防护：解析结果必须仍在 vaultDir 内
  if (abs !== vaultDir && !abs.startsWith(vaultDir + path.sep)) {
    return { error: "path 越出 vault 根目录" };
  }
  return { abs };
}

/** 校验导图数据结构：data 为对象且含 root.data（mind-map 根节点） */
function validateMindmapData(data: unknown): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return "data 必须是对象";
  const root = (data as { root?: unknown }).root;
  if (typeof root !== "object" || root === null || Array.isArray(root)) return "data.root 缺失";
  if ((root as { data?: unknown }).data === undefined) return "data.root.data 缺失";
  return null;
}

async function handlePut(ctx: MindmapApiContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const contentType = String(req.headers["content-type"] ?? "");
    if (!contentType.toLowerCase().includes("application/json")) {
      return sendJson(res, 400, { error: "Content-Type 必须为 application/json" });
    }

    let raw: string;
    try {
      raw = await readBody(req);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode === 413 ? 413 : 400;
      return sendJson(res, status, { error: (e as Error)?.message ?? "读取请求体失败" });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: "body 不是合法 JSON" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return sendJson(res, 400, { error: "body 必须是 JSON 对象" });
    }
    const { path: relPath, data } = body as { path?: unknown; data?: unknown };

    const target = resolveMindmapTarget(ctx, relPath);
    if ("error" in target) return sendJson(res, 400, { error: target.error });

    const dataError = validateMindmapData(data);
    if (dataError) return sendJson(res, 400, { error: dataError });

    // 原子写：先写同目录 .tmp 再 rename，避免半截文件；父目录不存在则递归创建
    const content = JSON.stringify(data, null, 2) + "\n";
    fs.mkdirSync(path.dirname(target.abs), { recursive: true });
    const tmp = target.abs + ".tmp";
    try {
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, target.abs);
    } catch (e) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* 清理失败忽略，原文件未受影响 */
      }
      throw e;
    }

    const mtime = fs.statSync(target.abs).mtimeMs;
    return sendJson(res, 200, { ok: true, mtime });
  } catch (e) {
    // 兜底：任何服务端异常都返回 500 JSON，绝不让进程崩溃
    return sendJson(res, 500, { error: `写入失败：${(e as Error)?.message ?? String(e)}` });
  }
}

export function mindmapApiPlugin(options: LocalNotesOptions): Plugin {
  const ctx = mindmapApiContext(options);
  const route = (suffix: string): string => (ctx.apiBase + suffix).replace(/\/{2,}/g, "/");
  return {
    name: "local-notes:mindmap-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        try {
          if (url === route("/mindmap/ping")) {
            if (req.method !== "GET") return sendJson(res, 405, { error: "仅支持 GET" });
            return sendJson(res, 200, { ok: true });
          }
          if (url === route("/mindmap")) {
            if (req.method !== "PUT") return sendJson(res, 405, { error: "仅支持 PUT" });
            return void handlePut(ctx, req, res);
          }
        } catch (e) {
          // 路由分派层的最后防线：任何同步异常都以 JSON 500 应答而非崩进程
          return sendJson(res, 500, { error: `服务异常：${(e as Error)?.message ?? String(e)}` });
        }
        return next();
      });
    },
  };
}
