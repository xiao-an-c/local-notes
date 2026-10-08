import type { Component, DefineComponent } from "vue";
import MindMapVue from "./MindMap.vue";

/**
 * MindMap 组件：渲染 vault 内 `<name>.mindmap.json` 思维导图（simple-mind-map）；
 * edit 模式经 mindmap 保存 API 写回本地文件。主题入口已全局注册，markdown
 * 正文可直接写 `<MindMap src="<assetPrefix>xx/yy.mindmap.json" />`；
 * 也可经 `import { MindMap } from "local-notes"` 单独引用。
 */
export type MindMapProps = {
  /** vault 资源 URL（如 /vault/xx/yy.mindmap.json），必填 */
  src: string;
  /** 容器高度，默认 "420px" */
  height?: string;
  /** 初始模式：read 阅读 / edit 编辑（编辑需 dev 保存服务 ping 通过） */
  mode?: "read" | "edit";
};

export const MindMap = MindMapVue as unknown as DefineComponent<MindMapProps>;

/** 组件形态（供使用方类型引用） */
export type MindMapComponent = Component<MindMapProps>;
