import type { Component, DefineComponent } from "vue";
import BacklinksVue from "./Backlinks.vue";

/**
 * 反向链接面板组件：挂于 Layout 的 doc-after 插槽（正文之后、页脚之前，
 * 图谱页除外），查询 backlinksPlugin 生成的 virtual:backlinks 反向索引，
 * 列出引用当前页面的笔记（含链接文本）。
 */
export type BacklinksProps = Record<string, never>;

export const Backlinks = BacklinksVue as unknown as DefineComponent<BacklinksProps>;

/** 组件形态（供使用方类型引用） */
export type BacklinksComponent = Component<BacklinksProps>;
