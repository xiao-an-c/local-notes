# local-notes 是什么？

`local-notes` 是一套 [VitePress](https://vitepress.dev/) 主题 + 插件，把一个
本地 Markdown 笔记库发布成**可在浏览器里直接编辑**的网站。可以理解成
「Obsidian 笔记库，顺手变成文档站」：文件始终留在磁盘上，站点只是它的一扇窗。

- **对目录结构零假设**——这个示例笔记库故意用了最无聊的目录名
  （`notes/`、`journal/`、`projects/`）。把 `vaultDir` 指向**你的**根目录
  就完事了。
- **原地编辑**——基于 Monaco 的编辑器通过 dev 服务 API 把改动写回本地
  `.md` 文件，带乐观并发保护（文件在你背后被改过——比如 Obsidian 刚保存
  ——保存会返回 HTTP 409，绝不盲目覆盖）。
- **双链与反链**——`[[markdown-showcase]]` 这类链接渲染成普通超链接，
  每个页面底部自动列出反链。从 [[markdown-showcase]] 出发，看看底部的
  反链面板。
- **思维导图、图谱、PDF**——见 [[mindmap-demo]]、[[graph]] 页和
  [[pdf-demo]]。

## 接下来看什么？

1. [[markdown-showcase]]——支持哪些 Markdown 语法
2. [[mindmap-demo]]——内嵌且可编辑的思维导图
3. [[pdf-demo]]——PDF 附件与内嵌预览
4. [[2026-09-11]]——一篇普通日记，证明日记笔记不需要任何仪式
