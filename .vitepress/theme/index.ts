// ⭐ 接入点 2/2：主题入口一行接入——extends VitePress 默认主题并挂载
// 「编辑此页」/「＋ 新建笔记」/ 全局编辑器 / 反链面板 / 图谱页画布，
// 全局注册 <PdfViewer> / <MindMap> / <VaultFileViewer> 供 Markdown 直接使用。
import { localNotesTheme } from "local-notes/theme";
import "local-notes/style.css";

export default localNotesTheme({
  // 首页 = vault 根的 index.md（与插件组 homeFile 默认值对应，
  // 「编辑此页」/ 新建后跳转据此做 rewrites 逆映射）
  homeFile: "index.md",
  // 站点工程页不显示「编辑此页」（rewrites 后的 relativePath）
  excludedPages: ["graph.md", "viewer.md"],
});
