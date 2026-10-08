<script setup lang="ts">
/**
 * 全站「编辑此页」入口（渲染于 DefaultTheme 的 doc-before 插槽，见主题入口）。
 *
 * 显示条件（三者同时满足，任一不满足则完全不渲染）：
 *  1. GET <apiBase>/md/ping 探测通过——build/preview 产物无此路由（404），
 *     前端降级为纯阅读站点（探测见 mdPing.ts，与顶栏「＋ 新建笔记」入口
 *     共享同一模块级缓存）；
 *  2. 当前页对应真实 vault md：page.relativePath 经 rewrites 逆映射——
 *     - index.md（首页）实际是 vault 根的 homeFile（主题配置，默认 README.md）；
 *     - 主题配置 excludedPages 列出的站点页面（图谱页/附件预览页等工程页）
 *       不显示——库里零假设，由使用方站点显式传入；
 *     - 404.md（内置 404 页）与非 .md 页面不显示；
 *     - 其余 relativePath 即 vault 相对路径，直接可编辑；
 *  3. 非 404 页（同上，按 relativePath 判定；即便误判，编辑器内 GET 404 也有错误态兜底）。
 *
 * 点击「编辑此页」→ mdEditorStore.openMdEditor(vaultPath) 打开全局唯一的
 * MarkdownEditor 视图。「＋ 新建笔记」入口在顶栏（NavBarNewNote.vue，
 * nav-bar-content-before 插槽），本组件只保留「编辑此页」。
 */
import { computed, onMounted, ref } from "vue";
import { useData } from "vitepress";
import { openMdEditor } from "./mdEditorStore";
import { probeMdPing } from "./mdPing";
import { getLocalNotesThemeConfig } from "../../theme/config";

const { page } = useData();

const pingOk = ref(false);
onMounted(async () => {
  pingOk.value = await probeMdPing();
});

/** relativePath → vault 相对路径（rewrites 逆映射）；null = 不显示编辑入口 */
const vaultPath = computed<string | null>(() => {
  const cfg = getLocalNotesThemeConfig();
  const rel = page.value.relativePath;
  if (!rel || !rel.toLowerCase().endsWith(".md")) return null;
  if (rel === "404.md") return null; // 内置 404 页
  if (rel === "index.md") return cfg.homeFile; // 首页 = vault 根的 homeFile
  if (cfg.excludedPages.includes(rel)) return null; // 站点工程页（使用方显式传入）
  return rel;
});

const show = computed(() => pingOk.value && vaultPath.value !== null);

function open(): void {
  if (vaultPath.value) openMdEditor(vaultPath.value);
}
</script>

<template>
  <div v-if="show" class="edit-this-page">
    <button class="etp-btn" title="在 Monaco 编辑器中打开本页 Markdown 原文" @click="open">
      ✎ 编辑此页
    </button>
  </div>
</template>

<style scoped>
/* 渲染于 VPDoc 的 doc-before 插槽（content-container 内、标题上方），
   右对齐正文右缘；不与右侧 aside 大纲重叠 */
.edit-this-page {
  display: flex;
  justify-content: flex-end;
  padding: 0 0 2px;
}

.etp-btn {
  font-size: 0.78rem;
  line-height: 1;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-3);
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s, border-color 0.2s;
}

.etp-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

/* 移动端隐藏（编辑场景面向桌面） */
@media (max-width: 959px) {
  .edit-this-page {
    display: none;
  }
}
</style>
