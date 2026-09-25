# Markdown showcase

A tour of what renders inside a local-notes site. Everything here is a plain
`.md` file on disk — this page links to [[what-is-local-notes]] and is, in
turn, linked from it (check the **Backlinks** panel below).

## Lists

- Wikilinks: [[mindmap-demo]], [[pdf-demo]], [[2026-09-11]]
- Ordinary links: [VitePress](https://vitepress.dev/)
- `inline code`, **bold**, *italic*, ~~strikethrough~~

## Table

| Feature | Works in static build? | Needs `pnpm dev`? |
| --- | --- | --- |
| Reading pages | ✅ | — |
| Wikilinks & backlinks | ✅ | — |
| Mind map / PDF display | ✅ (read-only) | editing needs dev server |
| Editing notes in the browser | ❌ | ✅ |

## Code block

```ts
// The whole server-side integration of this demo site:
localNotesPlugins({ vaultDir, templateDir: "templates" });
```

## Blockquote & task list

> [!NOTE]
> Obsidian callouts render as VitePress containers.

- [x] structure-agnostic vault
- [x] two pages linking to each other
- [ ] your first note — hit **＋ New note** in the top bar
