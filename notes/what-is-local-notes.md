# What is local-notes?

`local-notes` is a [VitePress](https://vitepress.dev/) theme + plugin set that
publishes a local Markdown vault as a website **with in-browser editing**.
Think "Obsidian vault, shareable as a docs site": the same files stay on disk,
and the site is just a window onto them.

- **Zero structure assumptions** — this demo vault deliberately uses the most
  boring folder names imaginable (`notes/`, `journal/`, `projects/`). Point
  `vaultDir` at *your* root and you are done.
- **Edit in place** — the Monaco-based editor saves back to the local `.md`
  files over a dev-server API, with optimistic-concurrency protection
  (HTTP 409 when the file changed on disk behind your back, e.g. because
  Obsidian just saved it).
- **Wikilinks & backlinks** — `[[markdown-showcase]]` style links render as
  normal hyperlinks, and every page lists its backlinks at the bottom. Start
  from [[markdown-showcase]] and watch the backlink panel.
- **Mind maps, graphs, PDFs** — see [[mindmap-demo]], the [[graph]] page and
  [[pdf-demo]].

## Where to next?

1. [[markdown-showcase]] — what Markdown flavor is supported
2. [[mindmap-demo]] — an embedded, editable mind map
3. [[pdf-demo]] — PDF attachments with an inline viewer
4. [[2026-09-11]] — a plain journal note, proving daily notes need no ceremony
