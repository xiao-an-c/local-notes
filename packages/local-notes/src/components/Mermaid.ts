import type { Component, DefineComponent } from "vue";
import MermaidVue from "./Mermaid.vue";

/**
 * Mermaid 组件：mermaid 图表渲染（暗色跟随、按需动态 import、全屏查看）。
 * markdown 正文可直接使用（主题入口已全局注册）：
 *   <Mermaid code="flowchart TD; A --> B" />
 * 一般不必手写标签——直接写 ```mermaid 围栏代码块即可（经 MermaidFence
 * 自动承接，见 plugins/mermaidFence.ts）。
 * 也可经 `import { Mermaid } from "local-notes/components"` 单独引用。
 */
export type MermaidProps = {
  /** mermaid 图表源码（flowchart/sequence/class Diagram 等任意 mermaid 语法） */
  code: string;
};

export const Mermaid = MermaidVue as unknown as DefineComponent<MermaidProps>;

/** 组件形态（供使用方类型引用） */
export type MermaidComponent = Component<MermaidProps>;
