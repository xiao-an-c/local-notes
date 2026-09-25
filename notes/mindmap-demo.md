# 思维导图示例

下面这张思维导图就是放在笔记旁边的普通文件
（`assets/demo-mindmap.mindmap.json`），用一行 Markdown 嵌入：

```html
<MindMap src="/vault/assets/demo-mindmap.mindmap.json" />
```

- 阅读模式：滚轮缩放、拖拽平移，右上角有全屏按钮。
- `pnpm dev` 运行时，点画布右上角的 **编辑**：双击节点改名，<kbd>Tab</kbd>
  加子节点，<kbd>Enter</kbd> 加兄弟节点，改动 3 秒后自动保存回 JSON 文件。

<MindMap src="/vault/assets/demo-mindmap.mindmap.json" height="460px" />

更喜欢文字？同样的内容用大纲表示：

- **一个 local-notes 站点**
  - 页面——普通 Markdown、双链、反链
  - 思维导图——一行 `<MindMap>`，数据存回你的笔记库
  - 附件——PDF/EPUB 由笔记库提供、进侧栏（见 [[pdf-demo]]）
  - 图谱——每条 `[[链接]]` 都会成为 [[graph]] 页上的一条边
