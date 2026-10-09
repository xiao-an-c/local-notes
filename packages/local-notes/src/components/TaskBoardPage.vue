<script setup lang="ts">
/**
 * 任务看板整页工程页（frontmatter `board: true` 的页面正文区整页渲染，
 * 与图谱页 Graph 的挂载方式对齐；由主题 Layout 插槽自动挂载）。
 *
 * 路由约定：`<boardPath>?src=<vault 资源 URL>`，例如
 *   /board?src=/vault/guides/assets/demo.taskboard.json
 * 嵌入面板工具栏的「整页」按钮即跳此形态（主题选项 boardPath 配置后出现）。
 *
 * ?src= 缺失时渲染引导占位（不做任何猜测默认板——vault 里可能有任意多块板）。
 * SSR 安全：location.search 只在 onMounted 读取，SSG 渲染占位容器。
 *
 * 已知边界：仅在同路由换 ?src= 时不会重新挂载（VitePress 复用页面组件），
 * 站内跳转到不同整页看板请整页刷新或从面板「整页」按钮进入（跨路由必触发）。
 */
import { onMounted, ref } from "vue";
import TaskBoard from "./TaskBoard.vue";

const src = ref<string | null>(null);

onMounted(() => {
  const q = new URLSearchParams(window.location.search);
  const s = q.get("src")?.trim();
  src.value = s ? s : null;
});
</script>

<template>
  <!-- 固定铺满视口（顶栏以下）：与图谱页 Graph 同款做法，彻底跳出
       VPDoc 文档流的内边距/最大宽度限制，四边顶满 -->
  <div class="tbpage">
    <TaskBoard v-if="src" :src="src" height="100%" fullpage />
    <div v-else class="tbpage-hint">
      <p class="tbpage-title">任务看板整页视图</p>
      <p class="tbpage-text">
        在 URL 上带 <code>?src=&lt;看板文件路径&gt;</code> 访问，例如
        <code>/board?src=/vault/xx/yy.taskboard.json</code>；
        也可以从任意内嵌看板右上角的「整页」按钮进入。
      </p>
    </div>
  </div>
</template>

<style scoped>
/* 覆盖 VPDoc 默认 padding（doc-top 插槽外层是 .VPDoc，默认留白会顶出视口；
   与 Graph.vue 的 :global 覆盖同款） */
:global(.VPDoc:has(.tbpage)) {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.tbpage {
  position: fixed;
  inset: var(--vp-nav-height) 0 0 0;
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg);
  z-index: 9;
}

/* 整页模式下面板吃满容器：去掉卡片外边距/边框/圆角，四边顶满 */
.tbpage :deep(.tb-wrap) {
  flex: 1;
  min-height: 0;
  margin: 0;
  border: none;
  border-radius: 0;
}

.tbpage-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  text-align: center;
}

.tbpage-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.tbpage-text {
  margin: 0;
  max-width: 560px;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.tbpage-text code {
  font-size: 0.78rem;
}
</style>
