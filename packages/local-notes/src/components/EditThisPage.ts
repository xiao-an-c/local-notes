import type { Component, DefineComponent } from "vue";
import EditThisPageVue from "./edit/EditThisPage.vue";

/**
 * 「编辑此页」入口组件：挂于 Layout 的 doc-before 插槽（正文标题上方、
 * 右对齐），ping 探测通过且当前页对应真实 vault md 时渲染；点击打开
 * MarkdownEditor。rewrites 逆映射与排除页由主题配置（homeFile/excludedPages）
 * 决定，库内零假设。
 */
export const EditThisPage = EditThisPageVue as unknown as DefineComponent<Record<string, never>>;

/** 组件形态（供使用方类型引用） */
export type EditThisPageComponent = Component<Record<string, never>>;
