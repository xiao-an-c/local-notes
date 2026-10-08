import type { Component, DefineComponent } from "vue";
import HtmlViewVue from "./HtmlView.vue";

/**
 * HtmlView 组件：渲染 vault 内自包含 HTML 报告（研报/交互图表页），
 * 以 <iframe> 整页加载实现样式与脚本完全隔离（ECharts 等内联脚本正常执行）。
 * 主题入口已全局注册，markdown 正文可直接写
 * `<HtmlView src="<assetPrefix>xx/yy.html" />`；也可经
 * `import { HtmlView } from "local-notes" / "local-notes/components"` 单独引用。
 */
export type HtmlViewProps = {
  /** vault 资源 URL（如 /vault/xx/yy.html），必填 */
  src: string;
  /** 容器高度，默认 "560px" */
  height?: string;
  /** 是否显示浮动工具栏（新窗口打开/全屏），默认 true */
  toolbar?: boolean;
};

export const HtmlView = HtmlViewVue as unknown as DefineComponent<HtmlViewProps>;

/** 组件形态（供使用方类型引用） */
export type HtmlViewComponent = Component<HtmlViewProps>;
