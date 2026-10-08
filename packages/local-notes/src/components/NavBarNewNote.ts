import type { Component, DefineComponent } from "vue";
import NavBarNewNoteVue from "./edit/NavBarNewNote.vue";

/**
 * 顶栏「＋ 新建笔记」入口组件：挂于 Layout 的 nav-bar-content-before 插槽
 * （紧邻站点标题区、全站常驻），ping 探测通过（dev 编辑模式）才渲染；
 * 点击打开全局唯一的 NewNoteDialog。
 */
export const NavBarNewNote = NavBarNewNoteVue as unknown as DefineComponent<Record<string, never>>;

/** 组件形态（供使用方类型引用） */
export type NavBarNewNoteComponent = Component<Record<string, never>>;
