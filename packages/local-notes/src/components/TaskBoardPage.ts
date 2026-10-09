import type { Component, DefineComponent } from "vue";
import TaskBoardPageVue from "./TaskBoardPage.vue";

/**
 * TaskBoardPage 组件：任务看板整页工程页。挂在 frontmatter `board: true`
 * 的页面正文区（主题 Layout 自动挂载，与图谱页 Graph 同机制），读取 URL
 * `?src=<vault 资源 URL>` 整页渲染对应 <TaskBoard>。主题选项 boardPath
 * 配置后，内嵌面板工具栏会出现跳转到这里的「整页」按钮。
 */
export const TaskBoardPage = TaskBoardPageVue as unknown as DefineComponent;

/** 组件形态（供使用方类型引用） */
export type TaskBoardPageComponent = Component;
