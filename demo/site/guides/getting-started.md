---
title: 快速开始
---

# 快速开始

从零把 local-notes 接到一个 VitePress 站点：装包 → 两个接入点 → 第一个笔记
→ 跑起来。全部代码与 [demo 站](/guides/) 的真实文件一字不差。

## 环境要求

- Node 22+（vitepress 2 要求；字数 CLI 直跑 TS 建议 23.6+）
- pnpm 9+（npm/yarn/bun 亦可，文档以 pnpm 为例）
- 一个装着 Markdown 文件的目录——就是你的 vault，无需任何预设结构

## 安装

```sh
pnpm add -D local-notes          # 从 npm（发布后）
```

或从 GitHub monorepo 的子目录直装（无需发包）：

```sh
pnpm add -D github:VibingNotes/local-notes#path:packages/local-notes
```

包是**源码直发**形态（`exports` 指向 TS/Vue 源码，无 dist）——你的 VitePress
构建管线天然会编译它，不需要任何额外配置。`vitepress` 与 `vue` 是 peer
依赖（保证全站单实例），其余重依赖（monaco-editor、force-graph、
simple-mind-map 等）由包自带。

## 接入点 1/2：站点配置（node 侧）

```ts
// .vitepress/config.mts
import { fileURLToPath } from "node:url";
import { withLocalNotes } from "local-notes";

// vault 根 = 这个站点要发布的目录。用绝对路径定位，不依赖启动命令的 cwd。
const vaultDir = fileURLToPath(new URL("../notes/", import.meta.url));

export default withLocalNotes(
  {
    vaultDir,                    // 笔记库根（缺省 <cwd>/site）
    templateDir: "templates",    // 可选：新建笔记模板目录（相对 vault）
  },
  // 第二个参数是普通 VitePress UserConfig，同名配置优先生效
  {
    title: "My Notes",
    themeConfig: { nav: [/* … */] },
  },
);
```

`withLocalNotes` 一个调用装齐全部 node 侧接线：

| 替你做的事 | 说明 |
| --- | --- |
| vite 插件组 | 反链/图谱索引、附件静态服务、思维导图保存 API、markdown 读写 API、笔记增删自动重启、HMR 竞态防护 |
| markdown-it 插件 | `.pdf` 链接与 `![[file.pdf]]` 自动内嵌 |
| 侧栏 | 文件夹结构即菜单（标题取笔记自身）+ 附件合并进对应分组 |
| `srcExclude` | `templates/**` 自动排除（配了 `templateDir` 时） |
| `ignoreDeadLinks` | 允许 wikilink 指向尚未创建的页面 |
| `outDir` / `configPath` | 自动探测（dev 自动重启需要） |

`[[wikilink]]` 渲染委托给社区插件（库不重复造轮子），在第二个参数里自己选型：

```ts
markdown: {
  config(md) {
    md.use(BiDirectionalLinks({ dir: vaultDir, isRelativePath: true, /* … */ }));
  },
},
```

注册顺序无需操心——`withLocalNotes` 保证库的 markdown-it 插件先于你的
`markdown.config` 执行。

## 接入点 2/2：主题入口（客户端）

```ts
// .vitepress/theme/index.ts
import { localNotesTheme } from "local-notes/theme";

export default localNotesTheme({
  homeFile: "index.md",                      // 首页对应的 vault 根文件
  excludedPages: ["graph.md", "viewer.md"],  // 不显示编辑入口的页面
});
```

主题 extends VitePress 默认主题并挂载：反链面板、图谱画布（`graph: true`
页面）、编辑入口与新建对话框（开关见 [在线编辑](/guides/editing)），并全局
注册 `<PdfViewer>` / `<MindMap>` / `<HtmlView>` / `<VaultFileViewer>`——
Markdown 正文里直接写标签即可。组件样式随主题入口自动加载。

## 你的第一个笔记

vault 就是普通目录，往里扔 Markdown：

```
notes/               ← vaultDir 指向这里
├── index.md         ← 站点首页（homeFile；没有它会用默认 README.md 规则）
├── guides/
│   └── hello.md     ← 路由 /guides/hello，自动进侧栏
└── assets/
    └── ref.pdf      ← 自动以 /vault/assets/ref.pdf 服务，进侧栏附件分组
```

- **路由** = 文件路径；**菜单** = 文件夹结构，新增文件无需任何注册
- **菜单文字** = frontmatter `title` > 正文一级标题 > 文件名
- dev 模式下笔记增删会自动重启并刷新页面，侧栏即时反映

## 跑起来

```sh
pnpm dev      # 可读 + 可编辑（写 API 只存在于 dev）
pnpm build    # 静态产物 → .vitepress/dist，完全可读、编辑能力自动隐藏
pnpm preview  # 预览构建产物
```

想暴露到局域网：`vitepress dev --host 0.0.0.0`。

## 附：本仓库（demo）怎么跑

本仓库是 local-notes 的 monorepo：`packages/local-notes/` 是包本体，
`demo/` 是消费它的 demo 站（vault 在 `demo/site/`）。克隆后：

```sh
pnpm install                      # 受限环境可加 --store-dir .pnpm-store
pnpm dev                          # 根脚本代理 pnpm -C demo dev（已带 --host）
pnpm build                        # 产物 → demo/.vitepress/dist
pnpm wordcount site/guides        # 字数统计 CLI（目录相对 demo/）
```

demo 经 `"local-notes": "workspace:*"` 消费包（symlink 指回源码），改
`packages/local-notes/src/` 保存即生效。
