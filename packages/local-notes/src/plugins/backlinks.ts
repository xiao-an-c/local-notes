import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import type { Plugin } from "vite";
import type { LocalNotesOptions } from "../options";
import { resolveLocalNotesOptions } from "../options";

/**
 * 双链反向链接索引插件（vite 虚拟模块，进入 vite.plugins）
 *
 * build/dev 时扫描 vault 全部 md，解析 Obsidian [[wikilink]] 双链生成：
 * - `virtual:backlinks`：「页面路径 → 引用它的页面列表」反向索引，
 *   Backlinks 组件（doc-after 面板）在客户端查询；
 * - `virtual:graph`：全库图谱数据（节点=笔记页 + 顶层文件夹着色信息、
 *   边=双链），Graph 组件（graph: true 页面 doc-top 画布）消费。
 *
 * 行为与抽离前站点 backlinksPlugin 一致；参数化差异：目录扫描的跳过
 * 目录不再硬编码工程目录清单，统一改由 options.skipDirs（内置
 * DEFAULT_SKIP_DIRS + extraSkipDirs）驱动，与库内其他插件同口径
 * （隐藏目录仍一律跳过）。
 *
 * 用法：`localNotesPlugins(options)` 已自动装入；独立使用时
 * `vite.plugins.push(backlinksPlugin({ vaultDir }))`。
 */

const MODULE_ID = "virtual:backlinks";
const RESOLVED_ID = "\0virtual:backlinks";
const GRAPH_MODULE_ID = "virtual:graph";
const GRAPH_RESOLVED_ID = "\0virtual:graph";

interface LinkTarget {
  /** 笔记文件相对 vault 根的路径（无 .md 后缀），用作页面 URL 的 key */
  pagePath: string;
  /** 笔记标题（文件名或 frontmatter title 或一级标题） */
  title: string;
}

interface BacklinkEntry {
  /** 源笔记的页面路径 */
  from: string;
  /** 源笔记标题 */
  title: string;
  /** 链接文本 */
  text: string;
}

/**
 * 扫描 vault 目录下所有 markdown 文件，建立文件名 → 页面路径的索引。
 * Obsidian [[双链]] 通过文件名（不含扩展名）匹配。
 */
function buildNoteIndex(vaultDir: string, skipDirs: Set<string>): {
  byName: Map<string, LinkTarget>;
  byPath: Map<string, LinkTarget>;
} {
  const byName = new Map<string, LinkTarget>();
  const byPath = new Map<string, LinkTarget>();

  function scanDir(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath, { throwIfNoEntry: false });
      } catch {
        continue;
      }
      if (!stat) continue;

      if (stat.isDirectory()) {
        // 跳过配置的工程/工具目录与隐藏目录
        if (skipDirs.has(entry) || entry.startsWith(".")) {
          continue;
        }
        scanDir(fullPath);
      } else if (entry.endsWith(".md")) {
        const relPath = relative(vaultDir, fullPath).replace(/\\/g, "/");
        const nameNoExt = basename(entry, ".md");
        // 页面路径：去掉 .md，用于 URL 匹配
        const pagePath = relPath.replace(/\.md$/, "");

        // 读取标题：优先 frontmatter title，其次一级标题，最后文件名
        let title = nameNoExt;
        try {
          const content = readFileSync(fullPath, "utf-8");
          // frontmatter title
          const fmMatch = content.match(/^---\n[\s\S]*?^title:\s*(.+)$/m);
          if (fmMatch) {
            title = fmMatch[1]?.trim().replace(/^["']|["']$/g, "") ?? title;
          } else {
            // 一级标题
            const h1Match = content.match(/^#\s+(.+)$/m);
            if (h1Match) {
              title = h1Match[1]?.trim() ?? title;
            }
          }
        } catch {
          // 读取失败，用文件名
        }

        const target: LinkTarget = { pagePath, title };
        byPath.set(pagePath, target);
        // Obsidian 双链可用文件名匹配，同名取第一个
        if (!byName.has(nameNoExt)) {
          byName.set(nameNoExt, target);
        }
      }
    }
  }

  scanDir(vaultDir);
  return { byName, byPath };
}

/**
 * 从 markdown 内容中提取 [[wikilinks]]。
 * 支持格式：
 *   [[文件名]]
 *   [[文件名|显示文本]]
 *   [[路径/文件名]]
 */
function extractWikilinks(content: string): { target: string; text: string }[] {
  const links: { target: string; text: string }[] = [];
  // 匹配 [[...]]，排除图片嵌入 ![[...]]
  const regex = /(?<!!)\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const inner = match[1] ?? "";
    const pipeIdx = inner.indexOf("|");
    let target: string, text: string;
    if (pipeIdx >= 0) {
      target = inner.slice(0, pipeIdx).trim();
      text = inner.slice(pipeIdx + 1).trim();
    } else {
      target = inner.trim();
      text = inner.trim();
    }
    // 去掉路径前缀，取文件名部分（Obsidian 双链可带路径）
    target = basename(target).trim();
    // 去掉可能的 #anchor
    const hashIdx = target.indexOf("#");
    if (hashIdx >= 0) {
      target = target.slice(0, hashIdx).trim();
    }
    if (target) {
      links.push({ target, text });
    }
  }
  return links;
}

interface GraphNode {
  /** 页面路径（无 .md），与图节点 id、页面 URL 对应 */
  id: string;
  /** 显示标题 */
  title: string;
  /** 顶层文件夹（路径第一段），用于着色 */
  folder: string;
}

interface GraphEdge {
  source: string;
  target: string;
}

function buildGraphData(vaultDir: string, skipDirs: Set<string>): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  const backlinks = buildBacklinksIndex(vaultDir, skipDirs);
  const { byPath } = buildNoteIndex(vaultDir, skipDirs);

  // 节点：全部笔记页
  for (const [pagePath, target] of byPath) {
    nodes.push({
      id: pagePath,
      title: target.title,
      folder: pagePath.includes("/") ? (pagePath.split("/")[0] ?? "（根目录）") : "（根目录）",
    });
  }

  // 边：从反链索引反推（target <- from 即 from -> target 的链接）
  for (const [target, entries] of Object.entries(backlinks)) {
    for (const e of entries) {
      const key = `${e.from}\u0000${target}`;
      if (e.from === target || seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push({ source: e.from, target });
    }
  }

  return { nodes, edges };
}

function buildBacklinksIndex(vaultDir: string, skipDirs: Set<string>): Record<string, BacklinkEntry[]> {
  const { byName, byPath } = buildNoteIndex(vaultDir, skipDirs);
  // 反向索引：目标页面路径 → 反向链接列表
  const backlinks: Record<string, BacklinkEntry[]> = {};

  // 遍历所有笔记，提取它们的双链，建立反向索引
  function scanDir(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath, { throwIfNoEntry: false });
      } catch {
        continue;
      }
      if (!stat) continue;

      if (stat.isDirectory()) {
        if (skipDirs.has(entry) || entry.startsWith(".")) {
          continue;
        }
        scanDir(fullPath);
      } else if (entry.endsWith(".md")) {
        const relPath = relative(vaultDir, fullPath).replace(/\\/g, "/");
        const pagePath = relPath.replace(/\.md$/, "");
        const sourceTarget = byPath.get(pagePath);
        const sourceTitle = sourceTarget?.title ?? basename(entry, ".md");

        let content: string;
        try {
          content = readFileSync(fullPath, "utf-8");
        } catch {
          continue;
        }

        const links = extractWikilinks(content);
        for (const link of links) {
          // 通过文件名找到目标
          const targetNote = byName.get(link.target);
          if (!targetNote) continue;

          if (!backlinks[targetNote.pagePath]) {
            backlinks[targetNote.pagePath] = [];
          }
          backlinks[targetNote.pagePath]!.push({
            from: pagePath,
            title: sourceTitle,
            text: link.text,
          });
        }
      }
    }
  }

  scanDir(vaultDir);

  // 去重（同一源文件多次链接同一目标只记一条）
  for (const key of Object.keys(backlinks)) {
    const seen = new Set<string>();
    backlinks[key] = (backlinks[key] ?? []).filter((bl) => {
      if (seen.has(bl.from)) return false;
      seen.add(bl.from);
      return true;
    });
  }

  return backlinks;
}

/**
 * Vite 虚拟模块插件：在构建时扫描 vault 全部 markdown，生成反向链接索引
 * 与图谱数据。客户端通过 `import backlinks from 'virtual:backlinks'` /
 * `import graphData from 'virtual:graph'` 获取（Backlinks/Graph 组件已内置）。
 */
export function backlinksPlugin(options: LocalNotesOptions): Plugin {
  const resolved = resolveLocalNotesOptions(options);
  const vaultDir = resolve(resolved.vaultDir);
  const skipDirs = new Set(resolved.skipDirs);
  let cachedIndex: Record<string, BacklinkEntry[]> | null = null;
  let cachedGraph: { nodes: GraphNode[]; edges: GraphEdge[] } | null = null;

  function getIndex() {
    if (!cachedIndex) {
      cachedIndex = buildBacklinksIndex(vaultDir, skipDirs);
    }
    return cachedIndex;
  }

  function getGraph() {
    if (!cachedGraph) {
      cachedGraph = buildGraphData(vaultDir, skipDirs);
    }
    return cachedGraph;
  }

  return {
    name: "local-notes:backlinks",
    enforce: "pre",
    resolveId(id) {
      if (id === MODULE_ID) return RESOLVED_ID;
      if (id === GRAPH_MODULE_ID) return GRAPH_RESOLVED_ID;
    },
    load(id) {
      if (id === RESOLVED_ID) {
        const index = getIndex();
        return `export default ${JSON.stringify(index)};`;
      }
      if (id === GRAPH_RESOLVED_ID) {
        const graph = getGraph();
        return `export default ${JSON.stringify(graph)};`;
      }
    },
    // vault 笔记增删改时失效缓存，dev 下一次 load 重新扫描（含新笔记的反链与图谱）
    watchChange(id) {
      if (typeof id === "string" && id.endsWith(".md")) {
        cachedIndex = null;
        cachedGraph = null;
      }
    },
    // dev：内容「编辑」不重启 server，而是清缓存 + 失效虚拟模块，
    // 图谱/反链页在下次加载（导航/刷新）时拿到新数据
    configureServer(server) {
      const invalidate = () => {
        for (const id of [RESOLVED_ID, GRAPH_RESOLVED_ID]) {
          const mod = server.moduleGraph.getModuleById(id);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
      };
      server.watcher.on("change", (file) => {
        if (typeof file === "string" && file.endsWith(".md")) {
          cachedIndex = null;
          cachedGraph = null;
          invalidate();
        }
      });
    },
  };
}
