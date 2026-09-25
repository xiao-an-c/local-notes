# PDF demo

PDF attachments live inside the vault like any other file
(`assets/sample.pdf` here). Three ways to show them:

## 1. Explicit component

```html
<PdfViewer src="/vault/assets/sample.pdf" height="480px" />
```

<PdfViewer src="/vault/assets/sample.pdf" height="480px" />

## 2. Markdown link to a `.pdf` (auto-embedded)

[Open sample.pdf (auto-embeds below)](../assets/sample.pdf)

## 3. Obsidian-style embed

![[sample.pdf]]

Every attachment is also listed in the sidebar (via
`mergeVaultAssetSidebar`) and opens in the full-page [[viewer]] — that flow
works in static builds too, while the editing features need `pnpm dev`.
Related reading: [[what-is-local-notes]].
