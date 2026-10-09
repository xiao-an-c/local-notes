---
title: 附件
---

# 附件

vault 里的非 Markdown 文件（PDF、图片、音视频……）如何被服务、进菜单、被预览。

## 放哪、怎么访问

附件与笔记同住 vault，**任意子目录**都行：

```
notes/
└── refs/
    ├── manual.pdf      →  https://你的站/vault/refs/manual.pdf
    └── report.html     →  /vault/refs/report.html
```

- URL 规则：`<assetPrefix>（默认 /vault/）+ vault 相对路径`
- dev：`vaultAssetPlugin` 挂的中间件直接从磁盘服务（支持 Range 请求，
  PDF/视频可拖进度条）
- build：白名单附件**增量拷贝**进产物（`.vitepress/dist/vault/…`），
  静态部署后照样可读

## 白名单后缀

只有白名单内的文件会被服务/拷贝/合并进侧栏——其余扩展名一律忽略：

| 类别 | 后缀 |
| --- | --- |
| 文档 | `.pdf` `.epub` `.mobi` `.azw3` `.djvu` |
| 数据/文本 | `.txt` `.csv` `.html` `.htm` |
| 图片 | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg` |
| 音频 | `.mp3` `.m4a` `.wav` |
| 视频 | `.mp4` `.webm` |
| Office | `.docx` `.xlsx` `.pptx` |
| 特判 | `*.mindmap.json`（完整后缀匹配；普通 `.json` **不**放行） |

安全口径：URL 目录段命中跳过清单（node_modules/.git/.obsidian 等）拒绝服务；
路径解析后必须仍在 vault 内（防目录穿越）。

## 侧栏自动合并

`withLocalNotes` 生成的侧栏会把附件挂进**所在目录**的分组（PDF/EPUB 显示
为可点击条目）。这是 `mergeVaultAssetSidebar` 的行为，纯数据加工——
自带侧栏数组时也可以单独调它。

## 整页预览 `/viewer`

PDF/EPUB 侧栏条目与正文链接自动指向 `<viewerPath>#<assetPrefix>相对路径>`
（默认 `/viewer#/vault/…`）。你只需建一个挂了 `<VaultFileViewer />` 的页面
（见[内嵌组件](/guides/components)），hash 里带 `..` 等可疑路径会被拒绝。

## 图片怎么写

白名单图片可直接用标准语法引用，VitePress 原生处理：

```markdown
![截图](/vault/assets/shot.png)
```

Obsidian 式 `![[shot.png]]` 亦可（由你选的双链插件解析）。
