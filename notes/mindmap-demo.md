# Mind map demo

The mind map below is stored as a regular file next to your notes
(`assets/demo-mindmap.mindmap.json`) and embedded with one line of Markdown:

```html
<MindMap src="/vault/assets/demo-mindmap.mindmap.json" />
```

- Reading mode: scroll to zoom, drag to pan, fullscreen button top-right.
- With `pnpm dev` running, hit **Edit** (top-right of the canvas): double-click
  a node to rename it, <kbd>Tab</kbd> adds a child, <kbd>Enter</kbd> a sibling,
  and changes autosave back to the JSON file after 3 seconds.

<MindMap src="/vault/assets/demo-mindmap.mindmap.json" height="460px" />

Prefer text? The same content as an outline:

- **A local-notes site**
  - Pages — plain Markdown, wikilinks, backlinks
  - Mind maps — one `<MindMap>` line, data saved in your vault
  - Attachments — PDFs/EPUBs served from the vault and listed in the sidebar
    (see [[pdf-demo]])
  - Graph — every `[[link]]` becomes an edge on the [[graph]] page
