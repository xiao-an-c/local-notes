---
title: Markdown 能力
---

# Markdown 能力

写笔记时直接可用的语法与自动行为。标准 Markdown 语法（表格/代码块/容器等）
由 VitePress 原生管道处理，这里只讲 local-notes 带来的部分。

## 双链 `[[wikilink]]`

```markdown
这句话链接到 [[快速开始]]——目标页底部的反向链接面板会列出本页。
```

- 渲染交给社区插件（本站用 `@nolebase/markdown-it-bi-directional-links`，
  在 `markdown.config` 里注册；换成任意同类实现都可以）
- 产出相对当前文档的链接，由 VitePress 原生重写为页面 URL
- 参与图谱与反链索引，与普通 Markdown 链接同权
- 指向**尚未创建**的页面不报错（`ignoreDeadLinks: true` 已由
  `withLocalNotes` 预置）——先写链接后建页的工作流没问题

## 反向链接面板

每页正文之后自动渲染「反向链接」，列出引用了本页的其他页面。零配置，
数据来自构建期的全库双链索引（dev 下笔记保存即时更新）。

## 知识图谱页

任何页面的 frontmatter 写 `graph: true`，该页正文区就变成**整库力导向
图谱**画布（节点 = 页面，边 = 双链，按顶层目录着色，颜色可在主题选项
`graphFolderColors` 里配）：

```yaml
---
title: 知识图谱
graph: true
---
```

本站的 [/graph](/graph) 就是这么来的。图谱页自动不挂反链面板
（整页画布与面板互斥）。

## PDF 链接自动内嵌

markdown-it 插件 `pdfEmbedPlugin` 自动把两种 PDF 写法转成内嵌预览卡片：

```markdown
详见 [参考手册](assets/ref.pdf)      ← 普通链接，目标以 .pdf 结尾
![[ref.pdf]]                          ← Obsidian 式附件嵌入
```

内嵌形态与 `<PdfViewer>` 组件一致（见[内嵌组件](/guides/components)）。
EPUB 等其他附件不会被内嵌，仍走 [附件](/guides/assets)的整页预览。

**真实演示**——下面原本是一行普通 Markdown 链接
（`[PDF 预览演示](/vault/guides/assets/demo.pdf)`），渲染时被
`pdfEmbedPlugin` 自动替换成了内嵌卡片：

[PDF 预览演示](/vault/guides/assets/demo.pdf)

## 字数徽标（demo 站自有）

每页 H1 下方显示「汉字 / 字符 / 段落」，悬停看全五项口径。这是 demo 站的
自有 markdown-it 插件（`.vitepress/word-count/`），**不在 npm 包里**——
作为「消费方可自建构建期插件」的示范。单页关闭：

```yaml
---
wordCount: false
---
```
