---
title: 内嵌组件
---

# 内嵌组件

主题入口全局注册了五个组件，Markdown 正文里**直接写标签**即可（无需 import）。
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

## `<TaskBoard>` 任务看板

Tower 风格的项目任务面板：**看板 / 表格 / 日历 / 统计** 四视图 + 成员、分类、
状态、优先级、关键字筛选 + 完成进度统计。数据源是 vault 内的
**`*.taskboard.json`**——成员、状态列、任务分类全部存在文件里、**每板自配置**，
不同项目放不同 JSON 就有各自的分类体系。

```markdown
<TaskBoard src="/vault/guides/assets/demo.taskboard.json" />
```

| props | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `src` | `string` | 必填 | 看板数据 URL：`<assetPrefix>路径.taskboard.json` |
| `height` | `string` | `"560px"` | 容器高度 |
| `mode` | `"read" \| "edit"` | `"read"` | 初始模式；`edit` 还需 dev 写 API 探测通过 |
| `initial-view` | `"board" \| "table" \| "calendar" \| "stats"` | `"board"` | 初始视图 |

dev 模式点「编辑」后：**＋新建任务**、点卡片改任务、**拖拽卡片换状态列**、
「成员」增删人员/改名/配色、「配置」管理状态列与分类（改名/配色/排序/增删，
顺序即看板列序，「完成列」参与完成率统计）。改动 3s 防抖自动保存回 JSON 文件
（Cmd/Ctrl+S 立即保存）；任务移入完成列自动盖章完成日期。build 产物只读浏览，
筛选与四视图照常可用。

数据文件结构（字段大多可省略，组件会兜底归一化）：

```json
{
  "title": "项目名",
  "members":    [{ "id": "alice", "name": "Alice", "color": "#3b82f6" }],
  "statuses":   [{ "id": "doing", "name": "进行中", "done": false }],
  "categories": [{ "id": "dev", "name": "开发", "color": "#3b82f6" }],
  "tasks": [{
    "id": "t1", "title": "任务标题",
    "status": "doing", "category": "dev", "assignees": ["alice"],
    "priority": "high", "progress": 60,
    "startDate": "2026-02-01", "dueDate": "2026-02-15",
    "doneAt": "2026-02-10", "tags": ["前端"], "notes": "备注",
    "links": [{ "title": "设计文档", "url": "/guides/design" }]
  }]
}
```

**任务关联文档（`links`）**：每个任务可挂任意多条文档链接——任务说明、设计
文档、外部issue 都行。URL 支持三种形态：站内路径（`/guides/xxx`，站内跳转）、
vault 笔记（`guides/xxx.md`，自动转成站点路由）、外链（`https://…`，新标签
打开）。`title` 可省略（展示时回退为 URL 文件名）。dev 编辑弹窗里可直接增删。

**整页视图**：在站点主题选项里配置 `boardPath`（如 `"/board"`，对应一个
frontmatter 含 `board: true` 的页面，参考本站 `site/board.md`）后，内嵌看板
右上角会出现「**整页**」按钮，一键跳到 `/board?src=<当前看板>` 整页查看；
本站顶栏的「看板」即该入口。

**真实渲染**（`demo/site/guides/assets/demo.taskboard.json`，试试切换视图、
点成员头像筛选、dev 下拖拽换列）：

<TaskBoard src="/vault/guides/assets/demo.taskboard.json" height="640px" />

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
