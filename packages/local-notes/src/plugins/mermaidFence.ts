import type MarkdownIt from "markdown-it";
import type { MarkdownItPlugin } from "./markdown.ts";

/**
 * ```mermaid 围栏渲染插件（markdown-it 插件，装进 `markdown.config`）。
 *
 * 让笔记里的 mermaid 代码块直接成为可交互图表（渲染/全屏/暗色跟随），
 * 而不是一枚死代码块——需求/设计类笔记（流程图、状态机、时序图）的
 * 高频刚需。已进入组合入口 localNotesMarkdownItPlugins，经 withLocalNotes
 * 零配置生效；站点不需要（或想换别的 mermaid 方案）时传 `mermaid: false`。
 *
 * 实现：覆写 fence 渲染规则，info 串为 `mermaid` 的围栏在构建期 base64
 * （UTF-8）编码后输出 `<MermaidFence code-b64="...">` 占位标签；客户端由
 * 主题全局注册的同名组件解码并复用 Mermaid 组件渲染。base64 转运既绕开
 * HTML 属性转义（图表节点常含中文/引号/箭头），又让 SSR/CSR 两端都不
 * 接触原始代码文本。其余语言围栏原样透传给默认渲染（高亮/代码组不受影响）。
 *
 * 依赖：客户端组件需要 `mermaid` 包（动态 import，SSR 安全）；本插件自身
 * 仅在 node 构建期运行。
 *
 * 用法（不经 withLocalNotes 单独使用时）：
 * ```ts
 * markdown: {
 *   config(md) {
 *     md.use(mermaidFencePlugin());
 *   },
 * }
 * ```
 */
export function mermaidFencePlugin(): MarkdownItPlugin {
  return (md) => {
    // 默认 fence 规则兜底（markdown-it 内置规则恒存在，?? 仅为类型完备）
    const defaultFence =
      md.renderer.rules.fence ??
      ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx]!;
      if (token.info.trim() === "mermaid") {
        const b64 = Buffer.from(token.content, "utf8").toString("base64");
        return `<MermaidFence code-b64="${b64}"></MermaidFence>\n`;
      }
      return defaultFence(tokens, idx, options, env, self);
    };
  };
}
