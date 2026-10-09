# Notes · local-notes monorepo

> **主题包 + demo 站**：`packages/local-notes` 是可安装的 VitePress 主题包
> （Monaco 编辑、知识图谱、双链反链、附件预览、思维导图），`demo/` 是主题的
> demo 站——也就是本仓库自己的笔记站：`demo/site/` 写普通 Markdown（兼容
> Obsidian 双链），由主题包发布成 VitePress 站点。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `packages/local-notes/` | 🎨 **主题包**（pnpm workspace 包，name `local-notes`）。四入口：`.`（vite/markdown-it 插件 + `withLocalNotes()` 配置组合）、`./theme`（`localNotesTheme()`）、`./components`、`./style.css`。源码直发，无 dist |
| `demo/` | 📺 **demo 站**（主题的标准消费者示范 = 本仓库笔记站本体） |
| `demo/site/` | **文档根** = VitePress `srcDir` = vault。`index.md` 首页、`graph.md` 知识图谱、`viewer.md` 附件预览、`guides/` 指南、`demo/` 演示、`components/` 组件文档；**侧栏菜单按文件夹结构自动生成** |
| `demo/site/templates/` | 「新建笔记」模板（不生成页面、不进菜单） |
| `demo/.vitepress/` | 站点工程：`config.mts`（`withLocalNotes()` + 站点自有配置）、`theme/` 主题入口与站点样式、`components/` 站点自有组件（Mermaid/CardGrid）、`word-count/` 字数徽标插件 |
| `demo/tools/` | 字数统计 CLI（`wordcount.ts`） |
| `tools/` | 仓库级脚本（`tts.mjs`） |
| `.agents/docs/` | Agent 协作约定（Issues、标签、领域文档） |

## 快速开始

```sh
pnpm install
pnpm dev      # http://localhost:5173，改动即自动刷新（根脚本代理 demo）
pnpm build    # 静态产物 → demo/.vitepress/dist
pnpm preview  # 本地预览构建产物
```

## demo 如何消费主题包

**配置侧**（`demo/.vitepress/config.mts`）——node 侧接线一站装齐：

```ts
import { withLocalNotes } from "local-notes";

export default withLocalNotes(
  { vaultDir, templateDir: "templates", sidebar: { excludeByGlobPattern: [...] } },
  { title: "...", markdown: { config(md) { /* wikilink 插件、字数徽标 */ } }, themeConfig: { nav } },
);
```

`withLocalNotes` 负责：vite 插件组（反链/图谱索引、附件服务、编辑 API、自动重启）、
markdown-it 插件、侧栏生成（文件夹结构即菜单 + 附件合并）、`srcExclude`、
`ignoreDeadLinks`、`outDir`/`configPath` 探测。

**主题侧**（`demo/.vitepress/theme/index.ts`）：

```ts
import { localNotesTheme } from "local-notes/theme";
export default { ...localNotesTheme({ ... }), enhanceApp(ctx) { /* 注册 Mermaid 等 */ } };
```

改库源码（`packages/local-notes/src/`）保存即生效——workspace symlink 指回源码，
无 dist、无构建步骤。

## 站点能力

- **双链与反链**：`[[wikilink]]` 渲染、每页自动反向链接面板、整页知识图谱（frontmatter `graph: true`）
- **组件内嵌**：Markdown 正文直接写 `<HtmlView>`（自包含 HTML 报告）、`<MindMap>`（思维导图，dev 可在线编辑）、`<PdfViewer>`（PDF）——详见站点内 [使用指南](demo/site/guides/) 与 [内嵌组件](demo/site/guides/components.md)
- **附件预览**：vault 内 PDF/EPUB 链接自动指向 `/viewer` 预览页；build 产物同样可读
- **字数徽标**：每页标题下显示汉字/字符/段落（口径与命令行 `pnpm wordcount` 一致）
- **中文搜索**：Intl.Segmenter 词级分词，local search 可命中中文查询

编辑全家桶（浏览器内 Monaco 编辑、新建笔记对话框）在主题包中可用，demo 以纯阅读
姿态运行——已用主题选项 `enableEditThisPage` / `enableNewNote` 停用，删掉
`demo/.vitepress/theme/index.ts` 里这两行即可恢复。

## 字数统计

```sh
pnpm wordcount <目录>              # 按目录汇总汉字/字符数（目录相对 demo/，如 site/guides）
pnpm wordcount <目录> --target <文件>   # 对照 frontmatter 里的 target-words 给进度
```

口径为 Unicode `Script=Han` 汉字数（平台交稿口径），与站点徽标共用同一内核
（`demo/.vitepress/word-count/`）。

## 许可

MIT © 2026 xiao-an-c —— `packages/local-notes/` 自带库的 `LICENSE`。
