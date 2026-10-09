---
title: 站点自有扩展
---

# 站点自有扩展

demo 站在主题包**之外**自带的部件——它们不在 npm 包里，作用是示范「消费方
如何在主题之上叠加自己的能力」：

| 扩展 | 位置 | 形态 |
| --- | --- | --- |
| `<Mermaid>` 图表 | `demo/.vitepress/components/Mermaid.vue` | 全局组件，enhanceApp 注册 |
| `<CardGrid>` 卡片网格 | `demo/.vitepress/components/CardGrid.vue` | 同上 |
| 字数徽标 | `demo/.vitepress/word-count/` | markdown-it 插件（见 [Markdown 能力](/guides/markdown)） |
| 三栏布局/面板开关样式 | `demo/.vitepress/theme/custom.css` | CSS 覆盖（须排在主题样式之后） |

## `<Mermaid>` 图表

写 Mermaid 语法画流程图/时序图/甘特图等。暗色/亮色主题自动跟随（切换时
重渲染）；SSR 安全（mermaid 浏览器端按需加载）。

```markdown
<Mermaid code="graph TD; A[写笔记] --> B{满意?}; B -->|是| C[发布]" />
```

**真实渲染**：

<Mermaid code="graph TD; A[写 Markdown] --> B{满意?}; B -->|是| C[构建站点]; B -->|否| A; C --> D[浏览器阅读]; D --> E[知识图谱]; D --> F[全文搜索]" />

时序图也行：

<Mermaid code="sequenceDiagram; participant U as 用户; participant S as dev server; U->>S: 编辑 .md 文件; S->>S: 检测变更; S-->>U: 自动重启 + 页面刷新; U->>S: 浏览页面; S-->>U: 渲染组件/图谱/反链" />

## `<CardGrid>` 卡片网格

通用卡片网格：`items` 数组传入条目，支持 emoji 图标、等宽辅助行（`mono`）、
描述（`desc`）、链接（`href`）。**本页底部就是它**：

```markdown
<CardGrid :items="[
  { icon: '🧩', title: '内嵌组件', mono: 'guides', desc: 'props 与用法', href: '/guides/components' },
  { icon: '🕸️', title: '知识图谱', desc: '双链关系画布', href: '/graph' },
]" />
```

<CardGrid :items="[
  { icon: '📖', title: '使用指南', mono: 'guides', desc: '安装与配置', href: '/guides/' },
  { icon: '🧩', title: '内嵌组件', mono: 'guides', desc: '主题包四组件', href: '/guides/components' },
  { icon: '✏️', title: '在线编辑', mono: 'guides', desc: '编辑/新建/冲突保护', href: '/guides/editing' },
  { icon: '🕸️', title: '知识图谱', desc: '双链关系画布', href: '/graph' },
  { icon: '📄', title: '附件预览', mono: 'viewer', desc: 'PDF / EPUB 整页查看', href: '/viewer' },
  { icon: '🏠', title: '首页', desc: '站点入口', href: '/' },
]" />

## `<FullscreenOverlay>` 统一全屏弹窗

Mermaid 与 CardGrid 共用的全屏规范组件（`Teleport` 遮罩 + Esc 退出 +
点击空白关闭）。想让你的组件加入同一套全屏体验，照此规范实现即可：

- **弹窗形式**（Mermaid/CardGrid）：Teleport 到 body 的毛玻璃遮罩，内容居中
  在圆角面板（max 90vw × 90vh），右上角 ✕ + Esc + 点空白关闭，锁定滚动
- **按钮形式**（主题包的 HtmlView / MindMap / PdfViewer）：组件自身不渲染
  遮罩，全屏入口由其工具栏提供，经 `v-model:fullscreen` 对接

实现细节：`v-show` 控制显隐（Teleport 目标下 `Transition` + `v-if` 的 DOM
移除在部分场景不生效），元素常驻 body。

## 顶栏面板开关

顶栏左侧「侧栏」「大纲」两个开关：切换左侧目录与右侧大纲的显隐，状态
持久化在浏览器 localStorage。开关本身来自主题包（`LayoutPanelsToggle`，
挂 nav-bar 插槽）；大纲默认收起等视觉规则在 demo 的 `custom.css`。
