import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { LocalNotesOptions } from "../options";
import { resolveLocalNotesOptions } from "../options";

/**
 * vault 静态资源服务插件
 *
 * vault 笔记正文引用的 PDF / EPUB 等附件散落在 vault 各处，VitePress 只会
 * 处理 md 与显式 import 的资源，浏览器需要能直接按 URL 拿到这些附件，
 * 才能用 <iframe> 内嵌预览。
 *
 * - dev：configureServer 挂中间件，把 `<assetPrefix>/<相对路径>` 映射到 vault 根
 *   目录下的真实文件，支持 Range（浏览器内置 PDF 阅读器按需拉流，大文件不整包下载）。
 * - build：closeBundle 时把白名单后缀的附件增量拷贝到 `<outDir>/<assetPrefix 去斜杠>/`，
 *   以 mtime+size 判断是否需要拷贝，重复构建几乎零开销。
 *
 * 安全：只允许白名单后缀（含 .mindmap.json 完整后缀特判，思维导图数据文件）；
 * 解析后路径必须仍位于 vaultDir 内（防目录穿越）；扫描/拷贝一律跳过
 * 内置 + extraSkipDirs 合并后的目录（工程与隐私目录）。
 */

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".mobi": "application/x-mobipocket-ebook",
  ".azw3": "application/vnd.amazon.ebook",
  ".djvu": "image/vnd.djvu",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // 研报 HTML（WorkBuddy 等工具产出的自包含交互报告）：与 .txt 同级的纯文本资源，
  // 供 HtmlView 组件 <iframe> 内嵌渲染（脚本可执行，ECharts 正常出图）
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
};

const SERVE_EXTS = new Set(Object.keys(MIME));

/**
 * 思维导图数据文件的完整后缀特判。
 *
 * 坑：path.extname("a.mindmap.json") 返回 ".json"，不能把 ".json" 加进 SERVE_EXTS——
 * 那会让 dev 服务暴露、build 拷贝全库所有 json。必须按文件名整体 endsWith 判断。
 */
export const MINDMAP_SUFFIX = ".mindmap.json";
const MINDMAP_MIME = "application/json; charset=utf-8";

function isMindmapFile(name: string): boolean {
  return name.toLowerCase().endsWith(MINDMAP_SUFFIX);
}

/** 资源 URL 前缀规范化：保证以 "/" 开头、以 "/" 结尾（便于 startsWith / slice） */
function normalizePrefix(raw: string): string {
  let p = raw.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  if (!p.endsWith("/")) p = `${p}/`;
  return p;
}

function mimeOf(filePath: string): string {
  if (isMindmapFile(filePath)) return MINDMAP_MIME;
  return MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/** 把站点内 `<assetPrefix>xxx` 的 URL 解析为 vault 内真实文件路径；不合法返回 null */
function resolveVaultFile(vaultDirRaw: string, prefix: string, skipDirs: Set<string>, rawUrl: string): string | null {
  const vaultDir = path.resolve(vaultDirRaw);
  let pathname: string;
  try {
    pathname = decodeURIComponent(rawUrl.split("?")[0] ?? "");
  } catch {
    return null;
  }
  if (!pathname.startsWith(prefix)) return null;
  const rel = pathname.slice(prefix.length);
  if (!rel || rel.includes("\0")) return null;
  // URL 目录段命中跳过目录时拒绝服务（与写 API 的段级校验同口径）
  if (rel.split("/").some((seg) => skipDirs.has(seg))) return null;
  const abs = path.resolve(vaultDir, rel);
  // 目录穿越防护：解析结果必须仍在 vaultDir 内
  if (abs !== vaultDir && !abs.startsWith(vaultDir + path.sep)) return null;
  // .mindmap.json 完整后缀特判放行（思维导图数据），通用 .json 仍然拒绝
  if (!isMindmapFile(abs) && !SERVE_EXTS.has(path.extname(abs).toLowerCase())) return null;
  return abs;
}

function sendFile(req: IncomingMessage, res: ServerResponse, filePath: string) {
  const stat = fs.statSync(filePath);
  const mime = mimeOf(filePath);
  const range = req.headers.range;
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;

  if (m && stat.size > 0) {
    let start: number;
    let end: number;
    if (m[1] === "") {
      // 后缀语义 bytes=-N：取末尾 N 字节
      start = Math.max(0, stat.size - Number(m[2] || 0));
      end = stat.size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? stat.size - 1 : Math.min(Number(m[2]), stat.size - 1);
    }
    if (start >= stat.size || start > end) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    res.setHeader("Content-Type", mime);
    res.setHeader("Accept-Ranges", "bytes");
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-cache"); // vault 内容常更新，避免 dev 期间陈旧缓存
  fs.createReadStream(filePath).pipe(res);
}

/** 递归收集 vault 内指定后缀（默认白名单后缀）附件的相对路径列表 */
export function collectAssets(
  vaultDirRaw: string,
  skipDirs: Iterable<string>,
  exts: Set<string> = SERVE_EXTS,
  base = "",
  out: string[] = [],
): string[] {
  const vaultDir = path.resolve(vaultDirRaw);
  const skipped = skipDirs instanceof Set ? skipDirs : new Set(skipDirs);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(base ? path.join(vaultDir, base) : vaultDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (skipped.has(e.name) || e.name.startsWith(".")) continue;
      collectAssets(vaultDir, skipped, exts, rel, out);
    } else if (
      e.isFile() &&
      (exts.has(path.extname(e.name).toLowerCase()) ||
        // .mindmap.json 特判只属于完整服务白名单（默认参数）；显式传入自定义
        // 白名单的调用方（如侧栏只收 PDF/EPUB）不受影响
        (exts === SERVE_EXTS && isMindmapFile(e.name)))
    ) {
      out.push(rel);
    }
  }
  return out;
}

/** 从 resolved 配置构造本插件族共用的目录穿越防护/跳过参数 */
interface VaultAssetContext {
  vaultDir: string;
  prefix: string;
  skipDirs: Set<string>;
}

function assetContext(options: LocalNotesOptions): VaultAssetContext {
  const resolved = resolveLocalNotesOptions(options);
  return {
    vaultDir: path.resolve(resolved.vaultDir),
    prefix: normalizePrefix(resolved.assetPrefix),
    skipDirs: new Set(resolved.skipDirs),
  };
}

export function vaultAssetPlugin(options: LocalNotesOptions): Plugin {
  const ctx = assetContext(options);
  return {
    name: "local-notes:vault-assets",
    apply: "serve",
    configureServer(server) {
      const tryServe = (rawUrl: string): string | null => {
        const filePath = resolveVaultFile(ctx.vaultDir, ctx.prefix, ctx.skipDirs, rawUrl);
        if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
        return filePath;
      };
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith(ctx.prefix) && !url.startsWith(`/${encodeURIComponent(ctx.prefix.replaceAll("/", ""))}/`))
          return next();
        let filePath = tryServe(url);
        if (!filePath) {
          // 兼容直接发送原始 UTF-8 字节路径的客户端（curl 等）：Node 会把请求行
          // 按 latin1 解码成乱码字符串，还原字节后按 UTF-8 重解出真实中文路径；
          // 浏览器发送的百分号编码 URL 走上面的常规分支，不受影响
          const repaired = Buffer.from(url, "latin1").toString("utf8");
          if (repaired !== url) filePath = tryServe(repaired);
        }
        if (!filePath) return next();
        try {
          sendFile(req, res, filePath);
        } catch {
          res.statusCode = 500;
          res.end();
        }
      });
    },
    // apply: "serve" 下 closeBundle 不会执行；build 拷贝放在独立插件里
  };
}

/** build 时增量拷贝 vault 附件到 `<outDir>/<assetPrefix 去斜杠>/`，保证产物站点同样可预览 */
export function vaultAssetCopyPlugin(options: LocalNotesOptions): Plugin {
  const resolved = resolveLocalNotesOptions(options);
  const ctx = assetContext(resolved);
  const outDir = path.resolve(resolved.outDir ?? "dist");
  return {
    name: "local-notes:vault-assets-copy",
    apply: "build",
    closeBundle() {
      const targetRoot = path.join(outDir, ctx.prefix.replaceAll("/", ""));
      const assets = collectAssets(ctx.vaultDir, ctx.skipDirs);
      let copied = 0;
      for (const rel of assets) {
        const src = path.join(ctx.vaultDir, rel);
        const dest = path.join(targetRoot, rel);
        try {
          const st = fs.statSync(src);
          const existing = fs.existsSync(dest) ? fs.statSync(dest) : null;
          // 增量：目标已存在且大小/mtime 一致则跳过
          if (existing && existing.size === st.size && existing.mtimeMs >= st.mtimeMs) continue;
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(src, dest);
          fs.utimesSync(dest, st.atime, st.mtime);
          copied++;
        } catch {
          // 单个文件失败不阻断构建
        }
      }
      console.log(
        `[local-notes:vault-assets] ${assets.length} 个附件已就绪，本次拷贝 ${copied} 个 → ${path.relative(process.cwd(), targetRoot) || targetRoot}/`,
      );
    },
  };
}
