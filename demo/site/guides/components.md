---
title: 内嵌组件
---

# 内嵌组件

主题入口全局注册了四个组件，Markdown 正文里**直接写标签**即可（无需 import）。
每个组件下都配了**真实渲染**——你看到的就是组件本身。demo 站自有的
`<Mermaid>` / `<CardGrid>` 另见[站点自有扩展](/guides/extras)。

## `<MindMap>` 思维导图

```markdown
<MindMap src="/vault/guides/assets/demo.mindmap.json" height="420px" />
```

| props | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `src` | `string` | 必填 | 导图数据 URL：`<assetPrefix>路径.mindmap.json` |
| `height` | `string` | `"420px"` | 容器高度 |
| `mode` | `"read" \| "edit"` | `"read"` | 初始模式；`edit` 还需 dev 写 API 探测通过 |

dev 模式下导图可交互（双击/Tab/Enter 编辑），自动保存回 vault 里的
`.mindmap.json` 文件；build 产物只读。

**真实渲染**（`demo/site/guides/assets/demo.mindmap.json`）：

<MindMap src="/vault/guides/assets/demo.mindmap.json" height="420px" />

## `<PdfViewer>` PDF 内嵌

```markdown
<PdfViewer src="/vault/refs/manual.pdf" title="参考手册" />
```

| props | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `src` | `string` | 必填 | `<assetPrefix>路径.pdf` |
| `title` | `string` | 文件名 | 卡片标题 |
| `page` | `number` | — | 初始定位页码 |
| `height` | `string` | `min(75vh, 820px)` | 卡片高度 |
| `collapsed` | `boolean` | `false` | 初始只显示标题条 |

**真实渲染**（`demo/site/guides/assets/demo.pdf`，共 2 页——翻到第 2 页验证
页码与滚动，工具栏可全屏/新窗口）：

<PdfViewer src="/vault/guides/assets/demo.pdf" title="PDF 预览演示" />

## `<HtmlView>` 自包含 HTML 报告

把 vault 里自包含的交互 HTML（ECharts 报告等）用 iframe 内嵌，脚本可执行：

```markdown
<HtmlView src="/vault/reports/q3.html" height="560px" />
```

| props | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `src` | `string` | 必填 | `<assetPrefix>路径.html` |
| `height` | `string` | `"560px"` | 容器高度 |
| `toolbar` | `boolean` | `true` | 浮动工具栏（新窗口打开/全屏） |

**真实渲染**（`demo/site/guides/assets/demo-report.html`，自包含 HTML 内联
样式与脚本，ECharts 交互在内嵌里可用）：

<HtmlView src="/vault/guides/assets/demo-report.html" height="560px" />

> 💡 报告 HTML 的生成有配套技能：agent 会话里说「生成 HTML 报告 / 转成
> HTML」即触发 `html-report` 技能（浅底研报风 + ECharts 骨架 + JS 语法
> 自检），规范见 `.agents/skills/html-report/SKILL.md`。

## `<VaultFileViewer>` 附件预览工程页

不是正文组件：把它挂在你的附件预览页（路由 = 主题选项 `viewerPath`，默认
`/viewer`），它读取 URL hash 里的 vault 路径渲染对应附件。侧栏与正文的
PDF/EPUB 链接会自动指向这个页面。本站的 [/viewer](/viewer) 即是。

```markdown
---
title: 附件预览
---
<VaultFileViewer />
```

## 组合与全屏规范

各组件全屏入口走统一规范：工具栏按钮 + Esc 退出。消费方自己的组件若要
加入这套规范，参考 demo 站的 `FullscreenOverlay`
（见[站点自有扩展](/guides/extras)）。
