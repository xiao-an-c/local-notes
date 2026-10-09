import type { Component, DefineComponent } from "vue";
import TaskBoardVue from "./TaskBoard.vue";

/**
 * TaskBoard 组件：渲染 vault 内 `<name>.taskboard.json` 任务看板（Tower 风格
 * 面板：看板/表格/日历/统计四视图 + 成员/分类/状态/优先级/关键字筛选）；edit
 * 模式经 board 保存 API 写回本地文件。主题入口已全局注册，markdown 正文可直接写
 * `<TaskBoard src="<assetPrefix>xx/yy.taskboard.json" />`；也可经
 * `import { TaskBoard } from "local-notes"` 单独引用。
 */
export type TaskBoardProps = {
  /** vault 资源 URL（如 /vault/xx/yy.taskboard.json），必填 */
  src: string;
  /** 容器高度，默认 "560px" */
  height?: string;
  /** 初始模式：read 阅读 / edit 编辑（编辑需 dev 保存服务 ping 通过） */
  mode?: "read" | "edit";
  /** 初始视图：board 看板 / table 表格 / calendar 日历 / stats 统计 */
  initialView?: "board" | "table" | "calendar" | "stats";
};

export const TaskBoard = TaskBoardVue as unknown as DefineComponent<TaskBoardProps>;

/** 组件形态（供使用方类型引用） */
export type TaskBoardComponent = Component<TaskBoardProps>;
