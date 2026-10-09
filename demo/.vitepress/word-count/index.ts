/**
 * 字计数插件——把每页的汉字/字符/段落数渲染成一枚徽标，插在页面 H1 下方。
 *
 * 接入（`.vitepress/config.mts`）：
 * ```ts
 * import { wordCountPlugin } from "./word-count/index.ts";
 * markdown: { config(md) { md.use(wordCountPlugin, { exclude: ["index.md"] }) } }
 * ```
 *
 * 为什么走 markdown-it 而不是 Vue 组件：VitePress 主题的 Layout 插槽由
 * 主题自己渲染，站点侧无法追加插槽；而 markdown-it 的 core 规则能在
 * **构建期**把徽标作为普通 HTML 块写进正文——SSR 与客户端产物一致，
 * 不依赖任何主题实现（换主题、换主题包都照样生效）。
 *
 * 计数规则见 `./core`。徽标位置：正文第一个 H1 之后；没有 H1 就放正文最前。
 * 想关掉某一页：frontmatter 写 `wordCount: false`（键名可配）。
 */
import {
  ALL_FIELDS,
  FIELD_LABELS,
  countTokens,
  formatNumber,
  formatSummary,
  type MdToken,
  type WordCount,
  type WordCountField,
} from "./core.ts";

export type { WordCount, WordCountField } from "./core.ts";

export interface WordCountPluginOptions {
  /** 徽标里显示哪几项，默认 ["hanzi", "chars", "paragraphs"]；title 里始终给全五项 */
  fields?: readonly WordCountField[];
  /**
   * 不显示的页面：glob（`*` 不跨 `/`，双星号跨目录）或正则，匹配相对 vault 根的路径。
   * 注意 `"index.md"` 只命中根首页；要命中每个目录的 index，得用双星号前缀。
   */
  exclude?: readonly (string | RegExp)[];
  /** 关掉徽标的 frontmatter 键名（值为 `false` 时隐藏），默认 "wordCount"；传 false 关闭该能力 */
  hideKey?: string | false;
  /** 非空白字符数低于此值不显示徽标，默认 0 */
  minChars?: number;
  /** 标题是否计入正文，默认 false */
  countHeadings?: boolean;
  /** 徽标根元素 class，默认 "ln-wordcount"（样式见 ./word-count.css） */
  className?: string;
}

/** markdown-it 实例的结构子集（只用到 core 规则注册） */
interface MdCoreLike {
  core: {
    ruler: {
      push(name: string, rule: (state: MdCoreState) => void): void;
    };
  };
}

interface MdCoreState {
  tokens: MdToken[];
  env: { relativePath?: string; frontmatter?: Record<string, unknown> } & Record<string, unknown>;
  Token: new (type: string, tag: string, nesting: number) => MdToken & { block?: boolean };
}

const DEFAULT_FIELDS: readonly WordCountField[] = ["hanzi", "chars", "paragraphs"];
const DEFAULT_CLASS = "ln-wordcount";

interface ResolvedOptions {
  fields: readonly WordCountField[];
  exclude: readonly (string | RegExp)[];
  hideKey: string | false;
  minChars: number;
  countHeadings: boolean;
  className: string;
}

function resolveOptions(options: WordCountPluginOptions): ResolvedOptions {
  return {
    fields: options.fields?.length ? options.fields : DEFAULT_FIELDS,
    exclude: options.exclude ?? [],
    hideKey: options.hideKey === undefined ? "wordCount" : options.hideKey,
    minChars: options.minChars ?? 0,
    countHeadings: options.countHeadings === true,
    className: options.className ?? DEFAULT_CLASS,
  };
}

/** 极简 glob：`**` 跨目录，`*` 不跨，其余字符按字面量 */
function globToRegExp(glob: string): RegExp {
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${source}$`);
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isExcluded(patterns: readonly (string | RegExp)[], relativePath: string): boolean {
  if (!patterns.length) return false;
  return patterns.some((pattern) => {
    if (pattern instanceof RegExp) return pattern.test(relativePath);
    return globToRegExp(normalizePath(pattern)).test(relativePath);
  });
}

/** 徽标插在第一个 H1 之后；没有 H1 就放正文最前 */
function insertionIndex(tokens: readonly MdToken[]): number {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "heading_close" && tokens[i].tag === "h1") return i + 1;
  }
  return 0;
}

function renderBadge(count: WordCount, options: ResolvedOptions): string {
  const cls = options.className;
  const items = options.fields
    .map(
      (field) =>
        `<span class="${cls}__item">` +
        `<span class="${cls}__label">${FIELD_LABELS[field]}</span>` +
        `<span class="${cls}__value">${formatNumber(count[field])}</span>` +
        `</span>`,
    )
    .join(`<span class="${cls}__sep" aria-hidden="true">·</span>`);
  // title/aria 给全五项：徽标本身只显示关心的两三栏，鼠标悬停能看到完整口径
  const summary = formatSummary(count, ALL_FIELDS);
  const data = ALL_FIELDS.map((field) => ` data-wordcount-${field}="${count[field]}"`).join("");
  return `<div class="${cls}"${data} role="note" aria-label="${summary}" title="${summary}">${items}</div>`;
}

/** markdown-it 插件：`md.use(wordCountPlugin, options)` */
export function wordCountPlugin(md: MdCoreLike, options: WordCountPluginOptions = {}): void {
  const resolved = resolveOptions(options);

  md.core.ruler.push("local_notes_word_count", (state) => {
    const env = state.env ?? {};
    if (resolved.hideKey && env.frontmatter?.[resolved.hideKey] === false) return;

    const relativePath = normalizePath(String(env.relativePath ?? ""));
    if (isExcluded(resolved.exclude, relativePath)) return;

    const count = countTokens(state.tokens, { countHeadings: resolved.countHeadings });
    if (count.chars < resolved.minChars) return;

    const token = new state.Token("html_block", "", 0);
    token.content = renderBadge(count, resolved) + "\n";
    token.block = true;
    state.tokens.splice(insertionIndex(state.tokens), 0, token);
  });
}

export default wordCountPlugin;
