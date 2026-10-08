import type { Component, DefineComponent } from "vue";
import NewNoteDialogVue from "./edit/NewNoteDialog.vue";

/**
 * 新建笔记对话框组件：全局常驻（默认隐藏），经「＋ 新建笔记」按钮呼出；
 * 选目录映射后 POST 新建笔记，创建成功等待站点自动重启完成，随后跳转/自动
 * 进编辑；模板可选（服务端 templateDir 配置后才出现模板下拉）。
 */
export const NewNoteDialog = NewNoteDialogVue as unknown as DefineComponent<Record<string, never>>;

/** 组件形态（供使用方类型引用） */
export type NewNoteDialogComponent = Component<Record<string, never>>;
