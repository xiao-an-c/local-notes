<script setup lang="ts">
import { ref } from 'vue'
import FullscreenOverlay from './FullscreenOverlay.vue'

/**
 * CardGrid · 通用卡片网格组件（从 stock-rsshub 抽象 + 全屏支持）
 *
 * 原版（CategoryOverview / FinanceGrid）各自 import 项目专属 JSON，数据
 * 耦合死了；这里泛化为 props 传入条目。全屏遵循统一规范：弹窗 =
 * FullscreenOverlay（Teleport 遮罩），按钮 = 工具栏形式。
 *
 * 用法：
 *   <CardGrid :items="[{ icon: '📘', title: '指南', href: '/guides/' }]" />
 *
 * 条目字段（title 必填，其余可选）：
 * - icon / title / mono（等宽辅助行）/ desc / href
 */
const props = defineProps<{
  items: Array<{
    icon?: string;
    title: string;
    mono?: string;
    desc?: string;
    href?: string;
  }>;
}>()

const isFullscreen = ref(false)
</script>

<template>
  <div class="card-grid-container">
    <!-- 正常态网格 -->
    <div class="card-grid">
      <component
        :is="item.href ? 'a' : 'div'"
        v-for="item in items"
        :key="item.title"
        :href="item.href"
        class="card-grid-item"
      >
        <span v-if="item.icon" class="card-grid-icon">{{ item.icon }}</span>
        <div class="card-grid-body">
          <div class="card-grid-title">{{ item.title }}</div>
          <div v-if="item.mono" class="card-grid-mono">{{ item.mono }}</div>
          <div v-if="item.desc" class="card-grid-desc">{{ item.desc }}</div>
        </div>
      </component>
    </div>

    <!-- 工具栏（按钮形式与其他组件一致） -->
    <div class="card-grid-toolbar">
      <button class="card-grid-btn" @click="isFullscreen = !isFullscreen">
        {{ isFullscreen ? '退出全屏' : '全屏' }}
      </button>
    </div>

    <!-- 全屏弹窗：同一网格放大展示 -->
    <FullscreenOverlay v-model:fullscreen="isFullscreen" panel-padding="3rem">
      <div class="card-grid card-grid-fs">
        <component
          :is="item.href ? 'a' : 'div'"
          v-for="item in items"
          :key="item.title"
          :href="item.href"
          class="card-grid-item"
        >
          <span v-if="item.icon" class="card-grid-icon">{{ item.icon }}</span>
          <div class="card-grid-body">
            <div class="card-grid-title">{{ item.title }}</div>
            <div v-if="item.mono" class="card-grid-mono">{{ item.mono }}</div>
            <div v-if="item.desc" class="card-grid-desc">{{ item.desc }}</div>
          </div>
        </component>
      </div>
    </FullscreenOverlay>
  </div>
</template>

<style scoped>
.card-grid-container {
  position: relative;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin: 16px 0;
}

/* 全屏态网格：更多列、更大间距 */
.card-grid-fs {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  margin: 0;
}

.card-grid-fs .card-grid-icon {
  font-size: 28px;
}

.card-grid-fs .card-grid-title {
  font-size: 16px;
}

.card-grid-fs .card-grid-mono,
.card-grid-fs .card-grid-desc {
  font-size: 13px;
}

@media (max-width: 768px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}

.card-grid-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition:
    border-color 0.25s,
    box-shadow 0.25s;
}

.card-grid-item:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.card-grid-icon {
  font-size: 20px;
  flex-shrink: 0;
  line-height: 1.4;
}

.card-grid-body {
  min-width: 0;
}

.card-grid-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--vp-c-text-1);
}

.card-grid-mono {
  font-size: 12px;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
}

.card-grid-desc {
  font-size: 12px;
  color: var(--vp-c-text-3);
}

/* 工具栏（右上角浮动，与其他组件同构） */
.card-grid-toolbar {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: color-mix(in srgb, var(--vp-c-bg) 82%, transparent);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

.card-grid-btn {
  padding: 0.25rem 0.6rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.card-grid-btn:hover {
  background-color: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}
</style>
