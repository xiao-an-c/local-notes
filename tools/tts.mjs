#!/usr/bin/env node
/**
 * tts.mjs — 把 vault 里的 Markdown 笔记转成 MP3，并在笔记里嵌入播放器。
 *
 * 用法：
 *   node tools/tts.mjs demo/site/**/*.md
 *   node tools/tts.mjs demo/site/guides/templates.md --dry
 *   node tools/tts.mjs notes/xxx.md --voice zh-CN-YunjianNeural --rate=-10%
 *
 * 依赖：edge-tts（pip install edge-tts，免费、无需 key）、ffmpeg
 *
 * 关键设计：表格不逐格朗读（"竖线 概念 竖线 定义"是灾难），而是转成
 * "词：定义。"的句子；表头与分隔行丢弃；代码块整体跳过；双链 [[slug]]
 * 换成对应笔记的中文标题，避免把 slug 念出来。
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// 双链 slug → 中文标题（念出来才顺）。未登记的 slug 直接丢弃。
const WIKILINK_TITLES: Record<string, string> = {
  // 双链 slug → 中文标题（念出来才顺）。按当前 vault 内容自行登记；
  // 未登记的 slug 在朗读时直接丢弃。
};

const VOICE_LABELS = {
  "zh-CN-YunyangNeural": "微软云扬",
  "zh-CN-YunjianNeural": "微软云健",
  "zh-CN-YunxiNeural": "微软云希",
  "zh-CN-XiaoxiaoNeural": "微软晓晓",
  "zh-CN-XiaoyiNeural": "微软晓伊",
};

function parseArgs(argv) {
  const files = [];
  const opts = {
    voice: "zh-CN-YunyangNeural",
    rate: "-5%",
    outDir: "audio",
    urlBase: "/vault/audio",
    workDir: ".tts-work/audio",
    chunkSize: 1200,
    concurrency: 4,
    dry: false,
    embed: true,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry") opts.dry = true;
    else if (a === "--no-embed") opts.embed = false;
    else if (a === "--force") opts.force = true;
    else if (a === "--voice") opts.voice = argv[++i];
    else if (a.startsWith("--voice=")) opts.voice = a.slice(8);
    else if (a === "--rate") opts.rate = argv[++i];
    else if (a.startsWith("--rate=")) opts.rate = a.slice(7);
    else if (a === "--out-dir") opts.outDir = argv[++i];
    else if (a === "--chunk-size") opts.chunkSize = Number(argv[++i]);
    else if (a === "--concurrency") opts.concurrency = Number(argv[++i]);
    else if (a.startsWith("--")) {
      console.error(`未知选项 ${a}`);
      process.exit(2);
    } else files.push(a);
  }
  return { files, opts };
}

/** Markdown → 可朗读文本 */
function stripMarkdown(md) {
  let text = md;

  // 重跑保护：去掉已嵌入的播放器与朗读标注，避免被念出来
  text = text.replace(/<audio[\s\S]*?<\/audio>/gi, "");
  text = text.replace(/^\*朗读：.*\*\s*$/gm, "");
  text = text.replace(/^<[^>]+>\s*$/gm, "");

  // 代码块整体丢弃（含 ASCII 示意图）
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/`([^`]*)`/g, "$1");

  const lines = text.split(/\r?\n/);
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ---- 表格块 ----
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      i--; // 回退一格，交给外层 for 的 i++
      const parsed = rows.map((r) =>
        r
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim()),
      );
      // 丢掉 |---|---| 分隔行
      const dataRows = parsed.filter((cells) => !cells.every((c) => /^:?-{2,}:?$/.test(c)));
      // 表头（第一行）丢弃——"词/一句话定义"念出来没有信息量
      for (const cells of dataRows.slice(1)) {
        const clean = cells
          .map((c) => c.replace(/[★☆⚠✅❌]/gu, "").trim()) // 先去掉难度星标等装饰
          .filter((c) => c && c !== "—" && c !== "-");
        if (!clean.length) continue;
        const [head, ...rest] = clean;
        const body = rest.length ? `${head}：${rest.join("，")}` : head;
        // 单元格本身已带句末标点就不再补，免得念出"？。"
        out.push(/[。！？；：，]$/.test(body) ? body : `${body}。`);
      }
      continue;
    }

    // ---- 标题 ----
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      out.push(`${h[2].trim()}。`);
      continue;
    }

    // ---- 分隔线 ----
    if (/^\s*[-*_]{3,}\s*$/.test(line)) continue;

    let l = line;
    l = l.replace(/^>\s?/, ""); // 引用
    l = l.replace(/^\[!\w+\]\s*/, ""); // 提示框标记
    l = l.replace(/^\s*[-*+]\s+/, ""); // 无序列表
    l = l.replace(/^\s*\d+\.\s+/, ""); // 有序列表
    out.push(l);
  }

  let result = out.join("\n");

  // 双链：[[slug]] 或 [[slug|别名]]
  result = result.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, slug, label) => {
    if (label) return label;
    return WIKILINK_TITLES[slug.trim()] ?? "";
  });
  // 普通链接保留文字
  result = result.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // 强调
  result = result.replace(/\*\*([^*]*)\*\*/g, "$1");
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1");
  result = result.replace(/~~([^~]*)~~/g, "$1");
  // 装饰性符号：箭头多半是因果/顺承连接，转成逗号停顿；纯装饰的直接删
  result = result.replace(/[★☆⚠✅❌←↑↓]/gu, "");
  result = result.replace(/→/gu, "，");
  // 全角运算符念出来才对（＋是并列，念成顿号比"加"自然）
  result = result.replace(/＝/g, "等于").replace(/＋/g, "、").replace(/×/g, "乘");
  // 半角 = 与 ≠（链接、代码块此前已处理，此处残留的都是"等于"的意思）
  result = result.replace(/(?<![=<>!])=(?![=<>])/g, "等于");
  result = result.replace(/≠/g, "不等于");
  result = result.replace(/≈/g, "近似于");
  // 中文之间的斜杠是"或/与"的意思，念成"与"
  result = result.replace(/(?<=[\u4e00-\u9fa5])\/(?=[\u4e00-\u9fa5])/g, "与");
  result = result.replace(/[ \t]+/g, " ");

  return result
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** 按段落切成不超过 max 字的块 */
function chunkText(text, max) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = "";
  };
  for (const p of paras) {
    if (p.length > max) {
      flush();
      const sents = p.split(/(?<=[。！？；])/);
      let buf = "";
      for (const s of sents) {
        if ((buf + s).length > max && buf) {
          chunks.push(buf.trim());
          buf = "";
        }
        buf += s;
      }
      if (buf.trim()) chunks.push(buf.trim());
      continue;
    }
    if ((cur + "\n" + p).length > max) flush();
    cur += (cur ? "\n" : "") + p;
  }
  flush();
  return chunks;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} 退出码 ${code}\n${err.slice(-600)}`)),
    );
  });
}

async function ttsChunk(text, txtFile, mp3File, opts) {
  await writeFile(txtFile, text, "utf8");
  await run("edge-tts", [
    "--voice",
    opts.voice,
    `--rate=${opts.rate}`,
    "-f",
    txtFile,
    "--write-media",
    mp3File,
  ]);
}

/** 并发跑任务池 */
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

async function probeDuration(file) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      file,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", () => resolve(Number.parseFloat(out.trim()) || 0));
  });
}

function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}分${String(s).padStart(2, "0")}秒`;
}

/** 在 H1 之后插入（或替换）播放器 */
async function embedPlayer(mdPath, url, opts) {
  const md = await readFile(mdPath, "utf8");
  const label = VOICE_LABELS[opts.voice] ?? opts.voice;
  const block = [
    `<audio controls preload="metadata" src="${url}"></audio>`,
    "",
    `*朗读：${label}（${opts.voice}），语速 ${opts.rate}。*`,
  ].join("\n");

  // 已有播放器 → 替换整段（含随后的朗读标注行）
  const existing = /<audio[\s\S]*?<\/audio>\n\n\*朗读：[^\n]*\*/;
  if (existing.test(md)) {
    await writeFile(mdPath, md.replace(existing, block), "utf8");
    return "replaced";
  }

  const lines = md.split("\n");
  const h1 = lines.findIndex((l) => /^#\s+/.test(l));
  const at = h1 === -1 ? 0 : h1 + 1;
  lines.splice(at, 0, "", block);
  await writeFile(mdPath, lines.join("\n"), "utf8");
  return "inserted";
}

async function main() {
  const { files, opts } = parseArgs(process.argv.slice(2));
  if (!files.length) {
    console.error("用法：node tools/tts.mjs <笔记.md> [更多.md ...] [--dry] [--voice V] [--rate=-5%]");
    process.exit(2);
  }

  await mkdir(opts.outDir, { recursive: true });
  await mkdir(opts.workDir, { recursive: true });

  for (const file of files) {
    const md = await readFile(file, "utf8");
    const speakable = stripMarkdown(md);

    if (opts.dry) {
      console.log(`\n${"=".repeat(60)}\n${file}  →  ${speakable.length} 字\n${"=".repeat(60)}`);
      console.log(speakable.slice(0, 3000));
      if (speakable.length > 3000) console.log(`\n……（省略 ${speakable.length - 3000} 字）`);
      continue;
    }

    const base = path.basename(file, ".md");
    const mp3Name = `${base}.mp3`;
    const mp3Path = path.join(opts.outDir, mp3Name);
    const chunkDir = path.join(opts.workDir, base);
    await rm(chunkDir, { recursive: true, force: true });
    await mkdir(chunkDir, { recursive: true });

    const chunks = chunkText(speakable, opts.chunkSize);
    console.log(`\n[${base}] ${speakable.length} 字 → ${chunks.length} 块，${opts.concurrency} 并发`);

    const parts = chunks.map((_, i) => path.join(chunkDir, `part-${String(i).padStart(3, "0")}.mp3`));
    let done = 0;
    await pool(chunks, opts.concurrency, async (text, i) => {
      const txtFile = path.join(chunkDir, `part-${String(i).padStart(3, "0")}.txt`);
      await ttsChunk(text, txtFile, parts[i], opts);
      done++;
      process.stdout.write(`\r  合成 ${done}/${chunks.length}`);
    });
    process.stdout.write("\n");

    // 拼接
    const listFile = path.join(chunkDir, "list.txt");
    await writeFile(listFile, parts.map((p) => `file '${path.resolve(p)}'`).join("\n"), "utf8");
    const merged = path.join(chunkDir, "merged.mp3");
    await run("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", merged]);

    // 写元数据
    const title = (md.match(/^#\s+(.*)$/m)?.[1] ?? base).trim();
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      merged,
      "-c",
      "copy",
      "-metadata",
      `title=${title}`,
      "-metadata",
      "artist=local-notes TTS",
      "-metadata",
      `album=notes-tts`,
      mp3Path,
    ]);

    const dur = await probeDuration(mp3Path);
    console.log(`  → ${mp3Path}（${fmtDuration(dur)}）`);

    if (opts.embed) {
      const url = `${opts.urlBase}/${mp3Name}`;
      const how = await embedPlayer(file, url, opts);
      console.log(`  → ${file} 播放器已${how === "replaced" ? "更新" : "插入"}`);
    }
  }
}

main().catch((e) => {
  console.error(`\n失败：${e.message}`);
  process.exit(1);
});
