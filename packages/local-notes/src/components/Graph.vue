<script setup lang="ts">
/**
 * 全库双链知识图谱页（force-graph 画布）
 *
 * 数据来源：backlinksPlugin（vite 虚拟模块 virtual:graph）在构建期扫描
 * vault 全部 md 的 wikilink 生成的节点/边索引，由使用方站点经
 * localNotesPlugins 装入；主题入口在 frontmatter `graph: true` 的页面
 * doc-top 插槽整页挂载本组件。
 *
 * 交互：文件夹图例显隐、标题搜索定位、悬停高亮邻域、点击节点跳转页面。
 *
 * 参数化（默认行为与抽离前站点一致）：
 * - 文件夹配色经主题配置 graphFolderColors 传入（folder → CSS 颜色），
 *   未列出的文件夹用中性灰——本库对 vault 目录名零假设，编号分区色板
 *   属于使用方项目；
 * - 悬停清空时的 document.title 复位为 useData().site.title（站点配置
 *   标题），不再硬编码具体站点名。
 */
import { onMounted, onBeforeUnmount, ref, computed, watch } from "vue";
import { useData, useRouter } from "vitepress";
import { getLocalNotesThemeConfig } from "../theme/config";
import graphData from "virtual:graph";

const { isDark, site } = useData();
const router = useRouter();

/** 文件夹配色（使用方经主题配置 graphFolderColors 传入；查不到用中性灰） */
const FOLDER_COLORS: Record<string, string> = getLocalNotesThemeConfig().graphFolderColors;

interface GraphNode {
  id: string;
  title: string;
  folder: string;
}
interface GraphEdge {
  source: string;
  target: string;
}

const data = graphData as { nodes: GraphNode[]; edges: GraphEdge[] };

const folders = computed(() => {
  const counts = new Map<string, number>();
  for (const n of data.nodes) counts.set(n.folder, (counts.get(n.folder) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
});

const disabledFolders = ref(new Set<string>());
function toggleFolder(f: string) {
  const s = new Set(disabledFolders.value);
  s.has(f) ? s.delete(f) : s.add(f);
  disabledFolders.value = s;
}

// ---- 搜索 ----
const query = ref("");
const matches = computed(() => {
  const q = query.value.trim();
  if (!q) return [];
  return data.nodes
    .filter((n) => !disabledFolders.value.has(n.folder) && n.title.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);
});
const focusedId = ref<string | null>(null);
function focusNode(id: string) {
  focusedId.value = id;
  query.value = "";
  // 让相机飞向该节点
  const node = fgInstance?.graphData().nodes.find((n) => n.id === id);
  if (node && Number.isFinite(node.x)) {
    fgInstance.centerAt(node.x, node.y, 600);
    fgInstance.zoom(2.2, 600);
  }
}

// ---- 力导向图实例 ----
const containerRef = ref<HTMLDivElement | null>(null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fgInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runtimeNodes: any[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runtimeLinks: any[] = [];
let hoverNeighbors: Set<string> | null = null;

// 邻接表（含出入两个方向）
const adjacency = (() => {
  const m = new Map<string, Set<string>>();
  for (const e of data.edges) {
    if (!m.has(e.source)) m.set(e.source, new Set());
    if (!m.has(e.target)) m.set(e.target, new Set());
    m.get(e.source)!.add(e.target);
    m.get(e.target)!.add(e.source);
  }
  return m;
})();

// 度数 → 节点大小
const degree = (() => {
  const d = new Map<string, number>();
  for (const n of data.nodes) d.set(n.id, adjacency.get(n.id)?.size ?? 0);
  return d;
})();

function nodeColor(n: { id: string; folder: string }): string {
  return FOLDER_COLORS[n.folder] ?? "#8c8c8c";
}

// 自定义节点绘制：悬停/聚焦高亮 + 大节点常显标题（Obsidian 观感）
function paintNode(node: any, ctx: CanvasRenderingContext2D, globalScale: number, theme: "light" | "dark") {
  const isNeighborOfHover =
    hoverNeighbors === null ? true : hoverNeighbors.has(node.id);
  const dimmed = !isNeighborOfHover && hoverNeighbors !== null;
  const r = 2 + Math.sqrt(degree.get(node.id) ?? 0) * 1.3 + (focusedId.value === node.id ? 3 : 0);

  ctx.save();
  if (dimmed) ctx.globalAlpha = 0.15;
  // 光晕（聚焦节点）
  if (focusedId.value === node.id) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
    ctx.fillStyle = theme === "dark" ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.15)";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
  ctx.fillStyle = nodeColor(node);
  ctx.fill();
  // 悬停时描边
  if (hoverNeighbors?.has(node.id) && hoverNeighbors !== null) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = theme === "dark" ? "#fff" : "#1b1b1f";
    ctx.stroke();
  }
  // 标签：全局缩放大（节点密集看不清时不画）或度数高的节点常显
  const showLabel =
    (hoverNeighbors?.has(node.id) && hoverNeighbors !== null) ||
    (degree.get(node.id) ?? 0) >= 6 && globalScale > 0.8;
  if (showLabel && globalScale > 0.6) {
    const fontSize = Math.max(12 / globalScale, 3.5);
    ctx.font = `${fontSize}px Sans-Serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = theme === "dark" ? "rgba(223,223,214,0.9)" : "rgba(60,60,67,0.9)";
    const label = node.title.length > 14 ? node.title.slice(0, 13) + "…" : node.title;
    ctx.fillText(label, node.x, node.y + r + 1);
  }
  ctx.restore();
}

function applyData(theme: "light" | "dark") {
  if (!fgInstance) return;
  const disabled = disabledFolders.value;
  const visible = new Set(data.nodes.filter((n) => !disabled.has(n.folder)).map((n) => n.id));
  // 复用已有模拟坐标（切换过滤时节点不乱飞）
  const prev = new Map(runtimeNodes.map((n) => [n.id, n]));
  runtimeNodes = data.nodes
    .filter((n) => visible.has(n.id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((n) => (prev.get(n.id) as any) ?? { ...n });
  runtimeLinks = data.edges
    .filter((e) => visible.has(e.source) && visible.has(e.target))
    .map((e) => ({ ...e }));

  fgInstance.graphData({ nodes: runtimeNodes, links: runtimeLinks });
  fgInstance.nodeCanvasObject((node: any, ctx: CanvasRenderingContext2D, gs: number) =>
    paintNode(node, ctx, gs, theme),
  )
    .nodeRelSize(1)
    .nodeVal((n: any) => 2 + Math.sqrt(degree.get(n.id) ?? 0) * 1.3)
    .nodeLabel((n: any) => `${n.title}（${degree.get(n.id) ?? 0} 条连接）`)
    .linkColor((link: any) => {
      // 悬停节点时：与邻居相连的边高亮，其余淡出
      if (hoverNeighbors) {
        const connected = hoverNeighbors.has(link.source.id) && hoverNeighbors.has(link.target.id);
        const base = theme === "dark" ? "168,177,255" : "52,81,178";
        return connected ? `rgba(${base},0.75)` : `rgba(${theme === "dark" ? "255,255,255" : "0,0,0"},0.04)`;
      }
      return theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
    })
    .onNodeHover((node: any) => {
      containerRef.value!.style.cursor = node ? "pointer" : "grab";
      hoverNeighbors = node ? new Set([node.id, ...(adjacency.get(node.id) ?? [])]) : null;
      // 悬停置顶标题，移开复位为站点标题（useData().site，不在库内硬编码站点名）
      document.title = node ? `${node.title} · 知识图谱` : site.value.title;
      // 重绘由 autoPauseRedraw(false) 持续进行，无需手动刷新
    })
    .onNodeClick((node: any) => {
      router.go(`/${node.id}.html`);
    })
    .cooldownTime(3000)
    // 力学冷却后默认会暂停重绘（autoPauseRedraw），
    // 悬停高亮依赖 linkColor/nodeCanvasObject 回调读取最新 hover 状态，
    // 参照官方 highlight 示例持续重绘；force-graph 1.5x 无实例级 refresh() 方法
    .autoPauseRedraw(false)
    .d3Force("charge")?.strength(-60);
}

onMounted(async () => {
  const { default: ForceGraph } = await import("force-graph");
  if (!containerRef.value) return;
  // kapsule 组件必须 new 调用（classMode 依赖 this instanceof 检测）；
  // 无 new 时 domElement 为 undefined，init 不执行，画布静默缺失
  fgInstance = new ForceGraph(containerRef.value);
  applyData(isDark.value ? "dark" : "light");
  // 初始视图：稍拉近
  fgInstance.zoom(1.1, 400);
});

watch(
  () => [isDark.value, disabledFolders.value] as const,
  () => {
    if (fgInstance) applyData(isDark.value ? "dark" : "light");
  },
  { immediate: false },
);

onBeforeUnmount(() => {
  fgInstance?._destructor?.();
  fgInstance = null;
});
</script>

<template>
  <div class="graph-page">
    <div class="graph-toolbar">
      <div class="graph-search">
        <input
          v-model="query"
          type="text"
          placeholder="搜索笔记标题，回车定位…"
          spellcheck="false"
        />
        <ul v-if="matches.length" class="graph-search-results">
          <li v-for="m in matches" :key="m.id" @mousedown.prevent="focusNode(m.id)">
            <span class="dot" :style="{ background: nodeColor(m) }" />{{ m.title }}
            <span class="path">{{ m.folder }}</span>
          </li>
        </ul>
      </div>
      <div class="graph-legend">
        <button
          v-for="[f, count] in folders"
          :key="f"
          class="legend-item"
          :class="{ off: disabledFolders.has(f) }"
          :title="`${f}（${count} 页）点击显隐`"
          @click="toggleFolder(f)"
        >
          <span class="dot" :style="{ background: FOLDER_COLORS[f] ?? '#8c8c8c' }" />
          {{ f.replace(/^-*/, "") }}·{{ count }}
        </button>
      </div>
    </div>
    <div ref="containerRef" class="graph-canvas" />
  </div>
</template>

<style scoped>
/* 覆盖 VPDoc 默认 padding（doc-top 插槽外层是 .VPDoc，默认 48px 顶部留白会把画布顶出视口） */
:global(.VPDoc:has(.graph-page)) {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.graph-page {
  position: fixed;
  inset: var(--vp-nav-height) 0 0 0;
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg);
  z-index: 9;
}

.graph-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  align-items: center;
  padding: 0.5rem 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  position: relative;
  z-index: 2;
}

.graph-search {
  position: relative;
  flex: 0 1 280px;
}

.graph-search input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.35rem 0.75rem;
  font-size: 0.875rem;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  outline: none;
}

.graph-search input:focus {
  border-color: var(--vp-c-brand-1);
}

.graph-search-results {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  list-style: none;
  margin: 0;
  padding: 4px;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  box-shadow: var(--vp-shadow-2);
  max-height: 280px;
  overflow-y: auto;
}

.graph-search-results li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.8125rem;
  color: var(--vp-c-text-1);
  border-radius: 6px;
  cursor: pointer;
}

.graph-search-results li:hover {
  background: var(--vp-c-bg-soft);
}

.graph-search-results .path {
  margin-left: auto;
  color: var(--vp-c-text-3);
  font-size: 0.75rem;
}

.graph-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  flex: 1 1 400px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.5rem;
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
}

.legend-item:hover {
  background: var(--vp-c-bg-soft);
}

.legend-item.off {
  opacity: 0.35;
  text-decoration: line-through;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.graph-canvas {
  flex: 1;
  min-height: 0;
}
</style>
