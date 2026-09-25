# PDF 示例

PDF 附件和其他文件一样放在笔记库里（这里是 `assets/sample.pdf`）。三种展示
方式：

## 1. 显式组件

```html
<PdfViewer src="/vault/assets/sample.pdf" height="480px" />
```

<PdfViewer src="/vault/assets/sample.pdf" height="480px" />

## 2. Markdown 链接指向 `.pdf`（自动内嵌）

[打开 sample.pdf（自动内嵌在下方）](../assets/sample.pdf)

## 3. Obsidian 风格嵌入

![[sample.pdf]]

每个附件也会进侧栏（靠 `mergeVaultAssetSidebar`），并能用整页 [[viewer]]
打开——这条链路在静态构建里同样可用，只有编辑能力需要 `pnpm dev`。
延伸阅读：[[what-is-local-notes]]。
