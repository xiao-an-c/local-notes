# AGENTS.md

本仓库是 local-notes 的 monorepo：`packages/local-notes` 是 VitePress 主题包（产品），`demo/` 是主题的 demo 站（= 本仓库的笔记站本体）。改代码/加内容前先读这里的约定。

## 项目布局

```
packages/local-notes/  🎨 主题包（pnpm workspace 包，name "local-notes"）
├── package.json       exports: "."（插件+withLocalNotes）/ "./theme" /
│                      "./components" / "./style.css"；源码直发，无 dist
└── src/
    ├── index.ts       "." 入口：vite/markdown-it 插件 + withLocalNotes()
    ├── config.ts      withLocalNotes：node 侧接线一站装齐（插件/侧栏/srcExclude）
    ├── theme/         "./theme" 入口：localNotesTheme() extends 默认主题
    ├── components/    组件（编辑器/图谱/思维导图/PDF/HtmlView…）
    └── plugins/       vite/markdown-it 插件（node 侧，客户端严禁 import）
demo/                  📺 demo 站（主题的标准消费者示范）
├── package.json       "local-notes": "workspace:*"（symlink 指回源码）
├── .vitepress/
│   ├── config.mts     withLocalNotes(...) + demo 自有配置
│   ├── theme/index.ts localNotesTheme() + 站点层包装
│   ├── components/    demo 自有组件：Mermaid / CardGrid / FullscreenOverlay
│   └── word-count/    demo 自有字数徽标插件
├── site/              文档根 = VitePress srcDir = local-notes vault
│   ├── index.md       首页（路由 /）
│   ├── graph.md       知识图谱页（frontmatter graph: true，路由 /graph）
│   ├── viewer.md      附件预览页（路由 /viewer，VaultFileViewer 挂载点）
│   ├── guides/        使用指南（npm 包文档，含 assets/ 演示资产）
│   └── templates/     新建笔记模板（srcExclude，不生成页面不进菜单）
└── tools/wordcount.ts 字数统计 CLI
tools/                 仓库级脚本（tts.mjs）
.agents/docs/          Agent 协作约定文档（点目录，站点扫描天然跳过）
```

## 常用命令

```sh
pnpm dev      # 开发（根脚本代理 pnpm -C demo dev）；笔记增删自动重启 + 页面自动刷新
pnpm build    # 静态产物 → demo/.vitepress/dist
pnpm preview  # 预览产物
pnpm wordcount <目录> [--target <文件>]   # 字数统计（目录相对 demo/，如 site/guides）
```

## 关键约定（改前必读）

1. **workspace 包消费**：demo 经包名 `"local-notes"` 消费主题包（pnpm workspace
   symlink 指回 `packages/local-notes/src` 源码，无 dist）。改库源码保存即生效。
   装依赖用 `pnpm install`（可能需 `--store-dir .pnpm-store`，沙箱环境下）。
2. **双端边界**：`src/options.ts` 零依赖，node 侧与浏览器侧都能导入。客户端文件
   （`components/`、`theme/`）**严禁 import 插件文件**（`plugins/`）——插件依赖
   `node:fs`，vite dev 不做 tree-shaking，会把 node 内建模块拖进浏览器模块图直接报错。
3. **库内相对导入必须带扩展名**（`.ts` 或 `/index.ts`）：包经 exports 被消费时走
   Node 原生 ESM 严格解析（VitePress config 加载器外部化 node_modules 包），
   目录导入/省略扩展名会直接报 ERR_UNSUPPORTED_DIR_IMPORT。
4. **「附加配置」glob 陷阱**：VitePress 2 会扫描 srcDir 下所有
   `**/config.{js,mjs,ts,mts}` 并当作页面目录配置加载。文档根（demo/site）内
   不要放名为 `config.*` 的文件；`packages/` 与 workspace 链接的 `node_modules/`
   都在文档根之外，天然不可见。
5. **菜单 = 文件夹结构**：侧栏由 `withLocalNotes` 内的 `generateSidebar` 动态扫描
   文档根生成（按文件名排序），`templates/**` 自动排除，站点功能页在 config.mts
   的 `sidebar.excludeByGlobPattern` 里排除。新增内容文件夹无需注册，保存即进菜单。
6. **排除路径相对 srcDir**：`srcExclude`、wordCount `exclude`、
   `excludeByGlobPattern`（documentRootPath）各自以文档根/仓库根为基准，
   改路径时看清基准。
7. **阅读模式**：`enableEditThisPage` / `enableNewNote` 均为 false（纯阅读 demo）。
   恢复编辑能力 = 删掉 `demo/.vitepress/theme/index.ts` 里这两行。
8. **重命名文档根**：`demo/site/` 若要改名，改 config.mts 里 `vaultDir` 一处即可
   （srcDir 与侧栏 documentRootPath 由 withLocalNotes 从 vaultDir 推导）。

## Agent skills

### Issue tracker

Issues 记录在本仓库（VibingNotes/local-notes）的 GitHub Issues。See `.agents/docs/issue-tracker.md`.

### Triage labels

采用默认五角色标签：needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix。See `.agents/docs/triage-labels.md`.

### Domain docs

single-context：全仓库共用根目录一份 CONTEXT.md，架构决定放 docs/adr/。See `.agents/docs/domain.md`.
