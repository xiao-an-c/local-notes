import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { LocalNotesOptions } from "../options.ts";
import { resolveLocalNotesOptions } from "../options.ts";
import { trackSelfWrite } from "./selfWrite.ts";

/**
 * vault markdown 读写/新建 API（仅 dev 生效，apply: "serve"）
 *
 * 站点编辑模式（Monaco 在线编辑）需要浏览器按 vault 相对路径读写笔记原文，
 * 本插件在 dev 中间件提供五个 REST 路由（骨架与思维导图保存 API 一致）：
 *
 * - GET `<apiBase>/md/ping` → {"ok":true}，前端探测「编辑服务是否可用」；
 *   build/preview 产物下该路由 404，前端据此隐藏编辑入口。
 * - GET `<apiBase>/md?path=<vault相对路径.md>` → {"content":"<原文全文>","mtime":<mtimeMs>}，
 *   原文以 UTF-8 全文返回，不做任何转换。
 * - PUT `<apiBase>/md` → body {"path":"notes/xxx.md","content":"<全文>","baseMtime":<可选>}，
 *   校验通过后原子写回 vault 内对应文件；成功 → {"ok":true,"mtime":<新mtimeMs>}。
 * - GET `<apiBase>/md/dirs` → {"dirs":[…],"templates":[…],"templateDir":"…"}，
 *   递归收集 vault 内可放笔记的已存在目录（供前端「新建笔记」做目录映射选择）；
 *   仅当 options.templateDir 配置时才附带该目录下的模板 md 列表与目录名
 *   （未配置 → 响应不含 templates/templateDir 字段）。
 * - POST `<apiBase>/md` → body {"path":"notes/新笔记.md","template":"…"(可选)}，
 *   在已有目录内新建笔记（template 给定则拷贝模板内容，否则仅一级标题=文件名）；
 *   成功 → 201 {"ok":true,"path":...}。未配置 templateDir 时 template 字段不被
 *   接受（携带即 400）。
 *
 * 新建范围：POST 只在**已存在**目录内建文件（第一版不支持新建目录），
 * 父目录不存在 → 400「目录不存在」；文件已存在 → 409「文件已存在」。
 * 编辑/新建范围 = 全部 vault 笔记 md（单段 md 文件名不命中隐藏目录/跳过目录
 * 检查，天然放行）。
 *
 * 安全（与思维导图保存 API 同款校验链，且更严——md 是笔记本体）：
 * - path 必须以 .md 结尾（拒绝 .mindmap.json / .json / 其他一切后缀）；
 * - 不含 \0 与 ".." 路径段；decodeURIComponent + path.resolve 后必须仍位于 vaultDir
 *   内（防目录穿越）；
 * - 不得落在工程/隐私目录（内置 + extraSkipDirs 合并后的跳过目录，任一路径段
 *   命中即拒）与隐藏目录/文件内；
 * - content 必须是 string（允许空串）；
 * - 乐观锁冲突检测：body 带数字 baseMtime 且与当前文件 mtimeMs 不符（文件被
 *   外部工具改过）→ 409 不落盘；未带 baseMtime 则跳过检测（盲写）；
 * - 落盘用 <dest>.tmp + renameSync 原子写（UTF-8 无 BOM），异常返回 500 不崩进程。
 */

const SUFFIX = ".md";

/** body 大小上限：笔记全文远小于此，防御异常超大请求 */
const MAX_BODY_BYTES = 32 * 1024 * 1024;

/** baseMtime 比较容差（ms）：容忍 JSON 往返/客户端取整造成的亚毫秒误差 */
const MTIME_EPSILON = 1;

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

interface MdApiContext {
  vaultDir: string;
  apiBase: string;
  /** 模板目录（相对 vault，posix）；undefined = 不启用模板能力 */
  templateDir?: string;
  skipDirs: Set<string>;
}

function mdApiContext(options: LocalNotesOptions): MdApiContext {
  const resolved = resolveLocalNotesOptions(options);
  return {
    vaultDir: path.resolve(resolved.vaultDir),
    apiBase: resolved.apiBase,
    templateDir: resolved.templateDir?.replaceAll("\\", "/").replace(/\/+$/, "") || undefined,
    skipDirs: new Set(resolved.skipDirs),
  };
}

/** 校验并解析请求里的相对路径为 vault 内绝对路径；不合法返回原因 */
function resolveMdTarget(ctx: MdApiContext, rawRel: unknown): { abs: string } | { error: string } {
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
  if (!rel.toLowerCase().endsWith(SUFFIX)) return { error: "path 必须以 .md 结尾（仅支持编辑 vault 笔记）" };
  const abs = path.resolve(vaultDir, rel);
  // 目录穿越防护：解析结果必须仍在 vaultDir 内
  if (abs !== vaultDir && !abs.startsWith(vaultDir + path.sep)) {
    return { error: "path 越出 vault 根目录" };
  }
  return { abs };
}

/**
 * 从 `<apiBase>/md?path=...` 的查询串里取 path 参数原始值（保持百分号编码，由
 * resolveMdTarget 统一解码一次，与思维导图保存 API 的解码层数一致）。
 *
 * 先做 latin1→utf8 修复再取参：curl 等客户端可能直接发送原始 UTF-8 字节路径，
 * Node 按 latin1 解析请求行成乱码；而浏览器发送的百分号编码 URL 为纯 ASCII，
 * 修复是空操作，两种客户端统一覆盖。UTF-8 多字节序列不含 ASCII 字节，
 * 修复不影响 ? & = 等分隔符的定位。
 */
function extractPathParam(rawUrl: string): { rawValue?: string; error?: string } {
  const qIndex = rawUrl.indexOf("?");
  if (qIndex < 0) return {};
  const query = Buffer.from(rawUrl.slice(qIndex + 1), "latin1").toString("utf8");
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    const key = eq < 0 ? pair : pair.slice(0, eq);
    if (key !== "path") continue;
    const rawValue = eq < 0 ? "" : pair.slice(eq + 1);
    // 预检编码合法性（真正的解码在 resolveMdTarget 中统一做），坏编码提前 400
    try {
      decodeURIComponent(rawValue);
    } catch {
      return { error: "path URL 编码非法" };
    }
    return { rawValue };
  }
  return {};
}

/** 文件存在且为普通文件则返回 stat，否则返回 null */
function statIfExists(abs: string): fs.Stats | null {
  try {
    const st = fs.statSync(abs);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

function handleGet(ctx: MdApiContext, res: ServerResponse, rawUrl: string): void {
  const { rawValue, error } = extractPathParam(rawUrl);
  if (error) return void sendJson(res, 400, { error });
  const target = resolveMdTarget(ctx, rawValue);
  if ("error" in target) return void sendJson(res, 400, { error: target.error });
  const stat = statIfExists(target.abs);
  if (!stat) return void sendJson(res, 404, { error: "文件不存在" });
  const content = fs.readFileSync(target.abs, "utf8");
  return void sendJson(res, 200, { content, mtime: stat.mtimeMs });
}

async function handlePut(ctx: MdApiContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const contentType = String(req.headers["content-type"] ?? "");
    if (!contentType.toLowerCase().includes("application/json")) {
      return void sendJson(res, 400, { error: "Content-Type 必须为 application/json" });
    }

    let raw: string;
    try {
      raw = await readBody(req);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode === 413 ? 413 : 400;
      return void sendJson(res, status, { error: (e as Error)?.message ?? "读取请求体失败" });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return void sendJson(res, 400, { error: "body 不是合法 JSON" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return void sendJson(res, 400, { error: "body 必须是 JSON 对象" });
    }
    const { path: relPath, content, baseMtime } = body as {
      path?: unknown;
      content?: unknown;
      baseMtime?: unknown;
    };

    const target = resolveMdTarget(ctx, relPath);
    if ("error" in target) return void sendJson(res, 400, { error: target.error });
    if (typeof content !== "string") return void sendJson(res, 400, { error: "content 必须是字符串（允许空串）" });

    // 只做已有文件读写：文件必须已存在
    const stat = statIfExists(target.abs);
    if (!stat) return void sendJson(res, 404, { error: "文件不存在" });

    // 冲突检测：带数字 baseMtime 才启用；当前 mtime 与之不符说明文件已被
    // 外部工具改过 → 409 且绝不落盘；未带 baseMtime 则盲写
    if (typeof baseMtime === "number" && Number.isFinite(baseMtime)) {
      if (Math.abs(stat.mtimeMs - baseMtime) > MTIME_EPSILON) {
        return void sendJson(res, 409, { error: "文件已被外部修改", mtime: stat.mtimeMs });
      }
    }

    // 原子写：先写同目录 .tmp 再 rename，避免半截文件；UTF-8 无 BOM 原样写入。
    // 注意：rename 在 fs.watch 里产生的事件 filename 已是最终 .md 名（.tmp 过滤
    // 拦不住），必须先 trackSelfWrite 标记——这是库自身的内容保存，不该触发
    // 自动重启（否则保存 → 重启 → 页面刷新 → 编辑态被销毁）
    trackSelfWrite(target.abs);
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
    return void sendJson(res, 200, { ok: true, mtime });
  } catch (e) {
    // 兜底：任何服务端异常都返回 500 JSON，绝不让进程崩溃
    return void sendJson(res, 500, { error: `写入失败：${(e as Error)?.message ?? String(e)}` });
  }
}

/**
 * 递归收集 vault 内可放笔记的已存在目录（相对 posix 路径）与模板目录下的模板 md。
 *
 * 目录收集规则（与站点侧扫描的排除口径一致）：
 * - 排除跳过目录（内置 + extraSkipDirs 合并后的工程/隐私目录）；
 * - 排除隐藏目录（.obsidian/.git/...）与符号链接目录（不跟随——符号链接
 *   目录树往往与本体重复，跟随会重复收集）；
 * - 收集到的每个目录本身必然通过 resolveMdTarget 的逐段校验——POST 的
 *   「父目录必须已存在」即可安全地按磁盘存在性判定（两者等价）。
 *
 * 模板收集仅在 ctx.templateDir 配置时进行（该目录树下的 .md）。
 */
function collectDirsAndTemplates(ctx: MdApiContext): { dirs: string[]; templates: string[] } {
  const vaultDir = ctx.vaultDir;
  const dirs: string[] = [];
  const templates: string[] = [];

  const walk = (base: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(base ? path.join(vaultDir, base) : vaultDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (e.name.startsWith(".") || ctx.skipDirs.has(e.name)) continue;
        const rel = base ? `${base}/${e.name}` : e.name;
        dirs.push(rel);
        walk(rel);
      } else if (e.isFile() && base) {
        // 模板清单：仅模板目录树下的 .md（供前端「可选套用模板」下拉）
        const rel = `${base}/${e.name}`;
        if (
          ctx.templateDir &&
          rel.startsWith(ctx.templateDir + "/") &&
          e.name.toLowerCase().endsWith(SUFFIX)
        ) {
          templates.push(rel);
        }
      }
    }
  };
  walk("");

  const coll = "zh-Hans-CN";
  dirs.sort((a, b) => a.localeCompare(b, coll));
  templates.sort((a, b) => a.localeCompare(b, coll));
  return { dirs, templates };
}

function handleGetDirs(ctx: MdApiContext, res: ServerResponse): void {
  const { dirs, templates } = collectDirsAndTemplates(ctx);
  // 未配置 templateDir：不返回模板列表与目录名（模板能力整体关闭）
  if (!ctx.templateDir) return void sendJson(res, 200, { dirs });
  return void sendJson(res, 200, { dirs, templates, templateDir: ctx.templateDir });
}

async function handlePost(ctx: MdApiContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const contentType = String(req.headers["content-type"] ?? "");
    if (!contentType.toLowerCase().includes("application/json")) {
      return void sendJson(res, 400, { error: "Content-Type 必须为 application/json" });
    }

    let raw: string;
    try {
      raw = await readBody(req);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode === 413 ? 413 : 400;
      return void sendJson(res, status, { error: (e as Error)?.message ?? "读取请求体失败" });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return void sendJson(res, 400, { error: "body 不是合法 JSON" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return void sendJson(res, 400, { error: "body 必须是 JSON 对象" });
    }
    const { path: relPath, template } = body as { path?: unknown; template?: unknown };

    // path 走与 PUT 完全相同的校验链（.md 后缀/防穿越/隐藏目录/跳过目录/decode+resolve）
    const target = resolveMdTarget(ctx, relPath);
    if ("error" in target) return void sendJson(res, 400, { error: target.error });

    // 未配置 templateDir：template 字段不被接受（携带即 400，显式拒绝优于静默忽略）
    if (template !== undefined && template !== null && !ctx.templateDir) {
      return void sendJson(res, 400, { error: "模板功能未启用（未配置 templateDir），不接受 template 字段" });
    }

    // 父目录必须已存在（不支持新建目录）。vault 根本身视为已存在目录
    // （根级 md 的既有位置，与 PUT 的可编辑范围对齐）；其余父目录逐段已过
    // 校验链，磁盘存在性 ⇔ 出现在 `<apiBase>/md/dirs` 的列表内。
    const root = ctx.vaultDir;
    const parentAbs = path.dirname(target.abs);
    if (parentAbs !== root) {
      let parentOk = false;
      try {
        parentOk = fs.statSync(parentAbs).isDirectory();
      } catch {
        /* 不存在 */
      }
      if (!parentOk) {
        return void sendJson(res, 400, { error: "目录不存在，请从已有目录中选择（暂不支持新建目录）" });
      }
    }

    // 文件必须不存在（新建语义，与 PUT 的「必须存在」互为镜像）
    if (statIfExists(target.abs)) return void sendJson(res, 409, { error: "文件已存在" });

    // 模板校验：必须是模板目录下的已存在 .md（同时过一遍校验链拒绝穿越等）
    let content: string | null = null;
    if (typeof template === "string" && template.trim() !== "" && ctx.templateDir) {
      const tpl = resolveMdTarget(ctx, template);
      if ("error" in tpl) return void sendJson(res, 400, { error: `模板路径非法：${tpl.error}` });
      const templateRoot = path.join(root, ctx.templateDir);
      if (!tpl.abs.startsWith(templateRoot + path.sep)) {
        return void sendJson(res, 400, { error: `模板必须是 ${ctx.templateDir}/ 下的 .md 文件` });
      }
      if (!statIfExists(tpl.abs)) return void sendJson(res, 400, { error: "模板不存在" });
      content = fs.readFileSync(tpl.abs, "utf8");
    } else if (template !== undefined && template !== null) {
      return void sendJson(res, 400, { error: "template 必须是字符串（可省略）" });
    }

    // 未套模板：仅一级标题=文件名（去 .md 后缀），比全空文件对预览/大纲更友好
    if (content === null) {
      const base = path.basename(target.abs);
      content = `# ${base.slice(0, -SUFFIX.length)}\n`;
    }

    // 原子写（不 mkdir——父目录必须已存在，与校验语义一致）。
    // 注意：这里**故意不** trackSelfWrite——新建是文件新增，侧栏需要重启重建
    // 才能出现新条目（前端创建后的跳转是整页导航，拿到的是重启后的新侧栏）。
    // rename 事件的 filename 已是最终 .md 名，autoRestart 会照常重启，符合预期。
    const tmp = target.abs + ".tmp";
    try {
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, target.abs);
    } catch (e) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* 清理失败忽略，磁盘未留半截文件 */
      }
      throw e;
    }

    // 回给前端规范化的 posix 相对路径（后续 GET/PUT/页面跳转都基于它）
    const rel = path.relative(root, target.abs).replaceAll(path.sep, "/");
    return void sendJson(res, 201, { ok: true, path: rel });
  } catch (e) {
    // 兜底：任何服务端异常都返回 500 JSON，绝不让进程崩溃
    return void sendJson(res, 500, { error: `新建失败：${(e as Error)?.message ?? String(e)}` });
  }
}

export function mdApiPlugin(options: LocalNotesOptions): Plugin {
  const ctx = mdApiContext(options);
  const route = (suffix: string): string => (ctx.apiBase + suffix).replace(/\/{2,}/g, "/");
  return {
    name: "local-notes:md-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        const pathname = url.split("?")[0];
        try {
          if (pathname === route("/md/ping")) {
            if (req.method !== "GET") return void sendJson(res, 405, { error: "仅支持 GET" });
            return void sendJson(res, 200, { ok: true });
          }
          if (pathname === route("/md/dirs")) {
            if (req.method !== "GET") return void sendJson(res, 405, { error: "仅支持 GET" });
            return void handleGetDirs(ctx, res);
          }
          if (pathname === route("/md")) {
            if (req.method === "GET") return void handleGet(ctx, res, url);
            if (req.method === "PUT") return void handlePut(ctx, req, res);
            if (req.method === "POST") return void handlePost(ctx, req, res);
            return void sendJson(res, 405, { error: "仅支持 GET / PUT / POST" });
          }
        } catch (e) {
          // 路由分派层的最后防线：任何同步异常都以 JSON 500 应答而非崩进程
          return void sendJson(res, 500, { error: `服务异常：${(e as Error)?.message ?? String(e)}` });
        }
        return next();
      });
    },
  };
}
