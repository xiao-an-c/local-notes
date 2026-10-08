# local-notes

把一个本地 Markdown 笔记库（Obsidian 完全兼容）发布成
[VitePress](https://vitepress.dev/) 站点，**并且可以在浏览器里直接编辑**——
Monaco 在线编辑、思维导图、知识图谱、双链与反链、PDF/附件预览。
**对笔记目录结构零假设。**

- 许可：[MIT](./LICENSE) —— Copyright (c) 2026 xiao-an-c
- 仓库：<https://github.com/xiao-an-c/local-notes>
- 状态：v0.1.0 —— 下列功能全部实现，并由内置的 demo 笔记库
  （[`demo/`](./demo)）实际跑通
- 语言说明：本文档以中文为主；库内代码注释为中文，`demo/` 是可运行的活样例。

## 为什么做这个

你的笔记本来就已经是磁盘上的普通 `.md` 文件——不管它是 Zettelkasten、
Obsidian 笔记库，还是就是一堆文档文件夹。静态站点生成器能发布它们，但都把
笔记库当成**只读输入**。local-notes 让笔记库始终是唯一事实源，把发布出来的
站点变成一扇**带门的窗**：你可以在任何地方阅读它；而当你坐在拥有这些文件的
机器前，可以直接在浏览器里编辑——改动直接写回本地 Markdown 文件。

## 功能

| 功能 | 你得到什么 |
| --- | --- |
| **浏览器内编辑** | 任意笔记上的「编辑此页」打开 Monaco 编辑器；`Cmd/Ctrl+S` 写回本地 `.md` 文件（tmp+rename 原子写） |
| **套模板新建笔记** | 顶栏「＋ 新建笔记」按钮：选一个已有目录、可选一个模板文件；笔记在磁盘上创建并直接进入编辑 |
| **冲突保护** | 基于文件 mtime 的乐观并发：如果你打开编辑器之后有外部工具（Obsidian、脚本……）保存过该文件，保存会返回 **HTTP 409**，什么都不会被覆盖 |
| **思维导图** | `<MindMap src="/vault/xxx.mindmap.json" />` 嵌入可交互思维导图；dev 下可编辑（双击 / Tab / Enter），并自动保存回 JSON 文件 |
| **知识图谱** | 任何 frontmatter 含 `graph: true` 的页面都会渲染整库的力导向图谱（由双链构建） |
| **双链与反链** | `[[...]]` 目标交给任意双向链接 markdown-it 插件解析；每个页面自动获得反链面板 |
| **PDF 与附件** | `<PdfViewer>`、指向 `.pdf` 的链接自动内嵌、Obsidian `![[file.pdf]]` 嵌入；附件以可配置前缀（默认 `/vault/`）提供，合并进侧栏，并可在整页查看器中打开 |
| **结构无关** | 不要求任何目录名：笔记库根目录、模板目录、首页文件、查看器路由……全是显式配置项。内置 `demo/` 笔记库只用了 `notes/`、`journal/`、`projects/` |
| **静态构建优雅降级** | `vitepress build` 产物完全可读（图谱、反链、思维导图、PDF 都在）——编辑能力会自己隐藏，因为写 API 只存在于 `vitepress dev` 下 |

## 快速开始

最快的办法是把内置 demo 复制走：**[`packages/local-notes/demo/`](./demo)**
就是一个完整可跑的站点，它的笔记库只是几个普通目录（`notes/`、`journal/`、
`projects/`、`templates/`、`assets/`）。它的 `.vitepress/config.mts` +
`.vitepress/theme/index.ts` 就是下面所有内容的活版本。

```sh
pnpm add -D local-notes
```

依赖分成两组（刻意为之）：

| 组 | 包 | 原因 |
| --- | --- | --- |
| `peerDependencies` | `vitepress ^2.0.0-alpha.20`、`vite ^8`、`vue ^3.5`、`markdown-it ^14` | VitePress 站点本来就有它们；用 peer 保证全局只有一份实例 |
| `dependencies` | `simple-mind-map`、`monaco-editor`、`force-graph` | 这些是又重又专属的库，你平时不会为了别的事装它们——由本库自带，装完即可用 |

**接入点 1/2 —— `.vitepress/config.mts`**（取自 demo，逐字）：

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";
import { BiDirectionalLinks } from "@nolebase/markdown-it-bi-directional-links";
import { generateSidebar } from "vitepress-sidebar";
import {
  localNotesMarkdownItPlugins,
  localNotesPlugins,
  mergeVaultAssetSidebar,
} from "local-notes";

// 笔记库根 = 这个站点要发布的目录。用绝对路径，不依赖启动命令的 cwd。
const vaultDir = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig({
  vite: {
    // ⭐ 一次调用装齐：反链/图谱索引、附件静态服务、思维导图保存 API、
    // markdown 读写/新建 API（409 冲突保护）、笔记增删自动重启、HMR 竞态
    // 防护。传 outDir 后还会追加 build 期附件拷贝。
    plugins: localNotesPlugins({
      vaultDir,
      templateDir: "templates",
      outDir: fileURLToPath(new URL("./dist", import.meta.url)),
      // VitePress 2 的坑：dev 下 vite 的 configFile 为空，自动重启插件需要
      // 显式拿到配置文件路径才能在笔记增删时 touch 它
      configPath: fileURLToPath(new URL("./config.mts", import.meta.url)),
    }),
  },
  markdown: {
    config(md) {
      // markdown-it 形态的插件走次级入口，且必须注册在双链插件之前
      // （pdfEmbed 只拦截 .pdf 目标）
      for (const p of localNotesMarkdownItPlugins({ vaultDir })) md.use(p);
      // [[双链]] 渲染交给社区插件——你想换成任何同类实现都可以
      md.use(
        BiDirectionalLinks({
          dir: vaultDir,
          includesPatterns: ["**/*.md"],
          excludesPatterns: ["node_modules/**", ".vitepress/**", "dist/**"],
          noNoMatchedFileWarning: true,
          isRelativePath: true,
        }),
      );
    },
  },
  themeConfig: {
    // 动态扫描笔记库生成侧栏（推荐做法）：有了库的自动重启 + 页面自动刷新，
    // 新增/删除的笔记会立刻反映到菜单。也可以换成别的侧栏生成器或手写静态
    // 数组——只是新文件不会自己进菜单。
    sidebar: mergeVaultAssetSidebar(
      generateSidebar({
        documentRootPath: ".", // 相对 process.cwd()
        excludeByGlobPattern: ["node_modules/**", ".vitepress/**", "dist/**", "templates/**"],
        capitalizeFirst: true,
        collapsed: true,
      }),
      { vaultDir }, // 把笔记库里的 PDF/EPUB 合并进侧栏
    ),
  },
});
```

**接入点 2/2 —— `.vitepress/theme/index.ts`**（取自 demo，逐字）：

```ts
import { localNotesTheme } from "local-notes/theme";
import "local-notes/style.css";

export default localNotesTheme({
  // 首页 = 笔记库根目录的 index.md（「编辑此页」与新建后跳转据此经 VitePress
  // rewrites 反向映射回真实文件）
  homeFile: "index.md",
  // 站点工程页不显示编辑入口（rewrites 之后的 relativePath）
  excludedPages: ["graph.md", "viewer.md"],
});
```

跑起来：

```sh
pnpm dev        # 可读 + 可编辑（写 API 只存在于 dev）
pnpm build      # 静态产物，完全可读，编辑能力自动隐藏
```

主题替你挂载了什么：「编辑此页」入口、新建笔记对话框、全局单例编辑视图、
反链面板，以及 `graph: true` 页面上的整页图谱画布。`<PdfViewer>`、
`<MindMap>`、`<VaultFileViewer>` 已全局注册，Markdown 里可以直接写标签。

## 编辑是怎么工作的（以及怎么降级）

- `vitepress dev`：local-notes 在 `apiBase`（默认 `/api`）下挂 Vite 中间件。
  浏览器编辑器 GET 一篇笔记连同它的 `mtime`，再用这个 `mtime` 作为基线
  PUT 回内容。如果文件期间被改过——Obsidian 保存了、脚本 touch 了——API 会
  回答 **409 Conflict** 并拒绝写入，两个工具永远不会静默互相覆盖。写入是
  原子的（`tmp` + `rename`）。每个路径都做校验：后缀只允许
  `.md`/`.mindmap.json`、禁止 `..`、禁止隐藏目录与跳过清单里的目录，且解析
  后的路径必须仍在 `vaultDir` 内。
- `vitepress build`：静态产物里这些路由根本不存在。主题会探测 API
  （`/api/md/ping`、`/api/mindmap/ping`）并隐藏所有编辑入口——同样的内容，
  只读。

## 与 Obsidian 共存

两个工具读写的是同一批纯文本文件，所以天然协作：

- `.obsidian/` 在内置跳过清单里——配置与插件状态永不被扫描、提供或编辑。
- 两边同时打开时，先保存者生效，另一方收到冲突信号（浏览器编辑器是 409；
  Obsidian 会从磁盘变化察觉）。不会做合并，也不会静默覆盖。
- 双链渲染是委托出去的（demo 用的是
  `@nolebase/markdown-it-bi-directional-links`），所以在 Obsidian 里写的
  `[[folder/note]]` 在站点上解析结果一致。

## 配置项参考

### `LocalNotesOptions` —— 插件组（`localNotesPlugins` 等）

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `vaultDir` | `string` | 必填 | 笔记库根目录；绝对路径，或相对 VitePress 站点根目录的路径 |
| `extraSkipDirs` | `string[]` | — | 追加的跳过目录，与内置 `DEFAULT_SKIP_DIRS`（node_modules/.git/.obsidian/.vitepress/dist/web 等工程与隐藏目录）合并 |
| `templateDir` | `string` | `undefined` | 新建笔记的模板目录（相对笔记库）；`undefined` 表示整体关闭该能力：目录接口不返回模板，POST 带 `template` 字段会被 400 拒绝 |
| `assetPrefix` | `string` | `"/vault/"` | 静态资源（PDF/EPUB/思维导图数据）的 URL 前缀 |
| `apiBase` | `string` | `"/api"` | dev API 的路由前缀（md 读写、思维导图保存等） |
| `homeFile` | `string` | `"README.md"` | 作为站点首页的笔记库根文件（会被 rewrites 成 index.md） |
| `viewerPath` | `string` | `"/viewer"` | 附件查看页路由（侧栏链接形如 `<viewerPath>#<assetPrefix><相对路径>`） |
| `excludedPages` | `string[]` | `[]` | 站点工程页（图谱页/查看器页……）的笔记库相对路径，供你的 rewrites/srcExclude 记账用 |
| `outDir` | `string` | `undefined` | build 期附件拷贝的目标目录（VitePress 的 outDir）；设置后插件组会追加拷贝插件 |
| `configPath` | `string` | 自动 | 笔记增删时自动重启插件要 touch 的配置文件；默认取 Vite 实际加载的 configFile |

### `LocalNotesThemeOptions` —— 主题入口（`localNotesTheme`）

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `assetPrefix` | `string` | `"/vault/"` | 前端拼资源 URL 用的前缀；必须与服务端一致 |
| `viewerPath` | `string` | `"/viewer"` | 附件查看页路由；必须与服务端一致 |
| `apiBase` | `string` | `"/api"` | 前端 fetch 编辑/思维导图 API 的前缀；必须与服务端一致 |
| `homeFile` | `string` | `"README.md"` | 用于把站点首页反向映射回笔记库文件，以便编辑 |
| `excludedPages` | `string[]` | `[]` | 永不显示编辑入口的站点页面（rewrites 后的 relativePath） |
| `defaultNewNoteDir` | `string` | `undefined` | 新建笔记对话框里预选的目录；默认取第一个顶层目录 |
| `graphFolderColors` | `Record<string, string>` | `{}` | 图谱按顶层目录着色（目录名 → CSS 颜色）；未列出的目录用中性灰——配色属于**你的**项目，库从不瞎猜 |

## 一分钟看懂架构

- **`local-notes`（node 入口）** —— 一组 Vite 插件：
  `backlinksPlugin`（虚拟模块 `virtual:backlinks` / `virtual:graph`）、
  `vaultAssetPlugin`（dev 下按 `assetPrefix` 提供静态服务）、
  `vaultAssetCopyPlugin`（build 期拷贝，需要 `outDir`）、
  `mindmapApiPlugin` + `mdApiPlugin`（dev 写 API）、
  `vaultMdAutoRestart`（笔记增删时重启 dev 服务，新页面立刻可用）、
  `vueHmrGuardPlugin`（HMR 竞态防护）。另有 `pdfEmbedPlugin`——把 `.pdf`
  链接与 `![[file.pdf]]` 嵌入变成内嵌预览卡片的 markdown-it 插件，以及
  `mergeVaultAssetSidebar`——把笔记库附件合并进任意侧栏数组的纯数据工具。
- **`local-notes/theme`** —— 扩展 VitePress 默认主题的主题：把编辑入口、
  新建笔记对话框、单例编辑器、反链面板与图谱画布挂进 Layout 插槽，并全局
  注册 `PdfViewer` / `MindMap` / `VaultFileViewer`。
- **`local-notes/components`** —— 同一批组件导出，供自定义主题使用。组件
  依赖 VitePress 客户端运行时，所以入口必须拆开；node 入口保持 node 安全。
- 笔记库从不被复制用于编辑：dev API 直接写原始文件；构建只把**附件**
  （PDF/EPUB/思维导图 JSON）拷进 `outDir`。

## 开发

```sh
pnpm --filter local-notes build       # vite lib 模式 → dist/（ESM，3 个入口 + .d.ts + style.css）
pnpm --filter local-notes typecheck   # tsc --noEmit
pnpm --filter local-notes smoke       # node 侧导出面 + dev API 行为探针
cd packages/local-notes/demo
pnpm dev                              # 跑 demo 站点（编辑能力开启）
node api-selftest.mjs                 # 19 条断言的 dev API 自测（自清理）
pnpm build                            # demo 静态构建（只读降级）
```

## 许可

[MIT](./LICENSE) —— Copyright (c) 2026 xiao-an-c。
