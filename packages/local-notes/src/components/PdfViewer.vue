<script setup lang="ts">
import { computed, ref } from "vue";

/**
 * 内嵌文档预览卡片
 *
 * 原理与 DSH 的 PDF 预览一致：浏览器（Chrome/Edge/Firefox/Safari）内置
 * PDF 阅读器，把 PDF 的 URL 放进 <iframe> 即可获得完整的翻页/缩放/搜索体验，
 * 无需引入 pdf.js 等重型依赖。URL 支持 #page=N 定位到指定页。
 *
 * 用法（已全局注册，markdown 里可直接写）：
 *   <PdfViewer src="/vault/01-文献笔记/九丰能源/年报/605090-y2021.pdf" />
 *   <PdfViewer src="/vault/xx.pdf" :page="38" height="480px" collapsed />
 */
const props = withDefaults(
  defineProps<{
    /** vault 资源 URL，如 /vault/01-文献笔记/.../xx.pdf */
    src: string;
    /** 卡片标题，默认取文件名 */
    title?: string;
    /** 初始定位页码（追加 #page=N） */
    page?: number;
    /** iframe 高度，默认撑满一屏附近 */
    height?: string;
    /** 初始是否折叠（只显示标题条） */
    collapsed?: boolean;
  }>(),
  { height: "min(75vh, 820px)" },
);

const open = ref(!props.collapsed);

const fileName = computed(() => {
  if (props.title) return props.title;
  try {
    return decodeURIComponent(props.src.split("/").pop() ?? props.src);
  } catch {
    return props.src;
  }
});

const viewerSrc = computed(() => {
  const hash = props.page ? `#page=${props.page}` : "";
  return props.src + hash;
});

function toggle() {
  open.value = !open.value;
}

function fullscreen(e: Event) {
  const el = (e.currentTarget as HTMLElement | null)?.closest(".pdf-viewer");
  if (!el) return;
  if (document.fullscreenElement) void document.exitFullscreen();
  else void el.requestFullscreen?.();
}
</script>

<template>
  <div class="pdf-viewer">
    <div class="pdf-viewer-bar">
      <button class="pdf-viewer-toggle" :aria-expanded="open" :title="open ? '折叠预览' : '展开预览'" @click="toggle">
        {{ open ? "▾" : "▸" }}
      </button>
      <span class="pdf-viewer-name" :title="fileName">📄 {{ fileName }}</span>
      <span class="pdf-viewer-actions">
        <button class="pdf-viewer-btn" title="全屏预览" @click="fullscreen">全屏</button>
        <a class="pdf-viewer-btn" :href="viewerSrc" target="_blank" rel="noopener">新窗口</a>
        <a class="pdf-viewer-btn" :href="src" download>下载</a>
      </span>
    </div>
    <iframe
      v-if="open"
      class="pdf-viewer-frame"
      :src="viewerSrc"
      :style="{ height }"
      loading="lazy"
      :title="`预览：${fileName}`"
    ></iframe>
  </div>
</template>

<style scoped>
.pdf-viewer {
  margin: 0.75rem 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

.pdf-viewer-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.65rem;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
}

.pdf-viewer-toggle {
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
  padding: 0.15rem 0.3rem;
  border-radius: 4px;
}

.pdf-viewer-toggle:hover {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-1);
}

.pdf-viewer-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
  color: var(--vp-c-text-1);
}

.pdf-viewer-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.pdf-viewer-btn {
  font-size: 0.78rem;
  line-height: 1;
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  text-decoration: none;
}

.pdf-viewer-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.pdf-viewer-frame {
  display: block;
  width: 100%;
  border: none;
}

/* 全屏：容器铺满整屏并纵向排布，iframe 拉伸填满剩余高度
   （否则 iframe 保持卡片内的固定高度，全屏后下半屏空黑） */
.pdf-viewer:fullscreen,
.pdf-viewer:-webkit-full-screen {
  display: flex;
  flex-direction: column;
  border: none;
  border-radius: 0;
  height: 100vh;
}

.pdf-viewer:fullscreen .pdf-viewer-frame,
.pdf-viewer:-webkit-full-screen .pdf-viewer-frame {
  flex: 1 1 auto;
  min-height: 0;
  height: auto !important; /* 覆盖内联的固定 height */
}
</style>
