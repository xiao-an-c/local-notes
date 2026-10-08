---
title: 模板与新建笔记
---

# 模板与新建笔记（templates）

站点内置「从模板新建笔记」的能力：模板放在文档根的 `site/templates/` 文件夹，
新建时选择模板，正文被复制到目标位置并替换占位符。

## 当前状态

本站定位纯阅读，顶栏「＋ 新建笔记」入口已通过主题选项停用（编辑组件同理）：

```ts
// .vitepress/theme/index.ts
enableEditThisPage: false,
enableNewNote: false,
```

想启用：删掉这两行（或改为 `true`）并重启 dev server——顶栏出现「＋ 新建笔记」，
点击后选目录、选模板即可创建；dev 模式下创建后页面自动跳转。

## 内置模板

| 模板 | 用途 |
| --- | --- |
| `site/templates/meeting-note.md` | 会议记录：议题 / 结论 / 待办三段式 |

模板就是普通 Markdown，直接编辑文件即可修改。支持 frontmatter（标题、标签等
会被一并复制）。

## 添加自己的模板

1. 在 `site/templates/` 下新建 `my-template.md`
2. 写好骨架（可用 frontmatter）
3. 重启 dev（新增模板文件会触发自动重启）→「＋ 新建笔记」对话框里即可选中

## 机制说明

- 模板目录由 `config.mts` 里 `localNotesPlugins({ templateDir: "templates" })`
  指定（相对文档根）
- 模板文件被 `srcExclude` 与侧栏排除规则挡住：**不生成页面、不进菜单**，
  但属于 vault 的一部分（改模板会触发页面自动刷新）
- 新建写入走 md API（mtime 乐观锁 + 原子写），与浏览器在线编辑同一套安全链路
