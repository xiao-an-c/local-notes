import { h, computed } from "vue";
import { useData } from "vitepress";
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import type { LocalNotesThemeOptions } from "../options.ts";
import { getLocalNotesThemeConfig, setLocalNotesThemeConfig } from "./config.ts";
import EditThisPage from "../components/edit/EditThisPage.vue";
import NavBarNewNote from "../components/edit/NavBarNewNote.vue";
import NewNoteDialog from "../components/edit/NewNoteDialog.vue";
import MarkdownEditor from "../components/MarkdownEditor.vue";
import MindMap from "../components/MindMap.vue";
import Graph from "../components/Graph.vue";
import Backlinks from "../components/Backlinks.vue";
import PdfViewer from "../components/PdfViewer.vue";
import HtmlView from "../components/HtmlView.vue";
import Mermaid from "../components/Mermaid.vue";
import MermaidFence from "../components/MermaidFence.vue";
import LayoutPanelsToggle from "../components/LayoutPanelsToggle.vue";
import VaultFileViewer from "../components/VaultFileViewer.vue";
import { closeMdEditor, mdEditorState } from "../components/edit/mdEditorStore.ts";
import { setupRestartBridge } from "./restartBridge.ts";
// 组件相关全局样式（随主题入口进入 dist/style.css；站点亦可显式 import "local-notes/style.css"）
import "./styles.css";
// 布局皮肤：三栏布局 + 「侧栏/大纲」开关的完整 CSS 侧（面板按钮写 html 类，
// 本文件让这些类真正生效——没有它开关就是「点了没反应」）
import "./skin.css";

export type { LocalNotesThemeOptions } from "../options.ts";
export { getLocalNotesThemeConfig } from "./config.ts";

/**
 * local-notes 主题入口——L3 全量挂载（编辑模式 + 思维导图 + 图谱 +
 * 反链面板 + PDF/附件查看器）。
 *
 * 插槽布局（与抽离前站点 theme/index.ts 实测一致）：
 * - doc-top：知识图谱页（frontmatter `graph: true`）正文区整页画布
 *   （Graph 组件，数据来自 backlinksPlugin 的 virtual:graph）；
 * - doc-before：「编辑此页」入口（content-container 内、标题上方、右对齐正文，
 *   避开右侧 aside 大纲；工程页组件内部自隐藏）
 * - nav-bar-content-before：「＋ 新建笔记」入口（顶栏 .content-body 最左、
 *   紧邻站点标题区，全站常驻、跨路由可用；ping 探测不过（build/preview）
 *   组件整体不渲染。不放在标题插槽——nav-bar-title-after 位于标题 <a> 内部，
 *   按钮嵌在链接里交互嵌套不合法）
 * - doc-after：反向链接面板（Backlinks，查询 virtual:backlinks；
 *   图谱页不挂——整页画布与面板互斥）
 * - layout-bottom：全局唯一 Markdown 编辑视图（跨路由持久，路由切换不打断
 *   编辑；全站同一时间只开一个，单例状态见 mdEditorStore）＋「新建笔记」
 *   对话框常驻渲染（默认隐藏，任意页面经顶栏按钮呼出；其挂载逻辑还承担
 *   「创建后 full reload 接棒跳转/自动进编辑」的消费者角色）
 *
 * enhanceApp 全局注册：PdfViewer / MindMap / HtmlView / Mermaid /
 * MermaidFence / VaultFileViewer——markdown 正文可直接写
 * `<PdfViewer src="..." />`、```mermaid 围栏等；VaultFileViewer
 * 由使用方在附件预览工程页（路由默认 /viewer）引用。
 *
 * 用法（站点 `.vitepress/theme/index.ts`）：
 * ```ts
 * import { localNotesTheme } from "local-notes/theme";
 * import "local-notes/style.css"; // 组件样式（构建产物）
 * export default localNotesTheme({ assetPrefix: "/vault/", apiBase: "/api" });
 * ```
 */
export function localNotesTheme(options: LocalNotesThemeOptions = {}): Theme {
  // 先落配置（apiBase/assetPrefix/homeFile/excludedPages/defaultNewNoteDir/
  // graphFolderColors/enableEditThisPage/enableNewNote），各组件经
  // getLocalNotesThemeConfig 读取——SSG 与客户端各自初始化一次，值一致
  setLocalNotesThemeConfig(options);
  const cfg = getLocalNotesThemeConfig();

  return {
    extends: DefaultTheme,
    Layout: () => {
      const { page } = useData();
      // 知识图谱页（页面 frontmatter 标记 graph: true）：正文区整页渲染画布
      const isGraphPage = computed(() => page.value.frontmatter.graph === true);
      return h(DefaultTheme.Layout, null, {
        // 知识图谱页正文区整页画布（doc-top 在 VP2 的 .container 之外）
        "doc-top": () => (isGraphPage.value ? h(Graph) : null),
        // 「编辑此页」入口：放 doc-before（content-container 内、标题上方）。
        // enableEditThisPage: false 时整站不渲染该按钮（编辑器视图仍挂载，
        // 只是没有任何打开它的入口）
        "doc-before": () => (cfg.enableEditThisPage ? h(EditThisPage) : null),
        // 面板显隐切换按钮组（侧栏/大纲，桌面端显示）＋「＋ 新建笔记」入口
        //（enableNewNote: false 时不渲染按钮，也不挂载新建对话框）——
        // 包一层 flex 容器使两者并排
        "nav-bar-content-before": () =>
          h("div", { class: "ln-nav-toggles" }, [
            h(LayoutPanelsToggle),
            ...(cfg.enableNewNote ? [h(NavBarNewNote)] : []),
          ]),
        // 反向链接面板：正文之后、页脚之前（图谱页除外——整页画布与面板互斥）
        "doc-after": () => (!isGraphPage.value ? h(Backlinks) : null),
        // 全局唯一 Markdown 编辑视图：挂在 Layout 底部跨路由持久，
        // 路由切换不打断编辑；全站同一时间只开一个（单例状态见 mdEditorStore）
        "layout-bottom": () =>
          h("div", [
            mdEditorState.open
              ? h(MarkdownEditor, {
                  key: mdEditorState.nonce,
                  path: mdEditorState.path,
                  onClose: () => closeMdEditor(),
                })
              : null,
            // 「新建笔记」对话框常驻渲染（默认 v-if 隐藏）：任意页面经顶栏
            // 「＋ 新建笔记」呼出；enableNewNote: false 时一并停用
            ...(cfg.enableNewNote ? [h(NewNoteDialog)] : []),
          ]),
      });
    },
    enhanceApp({ app }) {
      // 全局注册：markdown 正文与组件模板里都可直接用 <PdfViewer src="..." />
      app.component("PdfViewer", PdfViewer);
      // 全局注册：markdown 正文可直接写 <MindMap src="<assetPrefix>xxx.mindmap.json" />
      app.component("MindMap", MindMap);
      // 全局注册：markdown 正文可直接写 <HtmlView src="<assetPrefix>xxx.html" />，
      // iframe 渲染 vault 内自包含 HTML 研报（ECharts 交互正常）
      app.component("HtmlView", HtmlView);
      // 全局注册：markdown 正文可直接写 <Mermaid code="flowchart TD..." />；
      // ```mermaid 围栏由 mermaidFencePlugin 生成的 <MermaidFence> 占位承接
      app.component("Mermaid", Mermaid);
      app.component("MermaidFence", MermaidFence);
      // 附件预览页（viewerPath，默认 /viewer）：读取 hash 中的 vault 路径渲染 PdfViewer
      app.component("VaultFileViewer", VaultFileViewer);
      // dev 重启桥（仅 dev 生效，build 下整体摇树）：笔记增删触发 restart 后
      // 自动刷新已打开的页面，侧栏/搜索即时反映新笔记（否则 VitePress restart
      // 后浏览器只重连不刷新，新文件要手动刷新才进菜单）
      setupRestartBridge();
    },
  } satisfies Theme;
}

export default localNotesTheme;
