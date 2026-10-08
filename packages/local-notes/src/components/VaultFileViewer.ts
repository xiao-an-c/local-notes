import type { Component, DefineComponent } from "vue";
import VaultFileViewerVue from "./VaultFileViewer.vue";

/**
 * 附件预览页组件：读取 location.hash 中的 `<assetPrefix><vault 相对路径>`
 * （含目录穿越防护），渲染 PdfViewer。使用方在工程页（路由默认 /viewer，
 * 由主题配置 viewerPath 决定）引用；侧栏附件（mergeVaultAssetSidebar）
 * 的链接即指向该页。
 */
export type VaultFileViewerProps = Record<string, never>;

export const VaultFileViewer = VaultFileViewerVue as unknown as DefineComponent<VaultFileViewerProps>;

/** 组件形态（供使用方类型引用） */
export type VaultFileViewerComponent = Component<VaultFileViewerProps>;
