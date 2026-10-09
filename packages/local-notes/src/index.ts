/**
 * local-notes —— 把本地 Markdown 笔记库（vault）发布为带在线编辑能力的
 * VitePress 站点：Monaco 在线编辑、思维导图、知识图谱、双链反链、
 * PDF/附件预览。对笔记目录结构零假设。
 *
 * ## 三入口说明
 *
 * - `"."`（本文件）：vite 插件 / markdown-it 插件 / 站点配置组合入口
 *   `withLocalNotes()` / 配置类型。纯 node 侧代码，可被站点
 *   `.vitepress/config.mts` 直接引入。
 * - `"local-notes/components"`：组件导出（编辑全家桶 + 思维导图等）。
 *   组件依赖 vitepress 的客户端运行时（useData）与样式副作用，只能在
 *   站点客户端管线（.vitepress/theme/*、.vue 文件）中引入——vitepress
 *   的 node 入口与 client 入口均无法在纯 node 下 import，这是
 *   VitePress 主题库的通行约束。
 * - `"local-notes/theme"`：VitePress 主题入口（extends 默认主题并挂载
 *   编辑相关 Layout 插槽），只能放在 `.vitepress/theme/index.ts` 引入。
 *
 * L1 骨架曾计划把组件也从 "." 导出；L2 组件真实化后（依赖 vitepress
 * client 运行时）该设计不可行，故拆出 "./components" 子入口。
 */
export {
  backlinksPlugin,
  localNotesMarkdownItPlugins,
  localNotesPlugins,
  mdApiPlugin,
  mergeVaultAssetSidebar,
  mermaidFencePlugin,
  mindmapApiPlugin,
  pdfEmbedPlugin,
  vaultAssetCopyPlugin,
  vaultAssetPlugin,
  vaultMdAutoRestart,
  vueHmrGuardPlugin,
  type MarkdownItPlugin,
  type SidebarItem,
} from "./plugins/index.ts";

export {
  withLocalNotes,
  type LocalNotesSiteOptions,
  type LocalNotesSidebarOptions,
} from "./config.ts";

export {
  DEFAULT_API_BASE,
  DEFAULT_ASSET_PREFIX,
  DEFAULT_HOME_FILE,
  DEFAULT_SKIP_DIRS,
  DEFAULT_VIEWER_PATH,
  mergeSkipDirs,
  resolveLocalNotesOptions,
  resolveLocalNotesThemeOptions,
  type LocalNotesOptions,
  type LocalNotesThemeOptions,
  type ResolvedLocalNotesOptions,
  type ResolvedLocalNotesThemeOptions,
} from "./options.ts";
