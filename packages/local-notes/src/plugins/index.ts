import type { Plugin } from "vite";
import type { LocalNotesOptions } from "../options.ts";
import { resolveLocalNotesOptions } from "../options.ts";
import { backlinksPlugin } from "./backlinks.ts";
import { vaultMdAutoRestart } from "./autoRestart.ts";
import { boardApiPlugin } from "./boardApi.ts";
import { mdApiPlugin } from "./mdApi.ts";
import { mindmapApiPlugin } from "./mindmapApi.ts";
import { pdfEmbedPlugin, type MarkdownItPlugin } from "./markdown.ts";
import { mermaidFencePlugin } from "./mermaidFence.ts";
import { mergeVaultAssetSidebar, type SidebarItem } from "./sidebar.ts";
import { vaultAssetCopyPlugin, vaultAssetPlugin } from "./vaultAsset.ts";
import { vueHmrGuardPlugin } from "./vueHmrGuard.ts";

export { backlinksPlugin } from "./backlinks.ts";
export { vaultMdAutoRestart } from "./autoRestart.ts";
export { boardApiPlugin } from "./boardApi.ts";
export { mdApiPlugin } from "./mdApi.ts";
export { mindmapApiPlugin } from "./mindmapApi.ts";
export { pdfEmbedPlugin, type MarkdownItPlugin } from "./markdown.ts";
export { mermaidFencePlugin } from "./mermaidFence.ts";
export { mergeVaultAssetSidebar, type SidebarItem } from "./sidebar.ts";
export { vaultAssetPlugin, vaultAssetCopyPlugin } from "./vaultAsset.ts";
export { vueHmrGuardPlugin } from "./vueHmrGuard.ts";

/**
 * 组合入口：一次装齐全部 local-notes vite 插件（含 dev 服务与 build 增强）。
 *
 * 各插件的 vaultDir / skipDirs / assetPrefix / apiBase 等一律经
 * resolveLocalNotesOptions 统一解析（同一默认值来源，无散落硬编码）。
 *
 * 插件顺序即生效顺序（与抽离前站点 config 实测顺序一致）：
 * 1. backlinksPlugin        —— 反链/图谱虚拟模块（serve + build）
 * 2. vaultAssetPlugin       —— 附件静态服务（dev 中间件）
 * 3. vaultAssetCopyPlugin   —— 附件增量拷贝（仅 build；options.outDir 未传时不加入）
 * 4. mindmapApiPlugin       —— 思维导图保存 API（仅 dev）
 * 5. boardApiPlugin         —— 任务看板保存 API（仅 dev）
 * 6. mdApiPlugin            —— markdown 读写/新建 API（仅 dev）
 * 7. vaultMdAutoRestart     —— 笔记增删自动重启（仅 dev）
 * 8. vueHmrGuardPlugin      —— HMR 竞态防护（仅 dev）
 *
 * 另有几种**不进 vite.plugins** 的能力，按各自形态单独接入：
 * - markdown-it 插件 → localNotesMarkdownItPlugins(options)（次级组合入口）
 *   或独立 pdfEmbedPlugin(options) / mermaidFencePlugin()，装进
 *   `markdown.config`，且须注册在双向链接插件之前；
 * - 侧栏附件合并 → mergeVaultAssetSidebar(sidebar, options) 包住
 *   themeConfig.sidebar（纯数据加工，非插件）；
 * - 主题入口 → localNotesTheme(options)（"local-notes/theme"）。
 */
export function localNotesPlugins(options: LocalNotesOptions): Plugin[] {
  const plugins: Plugin[] = [
    backlinksPlugin(options),
    vaultAssetPlugin(options),
  ];
  // build 附件拷贝需要明确的目标目录（VitePress outDir），未传则不加入
  if (options.outDir) plugins.push(vaultAssetCopyPlugin(options));
  plugins.push(
    mindmapApiPlugin(options),
    boardApiPlugin(options),
    mdApiPlugin(options),
    vaultMdAutoRestart(options),
    vueHmrGuardPlugin(),
  );
  return plugins;
}

/**
 * markdown-it 插件组合入口（次级）：返回 markdown-it 插件数组，
 * 逐个 `md.use(...)` 装进 VitePress `markdown.config`。
 *
 * 当前组成：pdfEmbedPlugin（PDF 链接内嵌预览）＋ mermaidFencePlugin
 * （```mermaid 围栏 → 图表，`mermaid: false` 可关）。
 *
 * 与 vite 插件组合入口 localNotesPlugins 形态不同——markdown-it 插件是
 * `(md) => void` 函数，不走 vite.plugins。注册顺序约定：数组整体须在
 * 双向链接插件（如 @nolebase/markdown-it-bi-directional-links）之前 use，
 * pdfEmbedPlugin 只拦截 .pdf 目标，普通 wikilink 不受影响。
 *
 * ```ts
 * markdown: {
 *   config(md) {
 *     for (const p of localNotesMarkdownItPlugins({ vaultDir: ".." })) md.use(p);
 *     md.use(BiDirectionalLinks({ ... })); // 双向链接放最后
 *   },
 * }
 * ```
 */
export function localNotesMarkdownItPlugins(options: LocalNotesOptions): MarkdownItPlugin[] {
  const plugins: MarkdownItPlugin[] = [pdfEmbedPlugin(options)];
  // ```mermaid 围栏渲染（mermaid: false 关闭——站点想自接别的 mermaid 方案时）
  if (resolveLocalNotesOptions(options).mermaid) plugins.push(mermaidFencePlugin());
  return plugins;
}
