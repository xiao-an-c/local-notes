---
title: 首页
---

# 本地文档站

一个跑在本机的 **Markdown 文档站**，同时是 local-notes 主题包的 **demo 站**：
`demo/site/` 文件夹就是站点内容根，写普通的 Markdown（兼容 `[[双链]]`），由
[local-notes](https://github.com/xiao-an-c/notes)（pnpm workspace 主题包，源码在
`packages/local-notes/`）发布成 VitePress 站点——改库源码保存即生效。

## 站点里有什么

| 想看什么 | 去哪 |
| --- | --- |
| **完整使用文档**（安装、配置、Markdown、组件、附件、编辑） | [使用指南](/guides/) |
| 组件真实渲染（MindMap / HtmlView / Mermaid / CardGrid） | [内嵌组件](/guides/components) |
| 知识图谱 | 顶栏「图谱」，或 [直接打开](/graph) |
| 附件（PDF/EPUB）预览 | [/viewer](/viewer) |
| 在线编辑与模板机制 | [在线编辑](/guides/editing) |

## 上手三步

```sh
pnpm install && pnpm dev   # http://localhost:5173
```

目录结构、写笔记约定、常用命令与主题包接入，全部见
[使用指南](/guides/)。
