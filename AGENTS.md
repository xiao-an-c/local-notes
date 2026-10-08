# AGENTS.md

本仓库是一个基于 local-notes 的本地 Markdown 文档站。改代码/加内容前先读这里的约定。

## 项目布局

```
site/                  文档根 = VitePress srcDir = local-notes vault
├── index.md           首页（路由 /）
├── graph.md           知识图谱页（frontmatter graph: true，路由 /graph）
├── viewer.md          附件预览页（路由 /viewer，VaultFileViewer 挂载点）
├── guides/            使用指南（含模板/新建笔记说明）
├── demo/              Markdown 演示 + 演示资产（HTML 报告、思维导图 JSON）
├── components/        组件文档
└── templates/         新建笔记模板（srcExclude，不生成页面不进菜单）
packages/local-notes/  local-notes 库源码（原版 TS/Vue；站点直接相对导入）
.vitepress/            站点工程：config.mts / theme/ / word-count/
tools/                 命令行脚本（wordcount.ts 等）
.agents/docs/          Agent 协作约定文档（点目录，站点扫描天然跳过）
```

## 常用命令

```sh
pnpm dev      # 开发；笔记增删自动重启 + 页面自动刷新
pnpm build    # 静态产物 → .vitepress/dist
pnpm preview  # 预览产物
pnpm wordcount <目录> [--target <文件>]   # 字数统计
```

## 关键约定（改前必读）

1. **local-notes 源码直用**：站点经相对导入消费 `packages/local-notes/src/`，
   没有 dist、没有包依赖。改库源码保存即生效；不要把库改回包依赖形态。
2. **双端边界**：`src/options.ts` 零依赖，node 侧与浏览器侧都能导入。客户端文件
   （`components/`、`theme/`）**严禁 import 插件文件**（`plugins/`）——插件依赖
   `node:fs`，vite dev 不做 tree-shaking，会把 node 内建模块拖进浏览器模块图直接报错。
3. **「附加配置」glob 陷阱**：VitePress 2 会扫描 srcDir 下所有
   `**/config.{js,mjs,ts,mts}` 并当作页面目录配置加载。文档根内不要放名为
   `config.*` 的文件；`packages/` 若回到文档根内必须重新加入 `srcExclude`。
4. **菜单 = 文件夹结构**：侧栏由 `generateSidebar` 动态扫描文档根生成（按文件名
   排序），仅 `templates/**` 被排除。新增内容文件夹无需注册，保存即进菜单。
5. **排除路径相对 srcDir**：`srcExclude`、wordCount `exclude`、
   `excludeByGlobPattern`（documentRootPath）各自以文档根/仓库根为基准，
   改路径时看清基准。
6. **阅读模式**：`enableEditThisPage` / `enableNewNote` 均为 false（纯阅读站）。
   恢复编辑能力 = 删掉 `.vitepress/theme/index.ts` 里这两行。
7. **重命名文档根**：`site/` 若要改名，需同步 `srcDir`、`vaultDir`、
   `documentRootPath` 三处（都在 `config.mts`）。

## Agent skills

### Issue tracker

Issues 记录在本仓库（xiao-an-c/notes）的 GitHub Issues。See `.agents/docs/issue-tracker.md`.

### Triage labels

采用默认五角色标签：needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix。See `.agents/docs/triage-labels.md`.

### Domain docs

single-context：全仓库共用根目录一份 CONTEXT.md，架构决定放 docs/adr/。See `.agents/docs/domain.md`.
