---
title: 组件文档
---

# 组件文档

站点的渲染能力来自两处：vendor 在 `packages/local-notes/src/` 的 local-notes
组件（原版 TS/Vue 源码，站点直接相对导入），以及站点自有的
`.vitepress/components/`（Mermaid 图表、CardGrid 卡片网格）。本文档每节都配
**真实渲染**——你看到的就是组件本身。

## FullscreenOverlay · 统一全屏弹窗（组件规范）

站点级组件（`.vitepress/components/FullscreenOverlay.vue`），Mermaid 和
CardGrid 共用。遵循以下规范：

**弹窗形式**（以 claude-tools 的 Mermaid 原版为准）：
- Teleport 到 body 的全屏遮罩：暗背景 rgba(0.8) + backdrop-blur(4px)
- 内容居中在圆角面板中（max 90vw × 90vh）
- 右上角关闭按钮（✕）+ Esc 键退出 + 点击遮罩空白处关闭
- 全屏期间锁定 body 滚动

**按钮形式**（以 local-notes 的 HtmlView / MindMap / PdfViewer 为准）：
- 本组件不渲染任何按钮——全屏入口由使用方组件的工具栏提供
- 使用方通过 `v-model:fullscreen` 控制开关

**实现细节**：v-show 控制显隐（Teleport 目标下 Transition + v-if 的
DOM 移除在部分场景不生效）；元素常驻 body、display:none 隐藏。

```vue
<FullscreenOverlay v-model:fullscreen="isFs">
  <div>全屏态内容</div>
</FullscreenOverlay>
```

## Mermaid · 图表

写 Mermaid 语法画流程图/时序图/甘特图等。暗色/亮色主题自动跟随（切换时重渲染），
全屏走统一规范（工具栏按钮 → 弹窗遮罩 + Esc 退出）。SSR 安全（mermaid 浏览器端按需加载）。

```markdown
<Mermaid code="graph TD; A[写笔记] --> B{满意?}; B -->|是| C[发布]; B -->|否| A" />
```

**真实渲染**：

<Mermaid code="graph TD; A[写 Markdown] --> B{满意?}; B -->|是| C[构建站点]; B -->|否| A; C --> D[浏览器阅读]; D --> E[知识图谱]; D --> F[全文搜索]" />

时序图也行：

<Mermaid code="sequenceDiagram; participant U as 用户; participant S as dev server; U->>S: 编辑 .md 文件; S->>S: 检测变更; S-->>U: 自动重启 + 页面刷新; U->>S: 浏览页面; S-->>U: 渲染组件/图谱/反链" />

## CardGrid · 卡片网格

通用卡片网格（从 stock-rsshub 的分类卡片抽象而来）：`items` 数组传入条目，
支持 emoji 图标、等宽辅助行、描述、链接。**本页顶部的能力入口就是它**：

```markdown
<CardGrid :items="[
  { icon: '🧩', title: '组件文档', mono: 'components', href: '/components/' },
  { icon: '📝', title: '演示', desc: 'Markdown 全功能', href: '/demo/' },
  { icon: '🕸️', title: '知识图谱', desc: '双链关系画布', href: '/graph' },
]" />
```

**真实渲染**：

<CardGrid :items="[
  { icon: '🧩', title: '组件文档', mono: 'components', desc: '你现在在这里', href: '/components/' },
  { icon: '📝', title: 'Markdown 演示', mono: 'demo', desc: '全功能展示页', href: '/demo/' },
  { icon: '🗂️', title: '模板与新建笔记', mono: 'guides', desc: '模板机制说明', href: '/guides/templates' },
  { icon: '🕸️', title: '知识图谱', desc: '双链关系画布', href: '/graph' },
  { icon: '📄', title: '附件预览', mono: 'viewer', desc: 'PDF / EPUB', href: '/viewer' },
  { icon: '🏠', title: '首页', desc: '站点入口', href: '/' },
]" />

## HtmlView · 内嵌 HTML 报告

以 iframe 整页加载 vault 内的**自包含 HTML**（内联样式与脚本，如 ECharts），
报告的样式/脚本与站点完全隔离、100% 还原；暗色站点下自动加浅色背板衬托。
全屏由统一组件管理（工具栏「全屏」按钮或悬停按钮，Esc 退出）。

```markdown
<HtmlView src="/vault/demo/assets/demo-report.html" />
<HtmlView src="/vault/xx/报告.html" height="720px" toolbar="false" />
```

`src` 以 `/vault/` 前缀 + 文档根相对路径定位；dev 与 build 产物均可渲染
（build 时 `vaultAssetCopyPlugin` 会把 HTML 拷进 dist）。

**真实渲染**（`site/demo/assets/demo-report.html`）：

<HtmlView src="/vault/demo/assets/demo-report.html" height="560px" />

## MindMap · 思维导图

内嵌 simple-mind-map 格式的 `.mindmap.json`（`data/children` 树）。dev 模式下
点「编辑」可直接在浏览器里改图并 `Cmd/Ctrl+S` 写回本地文件；build 产物自动降级为只读。

```markdown
<MindMap src="/vault/demo/assets/demo.mindmap.json" />
<MindMap src="/vault/xx/导图.mindmap.json" height="560px" mode="edit" />
```

**真实渲染**（`site/demo/assets/demo.mindmap.json`）：

<MindMap src="/vault/demo/assets/demo.mindmap.json" height="420px" />

## PdfViewer / VaultFileViewer · 附件预览

- `PdfViewer`：内嵌 PDF（`<PdfViewer src="/vault/xx/file.pdf" />`）
- markdown 里直接写 PDF 链接或 Obsidian 式 `![[file.pdf]]` 会自动转内嵌预览卡片
  （`pdfEmbedPlugin`）
- `VaultFileViewer`：附件预览页组件，挂在 [/viewer](/viewer) 上，读取 URL hash
  中的 vault 路径渲染对应附件；侧栏/正文里的 PDF/EPUB 链接自动指向它

## 知识图谱 · Graph

任何页面 frontmatter 写 `graph: true`，该页正文区就变成整页知识图谱画布
（数据来自 `virtual:graph`，展示全 vault 的双链关系；站点已有一个：[/graph](/graph)）。

## 反向链接 · Backlinks

每页正文之后自动渲染「反向链接」面板（`virtual:backlinks`），列出引用了本页的
其他页面。体验方式：打开 [demo 演示页](/demo/)——它链接到了本页，所以本页底部
能看到它；反向亦然。

## 双链 · Wikilinks

`[[目标笔记]]` 语法由 `BiDirectionalLinks` 插件渲染为页面链接并参与图谱/反链索引；
指向不存在页面时忽略死链（`ignoreDeadLinks: true`）。

## 字数徽标 · wordCount

站点自带插件（`.vitepress/word-count/`）：每页 H1 下方显示「汉字 / 字符 / 段落」，
悬停看全五项口径。单页关闭用 frontmatter `wordCount: false`；站点级排除在
`config.mts` 的 `exclude` 列表（当前：首页/图谱/附件三个功能页）。

## 面板开关 · 侧栏 / 大纲

顶栏左侧「侧栏」「大纲」两个开关：切换左侧目录与右侧大纲的显隐，状态持久化在
浏览器 localStorage。大纲默认收起（规则在 `.vitepress/theme/custom.css`）。

## 编辑组件（当前停用）

库还带「✎ 编辑此页」（Monaco 在线编辑、`Cmd/Ctrl+S` 写回本地 md）与
「＋ 新建笔记」（模板选择 + 新建对话框）两组编辑组件。本站定位纯阅读，已在
`.vitepress/theme/index.ts` 用 `enableEditThisPage: false` / `enableNewNote: false`
停用；需要时删掉这两行即可恢复，用法见 [模板与新建笔记](/guides/templates)。

组件的完整选项与实现见两处源码：
- 库组件：`packages/local-notes/src/components/`
- 站点自有组件：`.vitepress/components/`（Mermaid.vue / CardGrid.vue）
