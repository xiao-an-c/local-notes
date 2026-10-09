<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

/**
 * FullscreenOverlay · 统一全屏弹窗组件（站点级）
 *
 * ## 组件规范
 *
 * **弹窗形式**（以 claude-tools 的 Mermaid 原版为准）：
 * - Teleport 到 body 的全屏遮罩（rgba 0.8 暗背景 + backdrop-blur）
 * - 内容居中在圆角面板中（max 90vw × 90vh）
 * - 右上角关闭按钮（✕）+ Esc 键退出 + 点击遮罩空白处关闭
 * - 淡入 + 缩放过渡动画
 * - 全屏期间锁定 body 滚动
 *
 * **按钮形式**（以 local-notes 的 HtmlView / MindMap / PdfViewer 为准）：
 * - 本组件**不渲染任何按钮**——全屏入口由使用方组件的工具栏提供
 * - 使用方通过 `v-model:fullscreen` 控制开关
 *
 * **内容管理**：使用方在 slot 里渲染全屏态内容。对于可重渲染的内容
 * （如 Mermaid SVG），全屏打开时重新渲染到 slot；对于 iframe / canvas，
 * 直接把元素放进 slot（Teleport 移动 DOM，现代浏览器保留 iframe 状态）。
 *
 * ## 用法
 *
 * ```vue
 * <FullscreenOverlay v-model:fullscreen="isFs">
 *   <div>全屏态内容（可不同于正常态）</div>
 * </FullscreenOverlay>
 *
 * <!-- 使用方工具栏按钮 -->
 * <button @click="isFs = !isFs">{{ isFs ? '退出全屏' : '全屏' }}</button>
 * ```
 */
const props = withDefaults(defineProps<{
  fullscreen?: boolean
  panelPadding?: string
}>(), {
  fullscreen: false,
  panelPadding: '2rem',
})

const emit = defineEmits<{ 'update:fullscreen': [value: boolean] }>()

const isFs = ref(props.fullscreen)
let bodyOverflowBackup = ''

function open(): void {
  if (isFs.value) return
  isFs.value = true
  bodyOverflowBackup = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  emit('update:fullscreen', true)
}

function close(): void {
  if (!isFs.value) return
  isFs.value = false
  document.body.style.overflow = bodyOverflowBackup
  emit('update:fullscreen', false)
}

function toggle(): void {
  isFs.value ? close() : open()
}

function onKeydown(e: KeyboardEvent): void {
  if (isFs.value && e.key === 'Escape') close()
}

watch(
  () => props.fullscreen,
  (v) => {
    if (v && !isFs.value) open()
    else if (!v && isFs.value) close()
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (isFs.value) document.body.style.overflow = bodyOverflowBackup
})

defineExpose({ open, close, toggle })
</script>

<template>
  <Teleport to="body">
    <!-- v-show 而非 v-if + Transition：Teleport 目标下的 Transition 移除
         在部分场景不生效（元素残留 body）；v-show 只切显隐，元素常驻但
         display:none，配合 CSS 动画做入场效果 -->
    <div
      v-show="isFs"
      class="fso-overlay"
      @click.self="close"
    >
        <div class="fso-panel" :style="{ padding: panelPadding }">
          <!-- 关闭按钮 -->
          <button class="fso-close" title="退出全屏 (Esc)" @click="close">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <!-- 全屏内容（由使用方渲染） -->
          <slot />
        </div>
      </div>
  </Teleport>
</template>

<style>
/* 全局样式（Teleport 到 body 后脱离 scoped 作用域） */

/* ---- 遮罩（Mermaid 原版形式；v-show 控制显隐） ---- */
.fso-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
  background-color: rgba(0, 0, 0, 0.8);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  animation: fso-in 0.3s ease;
}

@keyframes fso-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ---- 内容面板 ---- */
.fso-panel {
  position: relative;
  width: 100%;
  max-width: 90vw;
  max-height: 90vh;
  padding: 2rem;
  border-radius: 12px;
  background-color: var(--vp-c-bg, #fff);
  border: 1px solid var(--vp-c-divider, #e2e2e3);
  overflow: auto;
}

/* ---- 关闭按钮 ---- */
.fso-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background-color: var(--vp-c-bg-soft, #f6f6f7);
  color: var(--vp-c-text-2, #3c3c43);
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 1;
}

.fso-close:hover {
  background-color: var(--vp-c-danger-soft, #fde8e8);
  color: var(--vp-c-danger-1, #cc3333);
  transform: scale(1.05);
}

/* ---- 响应式 ---- */
@media (max-width: 768px) {
  .fso-overlay {
    padding: 1rem;
  }

  .fso-panel {
    padding: 1rem;
  }
}
</style>
