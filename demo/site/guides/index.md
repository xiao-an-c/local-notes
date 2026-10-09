---
title: 使用指南
---

# 使用指南

**local-notes** 是一个 VitePress 主题包：把你磁盘上的 Markdown 笔记库
（vault，Obsidian 完全兼容）发布成一个 VitePress 站点，并可选地在浏览器里
直接编辑——改动写回原始 `.md` 文件。对笔记目录结构**零假设**。

## 能力一览

| 能力 | 一句话 |
| --- | --- |
| 双链与反链 | `[[wikilink]]` 渲染、每页自动反向链接面板 |
| 知识图谱 | 任意页面 frontmatter 写 `graph: true` 即变整库力导向图谱 |
| 附件预览 | vault 内 PDF/EPUB/音视频等自动以 `/vault/` 前缀服务、进侧栏、整页预览 |
| 组件内嵌 | `<MindMap>` / `<PdfViewer>` / `<HtmlView>` 直接写在 Markdown 里 |
| 在线编辑 | Monaco 编辑器 + `Cmd/Ctrl+S` 写回文件、模板新建笔记、409 冲突保护（可整体关闭） |
| 静态降级 | `vitepress build` 产物完全可读，编辑能力自动隐藏 |

## 五分钟上手

```sh
pnpm add -D local-notes
```

```ts
// .vitepress/config.mts
import { withLocalNotes } from "local-notes";
export default withLocalNotes({ vaultDir: "../notes" }, { title: "My Notes" });
```

```ts
// .vitepress/theme/index.ts
import { localNotesTheme } from "local-notes/theme";
export default localNotesTheme();
```

两个接入点，六行代码，`pnpm dev` 即得一个可编辑的笔记站。

## 文档地图

| 篇 | 讲什么 |
| --- | --- |
| [快速开始](/guides/getting-started) | 安装、接入点逐行讲解、第一个笔记、跑起来 |
| [配置参考](/guides/configuration) | `withLocalNotes` 与主题选项全参数表、手动接线 API |
| [Markdown 能力](/guides/markdown) | 双链、反链、图谱页、PDF 自动内嵌 |
| [内嵌组件](/guides/components) | `<MindMap>` 等组件的用法与 props |
| [附件](/guides/assets) | 白名单后缀、`/vault/` 服务、侧栏合并、整页预览 |
| [在线编辑](/guides/editing) | 编辑此页、模板新建、冲突保护、静态降级 |
| [站点自有扩展](/guides/extras) | demo 自有的 `<Mermaid>` / `<CardGrid>` 与全屏规范 |

本站（demo）就是这个包的活样例——你现在读的页面全部由它渲染；仓库结构与
demo 的关系见 [快速开始](/guides/getting-started) 末节。
