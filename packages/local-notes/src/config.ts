/**
 * 站点配置组合入口（node 侧）——`withLocalNotes()`。
 *
 * 为什么需要它：VitePress 主题只能携带客户端能力（Layout/组件/样式），
 * vite 插件、markdown-it 插件、侧栏生成这些 **node 侧**接线必须写在
 * 使用方的 `.vitepress/config.mts` 里。本函数把这段接线收进库，使用方
 * 只需包一层 defineConfig：
 *
 * ```ts
 * // .vitepress/config.mts
 * import { withLocalNotes } from "local-notes";
 * export default withLocalNotes(
 *   { vaultDir: "../notes" },          // 缺省 = <cwd>/site
 *   { title: "My Notes", description: "…" },
 * );
 * ```
 *
 * 它做了什么（合并顺序即优先级，userConfig 永远后写、可覆盖）：
 * - `srcDir` ← vault 所在目录（vaultDir 相对站点根的路径）；
 * - `ignoreDeadLinks: true`（vault 内 wikilink 允许指向尚未创建的页面）；
 * - `srcExclude` ← `${templateDir}/**`（若配置模板目录）＋ userConfig 的；
 * - `vite.plugins` ← localNotesPlugins(...) ＋ userConfig 的插件组；
 * - `markdown.config` ← 先注册库的 markdown-it 插件（PDF 自动内嵌，
 *   必须在双向链接插件之前），再调用 userConfig 自己的 markdown.config；
 * - `themeConfig.sidebar` ← generateSidebar（文件夹结构即菜单，默认约定
 *   见 buildSidebar）＋ 附件合并 mergeVaultAssetSidebar；
 *   传 `sidebar: false` 可关掉，改用 userConfig.themeConfig.sidebar；
 * - `outDir`（附件拷贝目标）缺省取 userConfig.outDir 或 `<root>/.vitepress/dist`；
 * - `configPath`（dev 自动重启要 touch 的文件）缺省探测
 *   `<root>/.vitepress/config.{mts,ts,mjs,js}`——VitePress 2 dev 下
 *   vite 的 configFile 为空，自动重启拿不到路径，必须显式给。
 *
 * root 的取值是 `process.cwd()`（即 `vitepress dev/build` 的运行目录，
 * `pnpm -C demo dev` 场景 = demo/）。若用 `vitepress dev <dir>` 从仓库
 * 根启动（cwd ≠ 站点根），请显式传 vaultDir / configPath。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, type UserConfig } from "vitepress";
import { generateSidebar } from "vitepress-sidebar";
import type { LocalNotesOptions } from "./options.ts";
import {
  localNotesMarkdownItPlugins,
  localNotesPlugins,
  mergeVaultAssetSidebar,
  type SidebarItem,
} from "./plugins/index.ts";

/** vitepress-sidebar generateSidebar 的参数类型（借参数反查，不依赖其导出名） */
type GenerateSidebarOptions = Parameters<typeof generateSidebar>[0];

/** 侧栏生成选项：documentRootPath 缺省同 srcDir，其余透传 generateSidebar */
export type LocalNotesSidebarOptions = { documentRootPath?: string } & Partial<GenerateSidebarOptions>;

export interface LocalNotesSiteOptions extends Omit<LocalNotesOptions, "vaultDir"> {
  /**
   * vault 根目录。绝对路径，或相对站点根（cwd）的路径。
   * 缺省 "<cwd>/site"。srcDir 未显式给时，取本目录相对站点根的路径。
   */
  vaultDir?: string;
  /** VitePress srcDir（文档根）。缺省从 vaultDir 推出（如 "site"） */
  srcDir?: string;
  /** 侧栏生成选项；false = 不生成，用 userConfig.themeConfig.sidebar */
  sidebar?: false | LocalNotesSidebarOptions;
}

/**
 * 组合出完整的 VitePress 站点配置：node 侧接线（vite/markdown-it 插件、
 * 侧栏）一次装齐，userConfig 里的同名字段优先生效。
 */
export function withLocalNotes(site: LocalNotesSiteOptions = {}, user: UserConfig = {}): UserConfig {
  const root = process.cwd();
  const srcDir = site.srcDir ?? (site.vaultDir ? relativeDir(root, site.vaultDir) : "site");
  const vaultDir = path.resolve(root, site.vaultDir ?? srcDir);

  // 两根「水电管线」的缺省值：附件拷贝目标 + 自动重启要 touch 的配置文件
  const outDir = site.outDir ?? user.outDir ?? path.resolve(root, ".vitepress/dist");
  const configPath = site.configPath ?? probeConfigPath(root);

  // 插件组配置（vaultDir 必填，其余字段 undefined 走库内默认值）
  const pluginOptions: LocalNotesOptions = {
    vaultDir,
    templateDir: site.templateDir,
    assetPrefix: site.assetPrefix,
    apiBase: site.apiBase,
    extraSkipDirs: site.extraSkipDirs,
    homeFile: site.homeFile,
    viewerPath: site.viewerPath,
    excludedPages: site.excludedPages,
    outDir,
    configPath,
  };

  // 模板目录是机器用的 md：不页面化（srcExclude）也不进菜单（侧栏排除）
  const templateGlob = site.templateDir ? [`${site.templateDir}/**`] : [];

  const sidebar =
    site.sidebar === false
      ? user.themeConfig?.sidebar
      : buildSidebar(site.sidebar ?? {}, { pluginOptions, srcDir, templateGlob });

  return defineConfig({
    ...user,
    srcDir,
    ignoreDeadLinks: user.ignoreDeadLinks ?? true,
    srcExclude: dedupe([...templateGlob, ...(user.srcExclude ?? [])]),
    vite: {
      ...user.vite,
      plugins: [...localNotesPlugins(pluginOptions), ...(user.vite?.plugins ?? [])],
    },
    markdown: {
      ...user.markdown,
      config(md) {
        // 库的 markdown-it 插件先注册（pdfEmbed 须在双向链接插件之前），
        // 再交给使用方自己的 markdown.config 继续装（BiDirectionalLinks 等）
        for (const p of localNotesMarkdownItPlugins(pluginOptions)) md.use(p);
        user.markdown?.config?.(md);
      },
    },
    themeConfig: { sidebar, ...user.themeConfig },
  });
}

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/** vaultDir 相对 root 的路径（做 srcDir 用）；越界（../..）时回落绝对路径 */
function relativeDir(root: string, vaultDir: string): string {
  const rel = path.relative(root, path.resolve(root, vaultDir));
  return rel && !rel.startsWith("..") ? rel.split(path.sep).join("/") : path.resolve(root, vaultDir);
}

/** 探测 VitePress 站点配置文件（自动重启插件要 touch 它；不在则不启用） */
function probeConfigPath(root: string): string | undefined {
  for (const f of ["config.mts", "config.ts", "config.mjs", "config.js"]) {
    const p = path.resolve(root, ".vitepress", f);
    if (existsSync(p)) return p;
  }
  return undefined;
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/**
 * 文件夹结构即菜单：generateSidebar 动态扫描文档根 + 附件合并。
 *
 * 预置的「笔记站约定」默认值（都可通过 sidebar.* 覆盖）：
 * - 标题来自笔记自身：frontmatter title > 正文一级标题 > 文件名；
 * - 目录分组标题取该目录 index.md 的一级标题，分组指向它；
 * - 不做大写化（中文笔记站无意义）、默认折叠；
 * - `documentRootPath` 缺省同 srcDir；
 * - `excludeByGlobPattern` 自动追加 `${templateDir}/**`。
 *
 * 另修一个 vitepress-sidebar 的通用坑：文件夹分组链接输出源 md 路径
 * （如 /components/index.md），而构建产物中该路由是 /components/——
 * 深遍历把结尾的 index.md 剥掉，得到真实路由。
 */
function buildSidebar(
  opts: LocalNotesSidebarOptions,
  ctx: { pluginOptions: LocalNotesOptions; srcDir: string; templateGlob: string[] },
): SidebarItem[] {
  const generated = generateSidebar({
    useTitleFromFrontmatter: true,
    useTitleFromFileHeading: true,
    useFolderTitleFromIndexFile: true,
    useFolderLinkFromIndexFile: true,
    capitalizeFirst: false,
    collapsed: true,
    ...opts,
    documentRootPath: opts.documentRootPath ?? ctx.srcDir,
    excludeByGlobPattern: dedupe([...ctx.templateGlob, ...(opts.excludeByGlobPattern ?? [])]),
    // vitepress-sidebar 的 Sidebar 声明较松，运行时结构与 SidebarItem 兼容
  }) as unknown as SidebarItem[];
  return mergeVaultAssetSidebar(normalizeSidebarLinks(generated), ctx.pluginOptions);
}

/** 侧栏链接规范化：剥掉文件夹分组链接结尾的 index.md，得到真实路由 */
type SidebarNode = { link?: string; items?: SidebarNode[] };
function normalizeSidebarLinks(items: SidebarNode[]): SidebarNode[] {
  for (const node of items) {
    if (node.link) node.link = node.link.replace(/\/index\.md$/, "/");
    if (node.items) normalizeSidebarLinks(node.items);
  }
  return items;
}
