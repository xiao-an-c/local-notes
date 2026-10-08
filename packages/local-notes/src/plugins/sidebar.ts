import path from "node:path";
import type { LocalNotesOptions } from "../options";
import { resolveLocalNotesOptions } from "../options";
import { collectAssets } from "./vaultAsset";

/**
 * 侧边栏条目结构（与 VitePress DefaultTheme.SidebarItem 结构兼容，
 * 独立定义避免库类型依赖 vitepress 完整类型即可使用）。
 */
export interface SidebarItem {
  text: string;
  link?: string;
  items?: SidebarItem[];
  collapsed?: boolean;
}

/**
 * 侧边栏附件合并（纯数据加工，不进 vite.plugins）
 *
 * 把 vault 内的 PDF / EPUB 附件挂进目录树——笔记所在文件夹的节点下直接
 * 出现对应附件（缺目录节点则合成，例如只放了附件、没有任何 md 的目录）。
 * 附件链接指向 `<viewerPath>#<assetPrefix><vault 相对路径>`（默认
 * `/viewer#/vault/...`）：VaultFileViewer 组件读取 hash 渲染 <PdfViewer>；
 * 用 hash 而非 query 是为了同页切换文件时不受 router 相同路径去重的影响。
 *
 * 用法：包住使用方生成的 sidebar 数组后再交给 themeConfig.sidebar：
 * ```ts
 * sidebar: mergeVaultAssetSidebar(generateSidebar({ ... }), { vaultDir: ".." })
 * ```
 */

/** 侧边栏展示的附件后缀（要扩展展示范围改这里即可） */
const DOCS_EXTS = new Set([".pdf", ".epub"]);

const ICON: Record<string, string> = { ".pdf": "📄", ".epub": "📚" };

/** 资源 URL 前缀规范化：保证以 "/" 开头、以 "/" 结尾（便于 startsWith / 拼接） */
function normalizePrefix(raw: string): string {
  let p = raw.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  if (!p.endsWith("/")) p = `${p}/`;
  return p;
}

/** 附件预览页路由规范化：保证以 "/" 开头、不以 "/" 结尾（便于 `#` 拼接） */
function normalizeViewerPath(raw: string): string {
  let p = raw.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  return p.replace(/\/+$/, "");
}

interface AssetFile {
  text: string;
  link: string;
}

/** 目录（vault 相对路径，"" 为根）→ 直接子附件列表（文件名自然排序） */
function buildFileIndex(vaultDir: string, skipDirs: Set<string>, assetLinkPrefix: string): Map<string, AssetFile[]> {
  const map = new Map<string, AssetFile[]>();
  for (const rel of collectAssets(vaultDir, skipDirs, DOCS_EXTS)) {
    const dir = path.posix.dirname(rel);
    const key = dir === "." ? "" : dir;
    const list = map.get(key) ?? [];
    let name = path.basename(rel);
    try {
      name = decodeURIComponent(name);
    } catch {
      /* 保留原名 */
    }
    const ext = path.extname(rel).toLowerCase();
    // 链接路径逐段 encodeURIComponent：文件名含 % 时（如"触及1%整数倍的公告.pdf"），
    // 裸 % 会让 VitePress 路由 normalize() 的 decodeURI 抛 URIError: URI malformed
    // （实测 shared.js isActive → normalize → decodeURI），编码后 % → %25 双向安全；
    // VaultFileViewer 读 hash 时 decodeURIComponent 还原回原始文件名
    const encodedRel = rel.split("/").map((seg) => encodeURIComponent(seg)).join("/");
    list.push({ text: `${ICON[ext] ?? "📄"} ${name}`, link: `${assetLinkPrefix}${encodedRel}` });
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.text.localeCompare(b.text, "zh-Hans-CN", { numeric: true }));
  }
  return map;
}

/** 目录 → 直接子目录集合 */
function buildChildrenIndex(dirs: Set<string>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const dir of dirs) {
    const parent = path.posix.dirname(dir);
    if (dir === "" || parent === ".") continue;
    const list = map.get(parent) ?? [];
    list.push(dir);
    map.set(parent, list);
  }
  return map;
}

/** 深度优先收集节点下全部 link */
function collectLinks(node: SidebarItem, out: string[] = []): string[] {
  if (node.link) out.push(node.link);
  for (const child of node.items ?? []) collectLinks(child, out);
  return out;
}

/** 取多个 site 路径所属目录的最长公共段前缀（按 "/" 分段比较，避免误切） */
function commonDirPrefix(links: string[]): string | null {
  if (links.length === 0) return null;
  const dirs = links.map((l) => {
    const clean = l.replace(/^\//, "").split(/[?#]/)[0] ?? "";
    const cut = clean.lastIndexOf("/");
    return cut === -1 ? "" : clean.slice(0, cut);
  });
  let prefix = dirs[0]!.split("/").filter(Boolean);
  for (const dir of dirs.slice(1)) {
    const segs = dir.split("/").filter(Boolean);
    let i = 0;
    while (i < prefix.length && i < segs.length && prefix[i] === segs[i]) i++;
    prefix = prefix.slice(0, i);
    if (prefix.length === 0) return "";
  }
  return prefix.join("/");
}

/**
 * 推断文件夹节点对应的 vault 目录：其所有子孙 link 所在目录的公共前缀。
 * 例：某文件夹节点下既有 子目录/xx.md 又有本目录 md → 公共前缀即该文件夹自身。
 */
function dirOf(node: SidebarItem): string | null {
  const links = collectLinks(node);
  return commonDirPrefix(links);
}

export function mergeVaultAssetSidebar(sidebar: SidebarItem[], options: LocalNotesOptions): SidebarItem[] {
  const resolved = resolveLocalNotesOptions(options);
  const vault = path.resolve(resolved.vaultDir);
  const skipDirs = new Set(resolved.skipDirs);
  // 附件链接前缀：<viewerPath>#<assetPrefix>（默认 /viewer#/vault/）
  const assetLinkPrefix = `${normalizeViewerPath(resolved.viewerPath)}#${normalizePrefix(resolved.assetPrefix)}`;
  const filesByDir = buildFileIndex(vault, skipDirs, assetLinkPrefix);
  if (filesByDir.size === 0) return sidebar;

  const allDirs = new Set(filesByDir.keys());
  for (const dir of filesByDir.keys()) {
    // 空目录不会出现在 collectAssets 结果里，这里补齐中间目录
    let cur = path.posix.dirname(dir);
    while (cur !== "." && cur !== "/") {
      allDirs.add(cur);
      const next = path.posix.dirname(cur);
      if (next === cur) break;
      cur = next;
    }
  }
  const childrenByDir = buildChildrenIndex(allDirs);

  const synthNode = (dir: string): SidebarItem => ({
    text: dir.split("/").pop() ?? dir,
    collapsed: true,
    items: [...(filesByDir.get(dir) ?? []), ...(childrenByDir.get(dir) ?? []).map(synthNode)],
  });

  const covered = new Set<string>();
  const walk = (items: SidebarItem[]) => {
    for (const node of items) {
      const dir = dirOf(node);
      if (dir === null) continue;
      covered.add(dir);
      if (!node.items) continue;

      // 已有的子目录（只看文件夹子节点；文件子节点的 dirOf 会指向当前目录自身）
      const existingDirs = new Set<string>();
      for (const child of node.items) {
        if (!child.items) continue;
        const childDir = dirOf(child);
        if (childDir !== null && childDir !== dir) existingDirs.add(childDir);
      }

      // 笔记之后追加当前目录的附件
      const files = filesByDir.get(dir);
      if (files?.length) node.items.push(...files);

      // 只有附件、没有 md 的子目录 → 合成节点
      for (const sub of childrenByDir.get(dir) ?? []) {
        if (!existingDirs.has(sub)) node.items.push(synthNode(sub));
      }

      walk(node.items);
    }
  };
  walk(sidebar);

  // 未被任何侧边栏节点覆盖的顶层目录（如纯附件目录）→ 合成顶层组
  for (const dir of allDirs) {
    if (dir === "" || dir.includes("/") || covered.has(dir)) continue;
    sidebar.push(synthNode(dir));
  }

  return sidebar;
}
