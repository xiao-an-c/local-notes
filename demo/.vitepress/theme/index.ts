// ⭐ 接入点 2/2：主题入口——extends VitePress 默认主题并挂载
// 「编辑此页」/「＋ 新建笔记」/ 全局编辑器 / 反链面板 / 图谱页画布，
// 全局注册 <PdfViewer> / <MindMap> / <VaultFileViewer> / <HtmlView> 供
// Markdown 直接使用。经 pnpm workspace 链接消费 "local-notes/theme"
// （symlink 指回 packages/local-notes 源码，无 dist）；改库源码即时生效，
// 库样式随主题入口自动加载。
import { localNotesTheme } from "local-notes/theme";
// 站点自定义样式：三栏布局 / 大纲开关 / 侧栏滑动，必须排在库样式之后
import "./custom.css";
// 字计数徽标样式（徽标 HTML 由 .vitepress/word-count/index.ts 在构建期注入）
import "../word-count/word-count.css";
// 站点自有组件（非库的一部分）：Mermaid 图表 + 通用卡片网格 + 统一全屏弹窗
import Mermaid from "../components/Mermaid.vue";
import CardGrid from "../components/CardGrid.vue";
import FullscreenOverlay from "../components/FullscreenOverlay.vue";

// 包装 localNotesTheme 的返回值：保留库主题的全部行为（enhanceApp 里
// 注册的 PdfViewer/MindMap/HtmlView 等），追加注册站点自有组件
const base = localNotesTheme({
  // 首页 = 文档根的 index.md（与插件组 homeFile 默认值对应，
  // 「编辑此页」/ 新建后跳转据此做 rewrites 逆映射）
  homeFile: "index.md",
  // 站点功能页不显示「编辑此页」（相对文档根的 relativePath）
  excludedPages: ["graph.md", "viewer.md"],
  // 纯阅读站点：不显示「✎ 编辑此页」和顶栏「＋ 新建笔记」
  //（编辑器/新建对话框随之停用；Markdown 直接改文件即可）
  enableEditThisPage: false,
  enableNewNote: false,
});

export default {
  ...base,
  enhanceApp(ctx) {
    // 先跑库主题的 enhanceApp（注册库组件 + dev 重启桥）
    base.enhanceApp?.(ctx);
    // 再注册站点自有组件，markdown 正文可直接写
    // <Mermaid code="graph TD; ..." /> 和 <CardGrid :items="[...]" />
    ctx.app.component("Mermaid", Mermaid);
    ctx.app.component("CardGrid", CardGrid);
    // 统一全屏弹窗（Mermaid/CardGrid 内部使用；亦可单独包装任意内容）
    ctx.app.component("FullscreenOverlay", FullscreenOverlay);
  },
};
