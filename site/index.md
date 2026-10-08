---
title: 首页
---

# 本地文档站

一个跑在本机的 **Markdown 文档站**：`site/` 文件夹就是站点内容根，写普通的
Markdown（兼容 `[[双链]]`），由 [local-notes](https://github.com/xiao-an-c/local-notes)
发布成 VitePress 站点。库以**原版 TypeScript/Vue 源码**形式放在
`packages/local-notes/`，站点直接相对导入——没有 dist、没有包依赖，改库源码保存即生效。

## 站点里有什么

| 想看什么 | 去哪 |
| --- | --- |
| 组件文档与真实渲染演示（HtmlView / MindMap / 图谱 / 反链） | [components](/components/) |
| Markdown 全功能演示 | [demo](/demo/) |
| 模板与新建笔记机制 | [guides/templates](/guides/templates) |
| 知识图谱 | 顶栏「图谱」，或 [直接打开](/graph) |
| 附件（PDF/EPUB）预览 | [/viewer](/viewer) |

## 目录约定

| 路径 | 说明 |
| --- | --- |
| `site/` | 文档根 = VitePress `srcDir` = local-notes vault；侧栏菜单按文件夹结构自动生成 |
| `site/templates/` | 新建笔记模板（不生成页面、不进菜单） |
| `packages/local-notes/` | 库源码（原版 TS/Vue，无 dist、无包依赖） |
| `tools/` | 命令行工具 |
| `.vitepress/` | 站点工程：配置、主题入口、字数徽标插件 |

## 常用命令

```sh
pnpm dev      # 本地开发，改动即自动刷新
pnpm build    # 产出静态站点到 .vitepress/dist
pnpm preview  # 本地预览构建产物
```
