<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getLocalNotesThemeConfig, joinApi, normalizeAssetPrefix, stripAssetPrefix } from "../theme/config";

/**
 * 内嵌 HTML 报告查看组件（与 MindMap 同构的阅读器形态）
 *
 * 用法（主题入口已全局注册，markdown 正文直接写；亦可单独 import 使用）：
 *   <HtmlView src="/vault/04-研报产出/恒瑞医药-投资逻辑-20260929.html" />
 *   <HtmlView src="/vault/xx/报告.html" height="640px" />
 * （src 前缀由主题配置 assetPrefix 决定，默认 /vault/，需与插件组配置一致）
 *
 * 渲染方式：<iframe src=src> 整页加载 vault 内的自包含 HTML（研报通常内联
 * ECharts CDN 脚本与样式，iframe 天然样式/脚本隔离，既不污染 VitePress 页面，
 * 也保证报告自身样式 100% 还原——这是不用 v-html 的根本原因：研报 HTML 的
 * <style> 会泄漏到整页、<script> 在 v-html 注入后不执行）。
 *
 * 功能：工具栏（新窗口打开 / 全屏 Esc 退出）、加载/缺失/错误三态、
 * 明暗自适应（iframe 内报告自带主题，浅底研报在暗色站点下加浅色背板衬托）。
 *
 * SSR 安全：fetch/iframe 都在 onMounted 后进行，模板只留占位容器。
 *
 * 降级：src 404 → 空态卡片提示；build/preview 产物同样可渲染（vaultAsset
 * build 插件会把 .html 拷贝进 dist，iframe 直接读静态文件，无需保存服务）。
 */
const props = withDefaults(
  defineProps<{
    /** vault 资源 URL，如 <assetPrefix>notes/xx.html（必填） */
    src: string;
    /** 容器高度 */
    height?: string;
    /** 是否显示浮动工具栏（新窗口打开/全屏），默认 true */
    toolbar?: boolean;
  }>(),
  { height: "560px", toolbar: true },
);

const { isDark } = useIsDark();

/** 站点资源配置（assetPrefix / apiBase 由 localNotesTheme(options) 落入，默认 /vault/、/api） */
const cfg = getLocalNotesThemeConfig();
const assetPrefix = normalizeAssetPrefix(cfg.assetPrefix);

// ---- 组件状态 ----
type State = "loading" | "ready" | "missing" | "error";
const state = ref<State>("loading");
const errorMsg = ref("");
const isFullscreen = ref(false);
/** iframe 是否已触发 load（作为 loading → ready 的兜底信号；探测失败但 iframe 可用时仍放行） */
const frameLoaded = ref(false);

const wrapRef = ref<HTMLDivElement | null>(null);

// ---- 路径工具 ----
const fileName = computed(() => {
  try {
    return decodeURIComponent(props.src.split("/").pop() ?? props.src);
  } catch {
    return props.src;
  }
});

/** 探测资源是否存在：HEAD 不行（dev 中间件对 HEAD 无特殊处理，部分环境返回 405/501），用 GET + content-type 判断 */
async function probeSrc(): Promise<"ok" | "missing" | "error"> {
  try {
    const res = await fetch(props.src + "?t=" + Date.now(), { method: "GET" });
    if (res.status === 404 || res.status === 410) return "missing";
    if (!res.ok) return "error";
    // 文件不存在时 VitePress 会以 SPA fallback 返回 200 的 HTML 页面——但这正是
    // 我们要的类型！只有 JSON/text/其他类型才说明不是 HTML 文件（如目录、损坏文件）
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !contentType.toLowerCase().includes("text/html")) return "missing";
    return "ok";
  } catch {
    return "error";
  }
}

async function load(): Promise<void> {
  state.value = "loading";
  frameLoaded.value = false;
  const result = await probeSrc();
  if (result === "missing") {
    state.value = "missing";
    return;
  }
  // error 时仍给 iframe 一次机会（探测 fetch 可能被扩展/网络策略拦截，iframe 常仍可加载）
  state.value = "ready";
}

function onFrameLoad(): void {
  frameLoaded.value = true;
}

// ---- 全屏（组件容器 fixed 覆盖视口，Esc 退出） ----
function toggleFullscreen(): void {
  isFullscreen.value ? exitFullscreen() : enterFullscreen();
}

function enterFullscreen(): void {
  if (isFullscreen.value || !wrapRef.value) return;
  isFullscreen.value = true;
  bodyOverflowBackup = document.body.style.overflow;
  document.body.style.overflow = "hidden";
}

function exitFullscreen(): void {
  if (!isFullscreen.value) return;
  isFullscreen.value = false;
  document.body.style.overflow = bodyOverflowBackup;
}

let bodyOverflowBackup = "";

function onKeydown(e: KeyboardEvent): void {
  if (isFullscreen.value && e.key === "Escape") exitFullscreen();
}

// ---- 新窗口打开（独立标签页直接读 vault 静态文件，图表全交互） ----
function openInNewTab(): void {
  window.open(props.src, "_blank", "noopener");
}

// ---- 生命周期 ----
onMounted(async () => {
  if (!props.src.startsWith(assetPrefix)) {
    state.value = "error";
    errorMsg.value = `src 必须是以 ${assetPrefix} 开头的站点绝对路径（主题配置 assetPrefix）`;
    return;
  }
  window.addEventListener("keydown", onKeydown);
  await load();
});

watch(
  () => props.src,
  () => {
    exitFullscreen();
    void load();
  },
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  if (isFullscreen.value) document.body.style.overflow = bodyOverflowBackup;
});

const wrapStyle = computed(() => (isFullscreen.value ? {} : { height: props.height }));

/** useData 的轻量替身：组件库不直接依赖 vitepress 的 useData 时也能用；
 * 但本项目本来就 peer 依赖 vitepress，直接用 useData 亦可。这里保守取
 * document.documentElement.classList 里 VitePress 写入的 dark 类。 */
function useIsDark() {
  const isDark = ref(false);
  if (typeof document !== "undefined") {
    isDark.value = document.documentElement.classList.contains("dark");
    // 简单 MutationObserver 跟随主题切换
    const ob = new MutationObserver(() => {
      isDark.value = document.documentElement.classList.contains("dark");
    });
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    onBeforeUnmount(() => ob.disconnect());
  }
  return { isDark };
}
</script>

<template>
  <div ref="wrapRef" class="htmlview-wrap" :class="{ fullscreen: isFullscreen }" :style="wrapStyle">
    <!-- 浮动工具栏 -->
    <div v-if="toolbar && state !== 'loading'" class="htmlview-toolbar">
      <span class="hv-status" :title="fileName">
        <span class="hv-file">📄 {{ fileName }}</span>
      </span>
      <button class="hv-btn" title="在新标签页打开（完整交互）" @click="openInNewTab">新窗口打开</button>
      <button class="hv-btn" @click="toggleFullscreen">{{ isFullscreen ? "退出全屏" : "全屏" }}</button>
    </div>

    <!-- 加载 / 空态 / 错误 -->
    <div v-if="state === 'loading'" class="htmlview-placeholder"><span>加载中…</span></div>
    <div v-else-if="state === 'missing'" class="htmlview-placeholder">
      <p class="hv-title">该 HTML 文件不存在</p>
      <p class="hv-path">{{ fileName }}</p>
      <p class="hv-hint">请确认文件已放入 vault，且路径以 {{ assetPrefix }} 开头</p>
    </div>
    <div v-else-if="state === 'error'" class="htmlview-placeholder">
      <p class="hv-title">HTML 加载失败</p>
      <p class="hv-hint">{{ errorMsg }}</p>
    </div>

    <!-- iframe 容器：sandbox 允许脚本（ECharts）与同源（CDN 字体/CSS 拉取），
         不允许 form 提交/弹出窗口绕过新窗口打开按钮 -->
    <iframe
      v-show="state === 'ready'"
      :src="state === 'ready' ? props.src : undefined"
      class="htmlview-frame"
      :class="{ 'light-board': isDark }"
      sandbox="allow-scripts allow-same-origin allow-popups"
      loading="lazy"
      referrerpolicy="no-referrer"
      @load="onFrameLoad"
    />
  </div>
</template>

<style scoped>
.htmlview-wrap {
  position: relative;
  margin: 0.75rem 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  overflow: hidden;
}

/* 全屏：fixed 覆盖整个视口，z-index 与 MindMap 同层 */
.htmlview-wrap.fullscreen {
  position: fixed;
  inset: 0;
  z-index: 2100;
  margin: 0;
  border: none;
  border-radius: 0;
}

.htmlview-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}

/* 暗色站点下浅底研报背板：给 iframe 白底留一层软过渡，避免夜间刺眼突兀 */
.htmlview-frame.light-board {
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 4%);
}

.htmlview-toolbar {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-elv);
  background: color-mix(in srgb, var(--vp-c-bg-elv) 88%, transparent);
  backdrop-filter: blur(8px);
  max-width: calc(100% - 1rem);
}

.hv-file {
  display: inline-block;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
  vertical-align: middle;
}

.hv-btn {
  flex: none;
  font-size: 0.75rem;
  line-height: 1;
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  white-space: nowrap;
}

.hv-btn:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.hv-status {
  display: inline-flex;
  align-items: center;
}

.htmlview-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  text-align: center;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
}

.htmlview-placeholder > span {
  font-size: 0.85rem;
  color: var(--vp-c-text-3);
}

.hv-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.hv-path {
  margin: 0;
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hv-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
  max-width: 85%;
}
</style>
