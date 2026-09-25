# local-notes · 示例站点

> **local-notes** 的官方示例——一个普通的 Markdown 笔记文件夹，发布成
> **可以在浏览器里直接编辑**的 VitePress 站点。

本仓库**只包含这个示例站点**：一个对目录结构零假设的笔记库（`notes/`、
`journal/`、`projects/`、`templates/`、`assets/`），外加把它发布出去的两个
小文件。`local-notes` 库本身**不在本仓库**，也**尚未发布到 npm**，所以本
仓库单独 `pnpm install` 目前装不上依赖——运行方式见下文「如何运行」。

## 目录里有什么

| 路径 | 说明 |
| --- | --- |
| `notes/`、`journal/`、`projects/`、`templates/`、`assets/` | 笔记库本体——普通 Markdown 目录，没有编号分区、没有需要记的约定 |
| `.vitepress/config.mts` | 接入点 1/2——一次调用装齐整个插件组（反链/图谱索引、附件静态服务、dev 写 API、笔记增删自动重启、HMR 竞态防护） |
| `.vitepress/theme/index.ts` | 接入点 2/2——一次调用挂载主题（编辑入口、新建笔记对话框、编辑器、反链面板、图谱画布） |
| `api-selftest.mjs` | 19 条断言 的 dev API 自测（409 冲突、原子写、目录穿越防护、模板）——跑完自清理 |
| `index.md` | 站点首页；其余每一页都是普通笔记 |

## 如何运行

`local-notes` 尚未发布，因此本仓库单独 `pnpm install` 还解析不到它。两条路：

**1. 作为库 monorepo 的 workspace 包运行（现在就能跑）**

本目录就是库 monorepo 里的 `packages/local-notes/demo/`。克隆库仓库，先把
库构建一次（demo 消费的是库的 `dist/`），再起 demo：

```sh
pnpm install
pnpm --filter local-notes build   # demo 消费 dist/
cd packages/local-notes/demo
pnpm dev                          # http://localhost:5173
```

**2. 独立运行（等 `local-notes` 发布到 npm 之后）**

```sh
pnpm install
pnpm dev                          # http://localhost:5173
pnpm build                        # 静态产物 → .vitepress/dist
pnpm preview                      # 预览静态产物
```

> `README.md` 与 `LICENSE` 已被排除在站点之外（`.vitepress/config.mts` 的
> `srcExclude`），因此仓库文档不会和笔记库自己的 `index.md` 抢路由。

## 先看哪几页

| 页面 | 看什么 |
| --- | --- |
| `/` | 一分钟导览 |
| `/notes/what-is-local-notes` | 这个库做了什么、不做什么 |
| `/notes/markdown-showcase` | 标题、表格、代码、双链，以及哪些能力必须 dev 模式 |
| `/notes/mindmap-demo` | 内嵌 `<MindMap>`（dev 下可编辑） |
| `/projects/pdf-demo` | 内嵌 PDF 预览卡片 |
| `/graph` | 整个笔记库的知识图谱 |
| `/viewer` | 全部附件集中查看 |

## 浏览器内编辑

- `pnpm dev`——库会在 `/api` 下挂 Vite 中间件。每个页面右上角长出
  **编辑此页**（Monaco 编辑器），顶栏长出 **＋ 新建笔记**。`Cmd/Ctrl+S`
  直接写回本地 Markdown 文件；写入是原子的，并带 `mtime` 乐观锁——外部改动
  （Obsidian、编辑器、脚本）会得到 **409 冲突**，而不是被静默覆盖。
- `pnpm build`——静态产物里这些路由不存在；主题会探测 API 并隐藏所有编辑
  入口。内容一致，只是只读。

dev 服务起着的时候：

```sh
pnpm selftest                     # 等价于：node api-selftest.mjs http://localhost:5173
```

## 许可

MIT © 2026 xiao-an-c —— `local-notes` 库自带它的 `LICENSE`。
