# Markdown 展示

这里展示 local-notes 站点能渲染出什么。本页所有内容都是磁盘上的普通 `.md`
文件——本页链接到 [[what-is-local-notes]]，也被它反向链接（看下面的
**反链**面板）。

## 列表

- 双链：[[mindmap-demo]]、[[pdf-demo]]、[[2026-09-11]]
- 普通链接：[VitePress](https://vitepress.dev/)
- `行内代码`、**粗体**、*斜体*、~~删除线~~

## 表格

| 能力 | 静态构建可用？ | 需要 `pnpm dev`？ |
| --- | --- | --- |
| 阅读页面 | ✅ | — |
| 双链与反链 | ✅ | — |
| 思维导图 / PDF 展示 | ✅（只读） | 编辑需要 dev 服务 |
| 在浏览器里编辑笔记 | ❌ | ✅ |

## 代码块

```ts
// 这个示例站点服务端的全部接入代码：
localNotesPlugins({ vaultDir, templateDir: "templates" });
```

## 引用块与任务列表

> [!NOTE]
> Obsidian 的 callout 会渲染成 VitePress 容器。

- [x] 结构无关的笔记库
- [x] 两个页面互相链接
- [ ] 你的第一篇笔记——点顶栏 **＋ 新建笔记**
