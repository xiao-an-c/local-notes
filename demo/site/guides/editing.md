---
title: 在线编辑
---

# 在线编辑

local-notes 的招牌能力：在浏览器里编辑笔记并写回磁盘上的原始 `.md` 文件。
整套能力可一键关闭（本 demo 站即关闭态）。

## 开关

```ts
// .vitepress/theme/index.ts
export default localNotesTheme({
  enableEditThisPage: true,   // 正文「✎ 编辑此页」入口
  enableNewNote: true,        // 顶栏「＋ 新建笔记」
});
```

`false` 时编辑器视图不渲染相关入口（组件与 dev API 不受影响）。
本 demo 站定位纯阅读，两项均为 `false`——恢复编辑能力 = 把
`demo/.vitepress/theme/index.ts` 里这两行删掉并重启 dev。

## 编辑此页

- 正文上方「✎ 编辑此页」打开 **Monaco** 编辑器（Markdown 语法高亮）
- `Cmd/Ctrl + S` 保存：走 dev API 写回文件，`tmp + rename` 原子写
- 保存**不会**重启 dev server（库自写追踪避免误触发自动重启），编辑会话不被打断
- 路由切换不打断编辑：编辑视图全局单例、跨路由持久

## 冲突保护（409）

打开编辑器时记录文件 `mtime`，保存时带上作基线。如果期间有外部工具
（Obsidian、脚本……）改过文件，API 回答 **409 Conflict** 并拒绝写入——
两个工具永远不会静默互相覆盖；Obsidian 侧会从磁盘变化自行察觉。

## 新建笔记与模板

顶栏「＋ 新建笔记」：选一个已有目录 → 可选一个模板 → 笔记在磁盘上创建并
直接进入编辑。模板就是 `templateDir`（如 `templates/`）下的普通 Markdown：

| 模板 | 用途 |
| --- | --- |
| `demo/site/templates/meeting-note.md` | 会议记录：议题 / 结论 / 待办三段式 |

- 模板正文被复制到目标位置，frontmatter 一并复制
- 新建写入走与编辑同一套安全链路（路径校验 + 原子写）
- 新增模板文件会触发自动重启，对话框里即时可选
- 模板目录被自动排除：不生成页面、不进菜单，但属于 vault（改动触发刷新）

## dev 专属与静态降级

写 API（`/api` 前缀：md 读写、思维导图保存）只存在于 `vitepress dev`。
`vitepress build` 时这些路由根本不存在，主题探测不到 API 会自动隐藏全部
编辑入口——**同一份内容，静态产物纯只读**，部署到任何静态托管都安全。

路径校验口径（读写同权）：只允许 `.md` / `.mindmap.json`；禁止 `..`、
隐藏目录与跳过清单目录；解析后必须仍在 `vaultDir` 内。
