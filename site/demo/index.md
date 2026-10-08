---
title: Markdown 演示
---

# Markdown 全功能演示

本页演示站点支持的 Markdown 能力。所有能力都来自 VitePress 默认管道 +
local-notes 插件，写法与标准 Markdown/Obsidian 兼容。

## 双链与反链

这一段链接到 [组件文档](/components/)——因此组件文档页底部的**反向链接面板**
会列出本页；双链语法 `[[组件文档]]` 也能达到同样效果并参与知识图谱。

## 标题层级与大纲

下面的多级标题会出现在右侧「大纲」面板（顶栏「大纲」按钮开关，默认收起）。

### 三级标题

三级标题正文。四级标题不再进大纲（`outline.level: [2, 3]`）。

## 表格

| 语法 | 支持 | 说明 |
| --- | :-: | --- |
| GFM 表格 | ✅ | 对齐由冒号控制 |
| 任务列表 | ✅ | 见下 |
| 脚注 | ✅ | VitePress 内建 |

- [x] 已完成事项
- [ ] 待办事项

## 代码块

````md
```ts
// 代码高亮：Shiki，支持行号/行高亮等 VitePress 扩展语法
export const answer = 42;
```
````

## 引用与提示容器

> 引用块。VitePress 还提供容器语法：

::: info 信息
`info` / `tip` / `warning` / `danger` / `details` 五种容器。
:::

::: details 点开看折叠内容
折叠的 Markdown 正文。
:::

## 数学与自定义容器外的原生 HTML

原生 HTML 块在 Markdown 里可用（会被渲染进页面）：

<mark> marked 文本</mark> 与 <kbd>Ctrl</kbd> + <kbd>S</kbd>。

## 组件内嵌

Markdown 正文可以直接写全局注册的组件标签——这是本站的核心扩展能力：

- `<HtmlView src="/vault/….html" />` — 内嵌自包含 HTML 报告（见 [组件文档](/components/)）
- `<MindMap src="/vault/….mindmap.json" />` — 内嵌思维导图
- `<PdfViewer src="/vault/….pdf" />` — 内嵌 PDF

完整清单与真实渲染见 [组件文档](/components/)。
