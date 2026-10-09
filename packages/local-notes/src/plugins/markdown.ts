import fs from "node:fs";
import path from "node:path";
import type MarkdownIt from "markdown-it";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type { LocalNotesOptions } from "../options.ts";
import { resolveLocalNotesOptions } from "../options.ts";
import { collectAssets } from "./vaultAsset.ts";

/** markdown-it 插件形态（与 `md.use(...)` 兼容） */
export type MarkdownItPlugin = (md: MarkdownIt) => void;

/**
 * PDF 链接自动内嵌预览（markdown-it 插件，装进 `markdown.config`，
 * 且须注册在双向链接插件（如 @nolebase/markdown-it-bi-directional-links）
 * 之前——只拦截 .pdf 目标，普通 md wikilink 不受影响）
 *
 * 让 vault 笔记里的 PDF 引用在站点里获得「直接内嵌预览」体验：
 *
 * 1. markdown 链接：[年报](01-文献笔记/xx/605090-y2021.pdf)
 *    → 自动替换为 <PdfViewer> 内嵌预览卡片。
 *    - 外链（http/https）不处理，保持普通链接
 *    - href 带 `?embed=0` 可 opting-out 保持普通链接
 *    - href 带 `#page=38` 会定位到第 38 页
 * 2. Obsidian wikilink：[[01-文献笔记/xx/605090-y2021.pdf|2021年报]]
 *    以及 ![[605090-y2021.pdf]] 嵌入语法 → 同样替换为预览卡片；
 *    不含路径时按文件名在 vault 内索引解析（Obsidian 短路径习惯）。
 *
 * 解析失败的（文件不存在）一律保持原样，不吞链接。
 *
 * 用法：
 * ```ts
 * markdown: {
 *   config(md) {
 *     // 或用组合入口 localNotesMarkdownItPlugins(options) 一次装齐
 *     md.use(pdfEmbedPlugin({ vaultDir: ".." }));
 *     md.use(BiDirectionalLinks({ ... })); // 必须在双向链接之后
 *   },
 * }
 * ```
 */

function escapeAttr(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** vault 相对路径 → 站点 `<assetPrefix>` URL（逐段 encodeURIComponent） */
function toVaultUrl(prefix: string, rel: string): string {
  return prefix + rel.split("/").map(encodeURIComponent).join("/");
}

function viewerHtml(src: string, title: string, page?: number): string {
  const attrs = [`src="${escapeAttr(src)}"`];
  if (title) attrs.push(`title="${escapeAttr(title)}"`);
  if (page && Number.isFinite(page)) attrs.push(`:page="${page}"`);
  return `<PdfViewer ${attrs.join(" ")} />`;
}

/** 剥掉 href 上的 #hash 与 ?query，返回 (干净路径, page, 原始后缀) */
function splitHref(href: string): { clean: string; page?: number; embedOff: boolean } {
  const [beforeHash = "", hash = ""] = href.split("#", 2);
  const [clean = "", query = ""] = beforeHash.split("?", 2);
  const m = /(?:^|&|;)page=(\d+)/.exec(hash.startsWith("page=") ? hash : `&${hash}`);
  return {
    clean,
    page: m ? Number(m[1]) : undefined,
    embedOff: /(?:^|&)embed=0(?:&|$)/.test(query) || /(?:^|&|;)embed=0/.test(hash),
  };
}

/** 判断是否站内文件链接（排除外链/锚点/邮件等） */
function isInternalFileHref(href: string): boolean {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href);
}

export function pdfEmbedPlugin(options: LocalNotesOptions): MarkdownItPlugin {
  const resolved = resolveLocalNotesOptions(options);
  // 规范化（调用方可能传 cwd + "/.." 这类未规整路径，startsWith 校验会失效）
  const vaultDir = path.resolve(resolved.vaultDir);
  // 附件 URL 前缀（保证以 "/" 开头结尾，与主题侧 assetPrefix 配置一致）
  let prefix = resolved.assetPrefix.trim();
  if (!prefix.startsWith("/")) prefix = `/${prefix}`;
  if (!prefix.endsWith("/")) prefix = `${prefix}/`;
  // 文件名 → vault 相对路径 索引（懒构建，供 Obsidian 短路径 wikilink 解析）
  let nameIndex: Map<string, string[]> | null = null;
  const getIndex = () => {
    if (!nameIndex) {
      nameIndex = new Map();
      for (const rel of collectAssets(vaultDir, new Set(resolved.skipDirs), new Set([".pdf"]))) {
        const name = path.basename(rel);
        const list = nameIndex.get(name);
        if (list) list.push(rel);
        else nameIndex.set(name, [rel]);
      }
    }
    return nameIndex;
  };

  /** 解析一个 vault 内 PDF 目标（存在性校验），失败返回 null
   *
   * wikilink 的路径语义是 Obsidian 式「vault 根相对/短路径」；
   * markdown 链接是「当前 md 文件目录相对」，逃出 vault 根时回退按根相对解析。
   */
  const resolveTarget = (
    rawTarget: string,
    currentRelDir: string,
    mode: "wikilink" | "mdlink",
  ): { rel: string; name: string } | null => {
    let target = rawTarget.trim();
    try {
      target = decodeURIComponent(target);
    } catch {
      /* 保留原样 */
    }
    if (!/\.pdf$/i.test(target)) return null;

    const candidates: string[] = [];
    if (target.startsWith(prefix)) {
      candidates.push(target.slice(prefix.length));
    } else if (target.startsWith("/")) {
      candidates.push(target.slice(1));
    } else if (mode === "wikilink" && target.includes("/")) {
      // Obsidian 全路径：vault 根相对；找不到再试当前目录相对（容错）
      candidates.push(path.posix.normalize(target));
      candidates.push(path.posix.normalize(path.posix.join(currentRelDir, target)));
      candidates.push(...(getIndex().get(path.basename(target)) ?? []));
    } else if (target.includes("/")) {
      // 相对当前 md 文件目录解析；逃出 vault 根则回退按 vault 根相对解析
      const joined = path.posix.normalize(path.posix.join(currentRelDir, target));
      candidates.push(joined.startsWith("..") ? path.posix.normalize(target.replace(/^\.\.?\//, "")) : joined);
    } else {
      // Obsidian 短路径：按文件名索引（取路径最浅的第一个）
      candidates.push(...(getIndex().get(path.basename(target)) ?? []));
    }

    for (const rel of candidates) {
      const abs = path.resolve(vaultDir, rel);
      if (abs.startsWith(vaultDir + path.sep) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        return { rel, name: path.basename(rel) };
      }
    }
    return null;
  };

  return (md) => {
    // ---- 1) Obsidian wikilink：[[xx.pdf|别名]] / ![[xx.pdf]] ----
    // 注册在 BiDirectionalLinks 之前，只拦截 .pdf 目标，md wikilink 不受影响
    md.inline.ruler.before("link", "pdf_wikilink", (state: StateInline, silent) => {
      const m = /^(!?)\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/.exec(state.src.slice(state.pos));
      if (!m) return false;
      if (!/\.pdf$/i.test((m[2] ?? "").trim())) return false; // 交给 BiDirectionalLinks 处理 md wikilink

      const alias = m[3]?.trim();
      const currentRelDir = path.posix.dirname((state.env?.relativePath as string) ?? ".");
      const resolvedTarget = resolveTarget(m[2] ?? "", currentRelDir, "wikilink");
      if (!resolvedTarget) return false; // 解析失败保持原样
      if (silent) return true;

      const token = state.push("html_inline", "", 0);
      token.content = viewerHtml(toVaultUrl(prefix, resolvedTarget.rel), alias || resolvedTarget.name);
      state.pos += m[0].length;
      return true;
    });

    // ---- 2) markdown 链接：[text](xx.pdf) → 内嵌预览 ----
    md.core.ruler.push("pdf_link_embed", (state: StateCore) => {
      const currentRelDir = path.posix.dirname((state.env?.relativePath as string) ?? ".");

      for (const block of state.tokens) {
        if (block.type !== "inline" || !block.children) continue;
        const children = block.children;

        // 从后往前扫，命中后 splice 替换不影响未扫过的前段
        for (let i = children.length - 1; i >= 0; i--) {
          if (children[i]?.type !== "link_close") continue;
          // 找到与之配对的 link_open（嵌套计数）
          let depth = 0;
          let openIdx = -1;
          for (let j = i - 1; j >= 0; j--) {
            if (children[j]?.type === "link_close") depth++;
            else if (children[j]?.type === "link_open") {
              if (depth === 0) {
                openIdx = j;
                break;
              }
              depth--;
            }
          }
          if (openIdx < 0) continue;

          const href = children[openIdx]?.attrGet("href");
          if (!href || !isInternalFileHref(href)) continue;
          const { clean, page, embedOff } = splitHref(href);
          if (embedOff) continue;

          const resolvedTarget = resolveTarget(clean, currentRelDir, "mdlink");
          if (!resolvedTarget) continue;

          // 链接文字作为卡片标题（去掉图片等子 token 只取文本）
          const text = children
            .slice(openIdx + 1, i)
            .filter((t) => t.type === "text" || t.type === "code_inline")
            .map((t) => t.content.trim())
            .filter(Boolean)
            .join(" ")
            .trim();

          const token = new state.Token("html_inline", "", 0);
          token.content = viewerHtml(toVaultUrl(prefix, resolvedTarget.rel), text || resolvedTarget.name, page);
          children.splice(openIdx, i - openIdx + 1, token);
          // 关键：splice 后数组变短，i 重置到 openIdx（i-- 后从 openIdx-1 继续），
          // 否则 i 会越过新长度读到 undefined
          i = openIdx;
        }
      }
    });
  };
}
