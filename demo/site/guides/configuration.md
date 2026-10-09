---
title: 配置参考
---

# 配置参考

三组配置：**站点组合**（`withLocalNotes`，node 侧）、**主题选项**
（`localNotesTheme`，客户端）、以及不想用组合入口时的**手动接线 API**。

## `withLocalNotes(site, user)`

签名：`withLocalNotes(site?: LocalNotesSiteOptions, user?: UserConfig): UserConfig`。
`user` 是普通 VitePress 配置且同名项优先生效（`srcDir` 除外，始终由 vault
位置推导）。`site` 的全部字段：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `vaultDir` | `string` | `<cwd>/site` | 笔记库根。绝对路径，或相对站点根（`pnpm dev` 的运行目录） |
| `srcDir` | `string` | 从 `vaultDir` 推导 | VitePress 文档根（如 `site`）；一般不用显式给 |
| `templateDir` | `string` | — | 新建笔记模板目录（相对 vault）；给了才启用模板能力，并自动加进 `srcExclude` 与侧栏排除 |
| `assetPrefix` | `string` | `"/vault/"` | 附件 URL 前缀，须与主题选项一致 |
| `apiBase` | `string` | `"/api"` | dev 写 API 路由前缀，须与主题选项一致 |
| `homeFile` | `string` | `"README.md"` | 作为站点首页的 vault 根文件（供 rewrites 记账） |
| `viewerPath` | `string` | `"/viewer"` | 附件整页预览路由 |
| `excludedPages` | `string[]` | `[]` | 站点工程页（图谱页/预览页）的 vault 相对路径 |
| `extraSkipDirs` | `string[]` | — | 追加的扫描跳过目录（内置已含 node_modules/.git/.obsidian/.vitepress/dist 等） |
| `outDir` | `string` | 自动 | build 附件拷贝目标；缺省取 `user.outDir` 或 `<root>/.vitepress/dist` |
| `configPath` | `string` | 自动探测 | dev 自动重启要 touch 的配置文件；缺省探测 `<root>/.vitepress/config.{mts,ts,mjs,js}` |
| `sidebar` | `false \| 选项` | `{}` | 侧栏生成选项（见下）；`false` = 不生成，用 `user.themeConfig.sidebar` |

### `sidebar` 选项

透传给 `vitepress-sidebar` 的 `generateSidebar`，外加一个 `documentRootPath`
（缺省同 `srcDir`）。预置的「笔记站约定」默认值（均可覆盖）：

```ts
withLocalNotes({
  sidebar: {
    excludeByGlobPattern: ["graph.md", "viewer.md"],  // 不进菜单的页面
    // 其余 generateSidebar 选项照常透传
  },
});
```

- 标题取笔记自身：frontmatter `title` > 正文一级标题 > 文件名
- 目录分组标题取该目录 `index.md` 的一级标题，分组指向它
- 不做大写化（中文站无意义）、默认折叠
- `templates/**` 自动排除；分组链接结尾的 `index.md` 自动剥掉

菜单默认按文件名字母序。要按**阅读顺序**排列，用
`manualSortFileNameByPriority`（匹配裸文件名/目录名，列表内置顶）：

```ts
withLocalNotes({
  sidebar: {
    manualSortFileNameByPriority: [
      "getting-started.md",   // guides/ 子页按文档顺序
      "configuration.md",
      // …
    ],
  },
});
```

## `localNotesTheme(options)`

主题入口（`.vitepress/theme/index.ts`）的客户端选项，全部字段：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `assetPrefix` | `string` | `"/vault/"` | 前端拼附件/导图 URL 的前缀；须与服务端一致 |
| `viewerPath` | `string` | `"/viewer"` | 附件预览页路由；须与服务端一致 |
| `apiBase` | `string` | `"/api"` | 前端 fetch 编辑/导图 API 的前缀；须与服务端一致 |
| `homeFile` | `string` | `"README.md"` | 首页逆映射（`index.md` → 该文件），编辑跳转用 |
| `excludedPages` | `string[]` | `[]` | 不显示「编辑此页」的页面（relativePath） |
| `defaultNewNoteDir` | `string` | 首个顶层目录 | 新建对话框预选目录（vault 相对路径） |
| `graphFolderColors` | `Record<string, string>` | `{}` | 图谱按顶层目录着色（目录名 → CSS 颜色）；未列出用中性灰——配色属于你的项目，库不瞎猜 |
| `enableEditThisPage` | `boolean` | `true` | 显示「✎ 编辑此页」入口（编辑器仍挂载，只藏按钮） |
| `enableNewNote` | `boolean` | `true` | 显示顶栏「＋ 新建笔记」；`false` 时对话框一并不挂载 |

## 手动接线 API

不想让 `withLocalNotes` 替你合并？直接用底层导出（都来自 `"local-notes"`）：

| 导出 | 形态 | 用途 |
| --- | --- | --- |
| `localNotesPlugins(options)` | vite 插件数组 | 进 `vite.plugins`；传 `outDir` 后追加 build 附件拷贝 |
| `localNotesMarkdownItPlugins(options)` | markdown-it 插件数组 | 进 `markdown.config`，须注册在双链插件之前 |
| `mergeVaultAssetSidebar(sidebar, options)` | 纯数据函数 | 把 vault 附件合并进你自己的侧栏数组 |
| `generateSidebar`（vitepress-sidebar） | 第三方 | 你本就直接可用 |

单个插件也可独立引入：`backlinksPlugin`（双链索引 + `virtual:backlinks`/
`virtual:graph` 虚拟模块）、`vaultAssetPlugin`（附件静态服务）、
`vaultAssetCopyPlugin`（build 拷贝）、`mdApiPlugin` / `mindmapApiPlugin`
（dev 写 API）、`vaultMdAutoRestart`（自动重启）、`vueHmrGuardPlugin`
（HMR 竞态防护）、`pdfEmbedPlugin`（PDF 链接内嵌）。
