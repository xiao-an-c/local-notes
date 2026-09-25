# local-notes · demo vault

> The official demo of **local-notes** — an ordinary folder of Markdown notes
> published as a VitePress site you can **edit in the browser**.

This repository contains **only the demo site**: a structure-agnostic vault
(`notes/`, `journal/`, `projects/`, `templates/`, `assets/`) plus the two small
files that publish it. The `local-notes` library itself is **not** in this
repository and is **not on npm yet**, so the demo cannot install its own
dependency here — see [Running it](#running-it).

## What's in here

| Path | What it is |
| --- | --- |
| `notes/`, `journal/`, `projects/`, `templates/`, `assets/` | The vault — plain Markdown folders, no numbering scheme, no conventions to learn |
| `.vitepress/config.mts` | Integration point 1/2 — one call wires the whole plugin bundle (backlinks/graph index, asset serving, dev write APIs, auto-restart, HMR guard) |
| `.vitepress/theme/index.ts` | Integration point 2/2 — one call mounts the theme (edit entry, new-note dialog, editor, backlinks panel, graph canvas) |
| `api-selftest.mjs` | 19-assertion dev-API self test (conflict handling, atomic writes, path traversal, templates) — self-cleaning |
| `index.md` | The site home; every other page is an ordinary note |

## Running it

`local-notes` is unpublished, so `pnpm install` in this repository alone cannot
resolve `local-notes` yet. Two ways forward:

**1. As a workspace package of the library repo (works today)**

This folder is the demo of the library monorepo (it lives at
`packages/local-notes/demo/` there). Clone that repo, build the library once,
then start the demo:

```sh
pnpm install
pnpm --filter local-notes build   # the demo consumes dist/
cd packages/local-notes/demo
pnpm dev                          # http://localhost:5173
```

**2. Standalone, once `local-notes` is published to npm**

```sh
pnpm install
pnpm dev                          # http://localhost:5173
pnpm build                        # static output → .vitepress/dist
pnpm preview                      # preview the static build
```

> `README.md` and `LICENSE` are excluded from the site itself
> (`srcExclude` in `.vitepress/config.mts`), so the repo docs never collide
> with the vault's own `index.md`.

## What to look at

| Page | Shows |
| --- | --- |
| `/` | The 1-minute tour |
| `/notes/what-is-local-notes` | What the library does and does not do |
| `/notes/markdown-showcase` | Headings, tables, code, wikilinks, and what needs dev mode |
| `/notes/mindmap-demo` | An embedded `<MindMap>` (editable in dev) |
| `/projects/pdf-demo` | An embedded PDF viewer card |
| `/graph` | Knowledge graph of the whole vault |
| `/viewer` | Every attachment in one viewer |

## Editing in the browser

- `pnpm dev` — the library adds Vite middlewares under `/api`. Every page grows
  an **Edit this page** entry (Monaco) and the top bar a **＋ New note** button.
  `Cmd/Ctrl+S` writes straight back to the Markdown files; writes are atomic and
  guarded by an `mtime` optimistic lock, so an external edit (Obsidian, an
  editor, a script) answers **409 Conflict** instead of being silently
  overwritten.
- `pnpm build` — none of those routes exist in the static output; the theme
  probes the API and hides every edit affordance. Same content, read-only.

With the dev server running:

```sh
pnpm selftest                     # or: node api-selftest.mjs http://localhost:5173
```

## 简体中文

本仓库是 **local-notes** 的官方 demo：一个结构无关的 Markdown 笔记库
（`notes/`、`journal/`、`projects/`…），加上把它发布成站点的两个小文件。
**库里只有 demo**——`local-notes` 库本身不在本仓库，也尚未发布到 npm，
因此本仓库单独 `pnpm install` 目前装不上依赖（详见上文
[Running it](#running-it)）。在库的 monorepo 里，本目录即
`packages/local-notes/demo/`，`pnpm dev` 起来后每个页面都有「编辑此页」，
保存直接写回本地 md 文件；静态构建产物自动降级为只读。

## License

MIT © 2026 xiao-an-c — the `local-notes` library ships its own `LICENSE`.
