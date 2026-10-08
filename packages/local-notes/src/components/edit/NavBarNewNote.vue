<script setup lang="ts">
/**
 * 顶栏「＋ 新建笔记」入口（全站常驻，不随页面正文走）。
 *
 * 挂载点：DefaultTheme 的 nav-bar-content-before 插槽（见主题入口）——
 * 渲染在顶栏 .content-body 最左、紧邻站点标题区（VPNavBarTitle 右侧）。
 * 更贴近标题文本的 nav-bar-title-after 插槽实测位于标题链接 <a class="title">
 * 内部，按钮嵌在 <a> 里交互元素嵌套不合法（点击会连带跳转首页），故不采用。
 *
 * 显示条件：GET <apiBase>/md/ping 通过（dev 编辑模式）才渲染——build/preview
 * 产物无此路由，按钮整体隐藏（探测见 mdPing.ts，模块级缓存全站共享、只发一次）。
 *
 * 点击 → mdEditorStore.openNewNoteDialog() 打开全局唯一的 NewNoteDialog
 * （对话框本体仍挂 layout-bottom 插槽，创建→站点刷新→自动进编辑的全流程
 * 逻辑零改动，入口位于顶栏、全站可达）。
 *
 * 移动端：顶栏空间有限，<48rem（VitePress 汉堡菜单出现的断点）收起文字
 * 只留「＋」图标，可访问名称由 aria-label / title 提供。
 */
import { onMounted, ref } from "vue";
import { openNewNoteDialog } from "./mdEditorStore";
import { probeMdPing } from "./mdPing";

const pingOk = ref(false);
onMounted(async () => {
  pingOk.value = await probeMdPing();
});
</script>

<template>
  <button
    v-if="pingOk"
    class="nb-new-note"
    type="button"
    title="在 vault 既有目录中新建一篇笔记并进入编辑"
    aria-label="新建笔记"
    @click="openNewNoteDialog"
  >
    <span class="plus" aria-hidden="true">＋</span>
    <span class="text" aria-hidden="true">新建笔记</span>
  </button>
</template>

<style scoped>
/* 顶栏内小号胶囊按钮：与 VitePress 顶栏（搜索/菜单）视觉协调；
   flex:none 保证不被 nav overflow 引擎压缩，自身体量足够小不挤压标题 */
.nb-new-note {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  height: 2rem;
  margin-right: 0.75rem;
  padding: 0 0.65rem;
  font-size: 0.82rem;
  line-height: 1;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s, border-color 0.2s;
}

.nb-new-note:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.plus {
  font-size: 0.9rem;
  font-weight: 600;
}

/* 窄屏（<48rem，汉堡菜单断点）：只留「＋」图标，给标题与汉堡让位 */
@media (max-width: 47.99rem) {
  .nb-new-note {
    margin-right: 0.25rem;
    padding: 0 0.5rem;
  }

  .nb-new-note .text {
    display: none;
  }
}
</style>
