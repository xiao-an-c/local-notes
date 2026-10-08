import type { Component, DefineComponent } from "vue";
import MarkdownEditorVue from "./MarkdownEditor.vue";

/**
 * MarkdownEditor 组件：Monaco 编辑器 + 分屏实时预览（预览内真实渲染
 * MindMap/PdfViewer），经 md 读写 API 加载/保存笔记（Cmd/Ctrl+S 写回 vault
 * 本地文件，含 409 冲突处理）；编辑状态跨路由持久由主题 Layout 挂载保证。
 */
export type MarkdownEditorProps = {
  /** vault 相对路径（如 path/to/note.md），必填 */
  path: string;
};

export type MarkdownEditorEmits = {
  /** 请求关闭编辑视图 */
  close: [];
};

export const MarkdownEditor = MarkdownEditorVue as unknown as DefineComponent<
  MarkdownEditorProps,
  {},
  unknown,
  {},
  {},
  {},
  {},
  MarkdownEditorEmits
>;

/** 组件形态（供使用方类型引用） */
export type MarkdownEditorComponent = Component<MarkdownEditorProps>;
