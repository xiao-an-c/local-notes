<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import PdfViewer from "./PdfViewer.vue";
import { getLocalNotesThemeConfig, normalizeAssetPrefix } from "../theme/config";

/**
 * 附件预览页（/viewer，路由名由主题配置 viewerPath 决定）：
 * 侧边栏 PDF/EPUB 链接到 `<viewerPath>#<assetPrefix><vault 相对路径>`，
 * 本组件读取 hash 渲染 <PdfViewer>。用 hash 而非 query：同一页面下切换
 * 不同文件时，location.hash 的变化不依赖 router 的页面级跳转，天然可靠。
 *
 * 安全：hash 必须以主题配置的 assetPrefix（默认 /vault/）开头且不含 ".."
 * 才放行，防外来注入与目录穿越（与抽离前站点同口径，前缀不再硬编码）。
 */
const src = ref("");

function readSrc() {
  if (typeof window === "undefined") return;
  const prefix = normalizeAssetPrefix(getLocalNotesThemeConfig().assetPrefix);
  let hash = window.location.hash.replace(/^#/, "");
  try {
    hash = decodeURIComponent(hash);
  } catch {
    /* 保留原样 */
  }
  // 只放行站内 <assetPrefix>/ 路径，防外来注入
  src.value = hash.startsWith(prefix) && !hash.includes("..") ? hash : "";
}

function onHashChange() {
  readSrc();
}

onMounted(() => {
  readSrc();
  window.addEventListener("hashchange", onHashChange);
});

onUnmounted(() => {
  window.removeEventListener("hashchange", onHashChange);
});
</script>

<template>
  <div v-if="src">
    <PdfViewer :src="src" height="calc(100vh - 120px)" />
  </div>
  <div v-else class="vault-file-empty">
    <p>未指定要预览的文件。</p>
    <p>请从左侧目录中选择 📄 PDF / 📚 EPUB 附件。</p>
  </div>
</template>

<style scoped>
.vault-file-empty {
  padding: 2rem 0;
  color: var(--vp-c-text-2);
  text-align: center;
}
</style>
