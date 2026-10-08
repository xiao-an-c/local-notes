# Notes · 本地文档站

> 跑在本机的 Markdown 文档站：`site/` 是文档根，写普通 Markdown（兼容
> Obsidian 双链），由 [local-notes](https://github.com/xiao-an-c/local-notes)
> 发布成 VitePress 站点——知识图谱、反向链接、附件预览、思维导图开箱即用。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `site/` | **文档根** = VitePress `srcDir` = local-notes vault。`index.md` 首页、`graph.md` 知识图谱、`viewer.md` 附件预览、`guides/` 指南、`demo/` 演示、`components/` 组件文档；**侧栏菜单按文件夹结构自动生成** |
| `site/templates/` | 「新建笔记」模板（不生成页面、不进菜单） |
| `packages/local-notes/` | local-notes 库源码（原版 TS/Vue）。站点**直接相对导入源码**——无 dist、无包依赖，改库源码保存即生效 |
| `.vitepress/` | 站点工程：`config.mts` 配置、`theme/` 主题入口与站点样式、`word-count/` 字数徽标插件 |
| `tools/` | 命令行工具（`wordcount.ts` 字数统计等） |
| `.agents/docs/` | Agent 协作约定（Issues、标签、领域文档） |

## 快速开始

```sh
pnpm install
pnpm dev      # http://localhost:5173，改动即自动刷新
pnpm build    # 静态产物 → .vitepress/dist
pnpm preview  # 本地预览构建产物
```

## 站点能力

- **双链与反链**：`[[wikilink]]` 渲染、每页自动反向链接面板、整页知识图谱（frontmatter `graph: true`）
- **组件内嵌**：Markdown 正文直接写 `<HtmlView>`（自包含 HTML 报告）、`<MindMap>`（思维导图，dev 可在线编辑）、`<PdfViewer>`（PDF）——详见站点内 [组件文档](site/components/index.md)
- **附件预览**：vault 内 PDF/EPUB 链接自动指向 `/viewer` 预览页；build 产物同样可读
- **字数徽标**：每页标题下显示汉字/字符/段落（口径与命令行 `pnpm wordcount` 一致）
- **中文搜索**：Intl.Segmenter 词级分词，local search 可命中中文查询

编辑全家桶（浏览器内 Monaco 编辑、新建笔记对话框）在库中可用，本站以纯阅读姿态
运行——已用主题选项 `enableEditThisPage` / `enableNewNote` 停用，删掉
`.vitepress/theme/index.ts` 里这两行即可恢复。

## local-notes 源码直用

`packages/local-notes/src/` 保留了库的**原版 TS/Vue 源码**（含组件/插件/主题三层）：

- 站点经相对导入消费（`config.mts` 导入插件组、`theme/index.ts` 导入主题），改源码即时生效
- 历史定制：`RESTART_PENDING_EVENT` 常量移入双端安全的 `options.ts`（否则 dev 模式
  把 `node:fs` 拖进浏览器模块图）、主题新增 `enableEditThisPage` / `enableNewNote` 开关
- 重建 dist 非必需；若要独立打包需补装库的 devDependencies（见 `packages/local-notes/README.md`）

## 配置速查（`.vitepress/config.mts`）

| 配置 | 当前值 | 说明 |
| --- | --- | --- |
| `srcDir` | `site` | 文档根，路由从它算起 |
| `srcExclude` | `templates/**` | 模板不生成页面（仓库工程目录本就在文档根外） |
| 侧栏 | `generateSidebar` 动态扫描 | 按 `site/` 文件夹结构生成；仅排除 `templates/**` |
| 主题选项 | 阅读模式 | 编辑/新建入口关闭 |

## 字数统计

```sh
pnpm wordcount <目录>              # 按目录汇总汉字/字符数
pnpm wordcount <目录> --target <文件>   # 对照 frontmatter 里的 target-words 给进度
```

口径为 Unicode `Script=Han` 汉字数（平台交稿口径），与站点徽标共用同一内核
（`.vitepress/word-count/`）。

## 许可

MIT © 2026 xiao-an-c —— `packages/local-notes/` 自带库的 `LICENSE`。
