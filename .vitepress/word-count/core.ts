/**
 * 字计数内核——纯函数，零 VitePress 依赖。
 *
 * 为什么要自己数：`story wordcount` 按空格分词，中文没空格，一整句算一个
 * 「词」的口径因平台而异，这里按
 * **汉字数**，本模块按 Unicode Script=Han 数汉字，与
 * `grep -o '[一-龥]' | wc -l` 同口径。
 *
 * 计数口径（五项，互不替代）：
 * - `hanzi`      汉字数（Script=Han，含扩展区）——平台交稿口径
 * - `latin`      英文/数字词数（连续字母数字算一个词）
 * - `words`      Word 口径"字数" = hanzi + latin
 * - `chars`      非空白字符数（含标点、数字、英文字母）
 * - `paragraphs` 非空段落数（含列表项，不含标题）
 *
 * 正文来源是 markdown-it 的 token 流，不是正则洗 markdown：代码块/围栏、
 * 行内代码、HTML 块与内联 HTML、图片 alt、数学公式一律不进计数，标题默认
 * 也不算正文（章节页的 H1 是标题，不该进交稿字数）。
 *
 * 本文件同时被两处消费：站点插件（`.vitepress/word-count/index.ts`，走
 * `countTokens`）与 CLI（`scripts/wordcount.ts`，走 `countMarkdown`）。
 */
// 本模块只依赖 markdown-it 的**结构**，不 import 它的类型：这样内核能在
// 任何 markdown-it 版本（含 @types 缺失的环境）下编译，也方便 CLI 直接复用。
/** 用得到的 token 字段（markdown-it Token 的结构子集） */
export interface MdToken {
  type: string;
  tag?: string;
  content?: string;
  children?: MdToken[] | null;
}

/** 用得到的 parser 能力（md.parse 的结构子集） */
export interface MdParser {
  parse(src: string, env: Record<string, unknown>): MdToken[];
}

export type WordCountField = "hanzi" | "words" | "chars" | "latin" | "paragraphs";

export interface WordCount {
  /** 汉字数（Unicode Script=Han，含扩展 A/B…区） */
  hanzi: number;
  /** 英文/数字词数 */
  latin: number;
  /** Word 口径字数：hanzi + latin */
  words: number;
  /** 非空白字符数（含标点） */
  chars: number;
  /** 非空段落数（列表项各算一段；标题不算） */
  paragraphs: number;
}

/** 展示用中文标签 */
export const FIELD_LABELS: Record<WordCountField, string> = {
  hanzi: "汉字",
  words: "字数",
  chars: "字符",
  latin: "英文词",
  paragraphs: "段落",
};

/** 全部字段的固定顺序（徽标 title、CLI 列头都按它排） */
export const ALL_FIELDS: readonly WordCountField[] = [
  "hanzi",
  "words",
  "chars",
  "latin",
  "paragraphs",
];

const HANZI_RE = /\p{Script=Han}/gu;
const LATIN_WORD_RE = /[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g;

/** 千分位。不用 toLocaleString——不同 ICU 环境的输出不稳定 */
export function formatNumber(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "汉字 1,806 · 字符 2,190 · 段落 96" */
export function formatSummary(
  count: WordCount,
  fields: readonly WordCountField[] = ALL_FIELDS,
): string {
  return fields
    .map((f) => `${FIELD_LABELS[f]} ${formatNumber(count[f])}`)
    .join(" · ");
}

/** 去掉 YAML frontmatter（VitePress 渲染时已剥离，CLI 走这里） */
export function stripFrontmatter(src: string): string {
  return src.replace(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "");
}

/**
 * 从纯文本数字数。`paragraphs` 恒为 0——段落边界只有 token 流知道，
 * 见 `countTokens`。
 */
export function countText(text: string): WordCount {
  const hanzi = (text.match(HANZI_RE) ?? []).length;
  const latin = (text.match(LATIN_WORD_RE) ?? []).length;
  const chars = [...text.replace(/\s+/gu, "")].length;
  return { hanzi, latin, words: hanzi + latin, chars, paragraphs: 0 };
}

/**
 * 取一个 inline token 的可见文字：跳过行内代码、内联 HTML、图片 alt、
 * 行内公式——它们不是正文。
 */
export function inlineText(token: MdToken): string {
  if (!token.children) return token.content ?? "";
  let out = "";
  for (const child of token.children) {
    switch (child.type) {
      case "text":
        out += child.content;
        break;
      case "softbreak":
      case "hardbreak":
        out += "\n";
        break;
      // image / code_inline / html_inline / math_inline：不算正文
      default:
        break;
    }
  }
  return out;
}

/** 整块不进计数的 token：代码围栏、缩进代码、HTML 块、块级公式 */
const SKIP_BLOCKS = new Set(["fence", "code_block", "html_block", "math_block"]);

export interface CountTokensOptions {
  /** 标题是否算正文，默认 false（标题是结构，不是交稿字数） */
  countHeadings?: boolean;
}

/** 从 markdown-it 的块级 token 流数字数（插件在 core 规则里直接用） */
export function countTokens(tokens: MdToken[], options: CountTokensOptions = {}): WordCount {
  const countHeadings = options.countHeadings === true;
  let headingDepth = 0;
  let text = "";
  let paragraphs = 0;
  let paraStart = -1;

  for (const token of tokens) {
    if (SKIP_BLOCKS.has(token.type)) continue;
    switch (token.type) {
      case "heading_open":
        headingDepth++;
        break;
      case "heading_close":
        headingDepth = Math.max(0, headingDepth - 1);
        break;
      case "paragraph_open":
        paraStart = text.length;
        break;
      case "paragraph_close":
        // 只有真的落了字的段落才算（纯图片段落、空段落不算）
        if (paraStart >= 0 && /\S/.test(text.slice(paraStart))) paragraphs++;
        paraStart = -1;
        break;
      case "inline":
        if (headingDepth > 0 && !countHeadings) break;
        text += inlineText(token) + "\n";
        break;
      default:
        break;
    }
  }

  return { ...countText(text), paragraphs };
}

/** 从 markdown 源码数字数（CLI 用：自带 frontmatter 剥离） */
export function countMarkdown(
  md: MdParser,
  src: string,
  options: CountTokensOptions = {},
): WordCount {
  return countTokens(md.parse(stripFrontmatter(src), {}), options);
}
