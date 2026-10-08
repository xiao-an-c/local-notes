import type { Component, DefineComponent } from "vue";
import GraphVue from "./Graph.vue";

/**
 * 知识图谱组件：force-graph 渲染全库 wikilink 关系图（节点=笔记页、
 * 边=双链），数据来自 backlinksPlugin 注入的 virtual:graph 虚拟模块。
 * 主题入口在 frontmatter `graph: true` 页面的 doc-top 插槽整页挂载；
 * 文件夹配色经主题配置 graphFolderColors 传入（未列出用中性灰）。
 */
export type GraphProps = Record<string, never>;

export const Graph = GraphVue as unknown as DefineComponent<GraphProps>;

/** 组件形态（供使用方类型引用） */
export type GraphComponent = Component<GraphProps>;
