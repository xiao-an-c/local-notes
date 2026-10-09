/**
 * local-notes/components 子入口——组件导出（客户端）。
 *
 * 只能在站点客户端管线（.vitepress/theme/*、.vue 文件）中引入：组件依赖
 * vitepress 的客户端运行时（useData 等）与样式副作用，node 侧引入会失败
 * （vitepress 的 node 入口无 client API，client 入口依赖 @siteData 虚拟模块）。
 * node 侧（config.mts）请引入 "."；主题整体接入请引入 "local-notes/theme"。
 */
export {
  Backlinks,
  EditThisPage,
  Graph,
  HtmlView,
  MarkdownEditor,
  Mermaid,
  MermaidFence,
  MindMap,
  NavBarNewNote,
  NewNoteDialog,
  PdfViewer,
  VaultFileViewer,
} from "./components/index.ts";
