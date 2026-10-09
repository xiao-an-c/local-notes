import type { Component, DefineComponent } from "vue";
import MermaidFenceVue from "./MermaidFence.vue";

/**
 * MermaidFence 组件：```mermaid 围栏的客户端载体（base64 入参 → Mermaid）。
 * 由 plugins/mermaidFence.ts 在构建期生成标签，一般无需手写；
 * 主题入口已全局注册（SSR 阶段该标签即被 Vue 渲染为图表容器）。
 * 也可经 `import { MermaidFence } from "local-notes/components"` 单独引用。
 */
export type MermaidFenceProps = {
  /** base64（UTF-8）编码的 mermaid 图表源码 */
  codeB64: string;
};

export const MermaidFence = MermaidFenceVue as unknown as DefineComponent<MermaidFenceProps>;

/** 组件形态（供使用方类型引用） */
export type MermaidFenceComponent = Component<MermaidFenceProps>;
