/// <reference types="vite/client" />

// vite/client：提供 `import ... from '...?worker'` 的类型
// （MarkdownEditor 的 Monaco editor.worker 按需加载用到）。

// .vue 单文件组件的模块声明：tsc --noEmit 与 dts 链路不编译 SFC 内部，
// 组件的对外 props/emits 类型由各组件同名包装 .ts 显式声明（DefineComponent<Props>）。
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

// backlinksPlugin（vite 插件）在构建期注入的虚拟模块：全库反链索引。
// key=页面路径（无 .md），值=引用该页面的笔记列表（源页面/源标题/链接文本）。
declare module "virtual:backlinks" {
  const backlinks: Record<string, { from: string; title: string; text: string }[]>;
  export default backlinks;
}

// backlinksPlugin 注入的虚拟模块：全库双链图谱数据（节点=笔记页，
// folder=顶层文件夹供配色；边=wikilink 双链）。
declare module "virtual:graph" {
  const graph: {
    nodes: { id: string; title: string; folder: string }[];
    edges: { source: string; target: string }[];
  };
  export default graph;
}
