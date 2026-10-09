# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-10-09

### Added

- **Task board component** (`<TaskBoard src="/vault/xxx.taskboard.json" />`,
  globally registered by the theme, also exported from `local-notes/components`):
  a Tower-style project panel driven by a per-board `*.taskboard.json` file in
  the vault — members, status columns and task categories are all configured
  inside the board file itself, so every project gets its own taxonomy.
  - **Four views**: kanban (columns follow the configured status order),
    sortable table, hand-drawn month calendar (Monday-first, due-date chips,
    multi-day span bars, overdue highlighting) and statistics (overall
    completion, per-status / per-member / per-category progress bars) —
    zero third-party chart/DnD/calendar dependencies (pure Vue + CSS).
  - **Filters**: member avatars, categories, statuses, priority, overdue-only
    toggle and free-text search, plus a live "n/total" match count.
  - **Dev editing** (mirrors the MindMap pattern): create/edit/delete tasks in
    a dialog, drag cards between status columns, manage members (name/color)
    and board config (statuses incl. done-flag, categories, ordering), with
    3s-debounced autosave (`Cmd/Ctrl+S` for immediate save) back to the JSON
    file. Tasks moved into a done column get `doneAt` stamped automatically.
    Static builds hide every editing entry (read-only degradation).
  - **Task document links**: `links: [{ title?, url }]` on each task, accepting
    site-absolute routes, vault note paths (`foo.md` → site route) and external
    URLs (new tab); rendered on cards, in the table and in the detail dialog,
    editable in dev.
  - **Fullscreen** follows the MindMap overlay convention (toolbar button +
    Esc).
- **Board save API** `boardApiPlugin` (dev-only, part of
  `localNotesPlugins`): `GET <apiBase>/board/ping` probe +
  `PUT <apiBase>/board` atomic write-back, with the same safety chain as the
  mind-map API (`.taskboard.json` suffix allow-list, `..`/NUL/hidden/skip-dir
  rejection, vault containment, tmp+rename).
- **Asset whitelist**: `*.taskboard.json` joins `*.mindmap.json` as a
  special-cased structured-data suffix for dev serving and build-time copying
  (generic `.json` stays rejected).
- **Full-page board view**: new theme option `boardPath` (e.g. `"/board"`).
  When set, the embedded panel shows a 「整页」 toolbar button jumping to
  `<boardPath>?src=<current board>`; pages with frontmatter `board: true`
  render the new `TaskBoardPage` component (viewport-fixed edge-to-edge, same
  mechanism as the graph page). The demo site adds `site/board.md`, a 「看板」
  navbar entry and a sample board (`guides/assets/demo.taskboard.json`).

## [0.3.0] - 2026-10-09

### Added

- **```mermaid fence rendering** (zero-config via `withLocalNotes` + `localNotesTheme`):
  new `mermaidFencePlugin` (markdown-it) turns ```` ```mermaid ```` code fences
  into interactive diagrams (render / fullscreen / dark-mode aware) by emitting a
  `MermaidFence` component placeholder at build time; the theme globally registers
  `Mermaid` and `MermaidFence` components. Disable with `mermaid: false` in site
  options. New dependency: `mermaid` (dynamically imported on the client, SSR-safe).

### Changed

- **Layout skin ships with the theme** (`theme/skin.css`, split from component
  styles in `theme/styles.css`): three-column layout, aside collapsed by default
  (「大纲」toggle expands it), pinned sidebar width, navbar offset fixes. The
  panel toggles previously only wrote `<html>` classes while the CSS reacting to
  them lived in each site's own stylesheet — toggles did nothing without it.
  The open-aside rule also locks `flex` sizing (`flex: 0 0` + `max-width`) so
  VitePress alpha's flex container and its scoped `max-width: 16rem` can no
  longer squeeze the 18rem outline column. Sites no longer need a custom.css
  for the notes-site look; purely project-level beautification (typography,
  palette tweaks) still belongs to the site.
- **Compiled node entry**: the `.` export now resolves to `dist/index.js`
  (esbuild bundle, `vitepress`/`vitepress-sidebar` kept external) instead of
  `src/index.ts`. Node refuses to strip types under `node_modules`
  (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), so npm-installed copies of the
  source-shipping entry could not be loaded by VitePress's native-ESM config
  loader — a fresh `npm install` site was effectively unusable. Theme and
  components stay source-shipped (vite's client pipeline compiles them).
  Known trade-off: no bundled `.d.ts` yet (workspace/link consumers keep full
  types from `src/`; npm consumers get plain JS until types ship).
  Also added the `./package.json` export.
- **Repository moved** to `VibingNotes/local-notes` (package.json `repository.url`
  updated; npm page link takes effect with this release).

## [0.2.0] - 2026-10-09

First release on npm. Monorepo packaging: the library is consumed as a real
package (`local-notes`) instead of relative source imports.

### Added

- **`withLocalNotes()` site config composer** (node side, exported from `.`):
  wraps a VitePress `UserConfig` with the full node-side wiring — vite plugin
  group, markdown-it plugins, folder-as-menu sidebar generation (with asset
  merge), `srcExclude` for `templateDir`, `ignoreDeadLinks`, plus auto-probed
  `outDir`/`configPath` for the dev auto-restart plugin.

### Changed

- **Package form**: the library is now a pnpm workspace package
  (`packages/local-notes`) consumed by the demo site via the `local-notes`
  package name instead of relative source imports. Ships source directly
  through `exports` (`.` / `./theme` / `./components` / `./style.css`);
  all relative imports inside `src/` now carry explicit `.ts`/`/index.ts`
  extensions so the package loads under Node's strict ESM resolution.
- `markdown-it` and `vitepress-sidebar` moved from consumer-side to package
  dependencies; `vite`/`markdown-it` are no longer peers (vite imports are
  type-only).

## [0.1.0] - 2026-09-11

Initial release. Publish a local Markdown vault as a VitePress site with
in-browser editing; zero assumptions about the vault's folder structure.

### Added

- **Saving a note no longer restarts the dev server (dev)** — a self-write
  tracker (`plugins/selfWrite.ts`) marks files the library itself writes
  (markdown save/create via the md API) so the auto-restart plugin ignores
  them. Previously the atomic `.tmp → rename` write surfaced in fs.watch as a
  final-name `.md` event, got misread as "note added", and triggered a restart
  → automatic page refresh that destroyed the in-progress editing session.
  External tools (Obsidian, editors, scripts) are unaffected and still trigger
  the restart/sidebar refresh.
- **Automatic page refresh on note add/remove (dev)** — the auto-restart plugin
  broadcasts a restart notice over the Vite ws channel before touching the site
  config, and the theme (dev-only `restartBridge`) polls a per-instance
  `GET <apiBase>/restart-ping` boot id: once the restarted server is up, open
  pages reload by themselves so the sidebar reflects the change immediately.
  Previously VitePress's restart silently reconnected the browser without
  reloading, leaving the menu stale until a manual refresh.
- **Plugin bundle** `localNotesPlugins(options)` — one call installs:
  - backlink/graph index exposed as `virtual:backlinks` / `virtual:graph`
  - vault asset static serving under a configurable prefix (default `/vault/`)
  - build-time asset copy (PDF/EPUB/mind-map JSON) when `outDir` is set
  - mind-map save API (`PUT <apiBase>/mindmap`, atomic write)
  - markdown read/write/new API (`GET/PUT/POST <apiBase>/md`) with mtime
    optimistic locking — external modification answers **409 Conflict** and
    never overwrites
  - auto-restart of the dev server when notes are added/removed
  - Vue plugin HMR race guard
- **markdown-it plugins**: `pdfEmbedPlugin` (inline viewer cards for `.pdf`
  links and Obsidian `![[file.pdf]]` embeds), bundled in
  `localNotesMarkdownItPlugins(options)`
- **Sidebar helper**: `mergeVaultAssetSidebar(sidebar, options)` merges vault
  attachments (PDF/EPUB) into any sidebar array, linking to the viewer page
- **Theme entry** `localNotesTheme(options)` — extends the VitePress default
  theme with: "Edit this page" entry (Monaco editor, `Cmd/Ctrl+S` saves back
  to the local file), top-bar "＋ New note" dialog (folder mapping + optional
  templates), global singleton editor view, automatic backlinks panel, and a
  full-canvas knowledge graph on pages with `graph: true` frontmatter;
  globally registers `<PdfViewer>` / `<MindMap>` / `<VaultFileViewer>`
- **Component entry** `local-notes/components` for custom themes
- **Path safety chain** on all write APIs: suffix allow-list, `..`/NUL
  rejection, decode+resolve containment inside `vaultDir`, hidden/skip-dir
  rejection, atomic `tmp` + `rename` writes
- **Demo vault** [`demo/`](./demo) — a structure-agnostic example vault
  (`notes/`, `journal/`, `projects/`, `templates/`, `assets/`) with a minimal
  two-file site integration, an embedded mind map, a generated sample PDF,
  and a 19-assertion dev-API self test (`api-selftest.mjs`)
- Documentation: this changelog, README (English with Chinese summary),
  MIT license (Copyright (c) 2026 xiao-an-c)

[0.1.0]: https://github.com/xiao-an-c/local-notes/releases/tag/v0.1.0
