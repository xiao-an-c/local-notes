<script setup lang="ts">
import { ref } from "vue";

/**
 * 面板显隐切换按钮组（导航栏内，桌面端显示）：
 * - 「侧栏」：切换 <html class="ln-sidebar-collapsed">，隐藏左侧 VPSidebar
 *   并将 VPContent 的 padding-left 归零（见 theme/styles.css 折叠态规则）
 * - 「大纲」：切换 <html class="ln-aside-open">，显示右侧 VPDocAside
 *   （默认收起与展开宽度规则在 theme/skin.css）
 *
 * 状态持久化 localStorage（ln-sidebar / ln-aside）；SSR 安全——html 根元素
 * 不在 Vue 应用挂载点（#app）内，客户端 setup 同步恢复不会产生 hydration 差异；
 * 同步恢复（而非 onMounted）避免首帧闪烁。
 *
 * <960px 隐藏（窄屏侧栏是抽屉、大纲本就不显示，VitePress 自带汉堡入口）。
 */
const sidebarOpen = ref(true);
const asideOpen = ref(false);

function apply(): void {
  document.documentElement.classList.toggle("ln-sidebar-collapsed", !sidebarOpen.value);
  document.documentElement.classList.toggle("ln-aside-open", asideOpen.value);
}

if (typeof document !== "undefined") {
  sidebarOpen.value = localStorage.getItem("ln-sidebar") !== "0";
  asideOpen.value = localStorage.getItem("ln-aside") === "1";
  apply();
}

function toggleSidebar(): void {
  sidebarOpen.value = !sidebarOpen.value;
  localStorage.setItem("ln-sidebar", sidebarOpen.value ? "1" : "0");
  apply();
}

function toggleAside(): void {
  asideOpen.value = !asideOpen.value;
  localStorage.setItem("ln-aside", asideOpen.value ? "1" : "0");
  apply();
}
</script>

<template>
  <div class="ln-panel-toggles">
    <button
      class="ln-toggle-btn"
      :class="{ active: sidebarOpen }"
      :title="sidebarOpen ? '收起左侧目录' : '展开左侧目录'"
      @click="toggleSidebar"
    >
      侧栏
    </button>
    <button
      class="ln-toggle-btn"
      :class="{ active: asideOpen }"
      :title="asideOpen ? '收起右侧大纲' : '展开右侧大纲'"
      @click="toggleAside"
    >
      大纲
    </button>
  </div>
</template>
