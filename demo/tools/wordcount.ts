#!/usr/bin/env node
/**
 * 字计数 CLI——给整个笔记库或某个子目录数字数（汉字口径）。
 *
 * 为什么需要它：`story wordcount` 按空格分词，中文没空格，一整句算一个
 * 「词」的口径因平台而异。这里统计的是**汉字数**（Unicode Script=Han），
 * 这里复用站点同一套内核（`.vitepress/word-count/core.ts`）——网页上
 * 标题下那枚徽标和这里的数字永远一致。
 *
 * 用法：
 * ```sh
 * pnpm wordcount                                  # 整个笔记库
 * pnpm wordcount site/guides                   # 只看某个子目录
 * pnpm wordcount site --md                     # Markdown 表格，可贴进笔记
 * pnpm wordcount site --target site/index.md
 * pnpm wordcount --json --sort hanzi --desc --top 10
 * ```
 *
 * 退出码：0 = 正常出报告；1 = 参数错误或一个文件都没扫到。
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import MarkdownIt from "markdown-it";
import {
  ALL_FIELDS,
  FIELD_LABELS,
  countMarkdown,
  formatNumber,
  type WordCount,
  type WordCountField,
} from "../.vitepress/word-count/core.ts";

interface FileCount extends WordCount {
  /** 相对当前工作目录的路径（正斜杠） */
  path: string;
}

interface Options {
  roots: string[];
  json: boolean;
  markdown: boolean;
  group: boolean | undefined;
  top: number | undefined;
  min: number;
  sort: "path" | WordCountField;
  desc: boolean;
  target: number | undefined;
  excludes: string[];
  includeAll: boolean;
}

const USAGE = `用法: wordcount [路径...] [选项]

  路径                要统计的目录或 .md 文件，默认当前目录
  --json              JSON 输出（给脚本消费）
  --md                Markdown 表格输出（可贴进笔记）
  --group             强制打印按目录汇总
  --no-group          不打印按目录汇总
  --top <N>           只列前 N 个文件（合计仍按全部文件算）
  --min <N>           汉字数低于 N 的文件不列出（仍计入合计）
  --sort <字段>       path | ${ALL_FIELDS.join(" | ")}（默认 path）
  --desc              排序反转
  --target <N|文件>   目标汉字数；给 .md 文件则读其 frontmatter 的 target-words
  --exclude <glob>    额外排除（可重复，匹配相对路径）
  --all               不跳过隐藏目录（默认跳过 .* 与 node_modules/dist）
  -h, --help          显示本帮助

口径：汉字 = Unicode Script=Han（交稿口径）；字符 = 非空白字符数；
标题、代码块、行内代码、图片 alt、HTML 一律不计入正文。`;

/** 默认跳过的目录名（隐藏目录另按前缀跳过，--all 关闭） */
const SKIP_DIRS = new Set(["node_modules", "dist", ".vitepress"]);
const MD_EXTENSIONS = new Set([".md", ".markdown"]);

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------
function parseArgs(argv: string[]): Options {
  const options: Options = {
    roots: [],
    json: false,
    markdown: false,
    group: undefined,
    top: undefined,
    min: 0,
    sort: "path",
    desc: false,
    target: undefined,
    excludes: [],
    includeAll: false,
  };

  const needValue = (i: number, flag: string): string => {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) fail(`${flag} 需要一个值`);
    return value as string;
  };
  const positiveInt = (raw: string, flag: string): number => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) fail(`${flag} 需要非负数字，收到 "${raw}"`);
    return Math.floor(n);
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === "--json") options.json = true;
    else if (arg === "--md") options.markdown = true;
    else if (arg === "--group") options.group = true;
    else if (arg === "--no-group") options.group = false;
    else if (arg === "--desc") options.desc = true;
    else if (arg === "--all") options.includeAll = true;
    else if (arg === "--top") options.top = positiveInt(needValue(i, arg), arg), i++;
    else if (arg === "--min") options.min = positiveInt(needValue(i, arg), arg), i++;
    else if (arg === "--sort") {
      const field = needValue(i, arg);
      if (field !== "path" && !ALL_FIELDS.includes(field as WordCountField)) {
        fail(`--sort 只认 path 或 ${ALL_FIELDS.join(" / ")}，收到 "${field}"`);
      }
      options.sort = field as Options["sort"];
      i++;
    } else if (arg === "--target") {
      options.target = resolveTarget(needValue(i, arg));
      i++;
    } else if (arg === "--exclude") options.excludes.push(needValue(i, arg)), i++;
    else if (arg.startsWith("-") && arg !== "-") fail(`未知选项 ${arg}`);
    else options.roots.push(arg);
  }

  if (!options.roots.length) options.roots.push(".");
  return options;
}

function fail(message: string): never {
  console.error(`wordcount: ${message}\n\n${USAGE}`);
  process.exit(1);
}

/** `--target 2000000` 或 `--target 某文件.md`（读 frontmatter target-words） */
function resolveTarget(raw: string): number {
  if (/^\d+$/.test(raw)) return Number(raw);
  let source: string;
  try {
    source = readFileSync(raw, "utf8");
  } catch {
    fail(`--target 既不是数字，也读不到文件：${raw}`);
  }
  const match = /^target-words:[ \t]*(\d+)/m.exec(source);
  if (!match) fail(`--target 文件 ${raw} 的 frontmatter 里没有 target-words`);
  return Number(match[1]);
}

// ---------------------------------------------------------------------------
// 扫描与统计
// ---------------------------------------------------------------------------
function shouldSkipDir(name: string, includeAll: boolean): boolean {
  if (SKIP_DIRS.has(name)) return true;
  return !includeAll && name.startsWith(".");
}

function collectFiles(target: string, options: Options, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(target, { withFileTypes: true });
  } catch {
    fail(`读不到路径：${target}`);
  }
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name, options.includeAll)) continue;
      collectFiles(full, options, out);
    } else if (entry.isFile() && MD_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
}

/** 极简 glob（与站点插件同规则：`**` 跨目录，`*` 不跨） */
function globToRegExp(glob: string): RegExp {
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${source}$`);
}

/** 目录列显示名：根目录的 "." 换成 "(根目录)"，其余带尾斜杠 */
function dirLabel(dir: string): string {
  return dir === "." ? "(根目录)/" : `${dir}/`;
}

function relative(p: string): string {
  return path.relative(process.cwd(), p).split(path.sep).join("/") || path.basename(p);
}

function sum(counts: WordCount[]): WordCount {
  const total: WordCount = { hanzi: 0, words: 0, chars: 0, latin: 0, paragraphs: 0 };
  for (const c of counts) for (const f of ALL_FIELDS) total[f] += c[f];
  return total;
}

// ---------------------------------------------------------------------------
// 输出（宽度按东亚全角算，中文文件名也能对齐）
// ---------------------------------------------------------------------------
const WIDE_RE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;

function displayWidth(s: string): number {
  let width = 0;
  for (const ch of s) width += WIDE_RE.test(ch) ? 2 : 1;
  return width;
}

function padEndWide(s: string, width: number): string {
  return s + " ".repeat(Math.max(0, width - displayWidth(s)));
}

function padStartWide(s: string, width: number): string {
  return " ".repeat(Math.max(0, width - displayWidth(s))) + s;
}

function cell(n: number): string {
  return formatNumber(n);
}

function printTable(files: FileCount[]): void {
  const pathWidth = Math.max(4, ...files.map((f) => displayWidth(f.path)));
  const columns = ALL_FIELDS.map((field) => ({
    field,
    label: FIELD_LABELS[field],
    width: Math.max(displayWidth(FIELD_LABELS[field]), ...files.map((f) => cell(f[field]).length)),
  }));

  console.log(
    `  ${padEndWide("文件", pathWidth)}  ` +
      columns.map((c) => padStartWide(c.label, c.width)).join("  "),
  );
  for (const file of files) {
    console.log(
      `  ${padEndWide(file.path, pathWidth)}  ` +
        columns.map((c) => padStartWide(cell(file[c.field]), c.width)).join("  "),
    );
  }
}

function printMarkdown(files: FileCount[], groups: Map<string, WordCount>, total: WordCount): void {
  console.log(`| 文件 | ${ALL_FIELDS.map((f) => FIELD_LABELS[f]).join(" | ")} |`);
  console.log(`| --- | ${ALL_FIELDS.map(() => "---:").join(" | ")} |`);
  for (const file of files) {
    console.log(`| \`${file.path}\` | ${ALL_FIELDS.map((f) => cell(file[f])).join(" | ")} |`);
  }
  if (groups.size > 1) {
    for (const [dir, counts] of groups) {
      console.log(`| \`${dirLabel(dir)}\` | ${ALL_FIELDS.map((f) => cell(counts[f])).join(" | ")} |`);
    }
  }
  console.log(`| **合计** | ${ALL_FIELDS.map((f) => `**${cell(total[f])}**`).join(" | ")} |`);
}

function printText(
  files: FileCount[],
  groups: Map<string, WordCount>,
  total: WordCount,
  options: Options,
): void {
  printTable(files);

  // 多目录时才给按目录汇总——单目录时它和合计一模一样，纯噪声
  if (groups.size > 1) {
    const entries = [...groups.entries()];
    const dirWidth = Math.max(displayWidth("目录"), ...entries.map(([dir]) => displayWidth(dirLabel(dir))));
    const widths = ALL_FIELDS.map((field) =>
      Math.max(displayWidth(FIELD_LABELS[field]), ...entries.map(([, c]) => cell(c[field]).length)),
    );
    const row = (label: string, counts: WordCount): string =>
      `  ${padEndWide(label, dirWidth)}  ` +
      ALL_FIELDS.map((field, i) => padStartWide(cell(counts[field]), widths[i] as number)).join("  ");

    console.log("");
    console.log(
      `  ${padEndWide("目录", dirWidth)}  ` +
        ALL_FIELDS.map((field, i) =>
          padStartWide(FIELD_LABELS[field], widths[i] as number),
        ).join("  "),
    );
    for (const [dir, counts] of entries) console.log(row(dirLabel(dir), counts));
  }

  console.log("");
  console.log(`  合计  ${formatNumber(files.length)} 个文件`);
  console.log(
    "  " + ALL_FIELDS.map((f) => `${FIELD_LABELS[f]} ${cell(total[f])}`).join("  ·  "),
  );

  if (options.target) {
    const done = total.hanzi;
    const percent = ((done / options.target) * 100).toFixed(2);
    const remaining = Math.max(0, options.target - done);
    console.log(
      `  进度  汉字 ${cell(done)} / ${cell(options.target)}（${percent}%），` +
        `还差 ${cell(remaining)} 字`,
    );
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const md = new MarkdownIt({ html: true });

  const paths: string[] = [];
  for (const root of options.roots) collectFiles(root, options, paths);
  paths.sort();

  const excludeRes = options.excludes.map(globToRegExp);
  const files: FileCount[] = [];
  for (const file of paths) {
    const rel = relative(file);
    if (excludeRes.some((re) => re.test(rel))) continue;
    const count = countMarkdown(md, readFileSync(file, "utf8"));
    files.push({ path: rel, ...count });
  }

  if (!files.length) fail(`一个 Markdown 文件都没扫到（${options.roots.join(", ")}）`);

  // 排序：默认按路径；数值字段默认从多到少，--desc 反转
  const { sort, desc } = options;
  const direction = sort === "path" ? (desc ? -1 : 1) : desc ? 1 : -1;
  files.sort((a, b) => {
    const diff = sort === "path" ? (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) : a[sort] - b[sort];
    return diff * direction || a.path.localeCompare(b.path);
  });

  const total = sum(files);
  const groups = new Map<string, WordCount>();
  for (const file of files) {
    const dir = path.posix.dirname(file.path);
    const bucket = groups.get(dir) ?? { hanzi: 0, words: 0, chars: 0, latin: 0, paragraphs: 0 };
    for (const field of ALL_FIELDS) bucket[field] += file[field];
    groups.set(dir, bucket);
  }

  const shown = files
    .filter((f) => f.hanzi >= options.min)
    .slice(0, options.top ?? Number.POSITIVE_INFINITY);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          files: shown,
          groups: [...groups].map(([dir, counts]) => ({ dir, ...counts })),
          total,
          target: options.target
            ? {
                hanzi: options.target,
                percent: Number(((total.hanzi / options.target) * 100).toFixed(2)),
                remaining: Math.max(0, options.target - total.hanzi),
              }
            : null,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (options.markdown) {
    printMarkdown(shown, groups, total);
    return;
  }

  printText(shown, groups, total, options);
}

main();
