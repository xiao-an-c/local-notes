import type { Component, DefineComponent } from "vue";
import PdfViewerVue from "./PdfViewer.vue";

/**
 * PdfViewer 组件：iframe 内嵌浏览器原生 PDF 预览（Range 拉流，无需 pdf.js）。
 * markdown 正文与编辑器预览均可使用（主题入口已全局注册）：
 *   <PdfViewer src="/vault/xx/yy.pdf" :page="38" height="480px" collapsed />
 * 也可经 `import { PdfViewer } from "local-notes/components"` 单独引用。
 */
export type PdfViewerProps = {
  /** vault 资源 URL（如 /vault/path/to/file.pdf），必填 */
  src: string;
  /** 卡片标题，默认取文件名 */
  title?: string;
  /** 初始定位页码（追加 #page=N） */
  page?: number;
  /** iframe 高度，默认撑满一屏附近（min(75vh, 820px)） */
  height?: string;
  /** 初始是否折叠（只显示标题条） */
  collapsed?: boolean;
};

export const PdfViewer = PdfViewerVue as unknown as DefineComponent<PdfViewerProps>;

/** 组件形态（供使用方类型引用） */
export type PdfViewerComponent = Component<PdfViewerProps>;
