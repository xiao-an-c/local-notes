<script setup lang="ts">
import { useData } from 'vitepress'
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import FullscreenOverlay from './FullscreenOverlay.vue'

/**
 * Mermaid 图表组件（迁移自 claude-tools，2026-10）
 *
 * 全屏遵循统一规范：
 * - 弹窗形式 = FullscreenOverlay（Teleport 遮罩 + 毛玻璃 + Esc，即原版形式）
 * - 按钮形式 = 工具栏按钮（与 HtmlView / MindMap / PdfViewer 一致）
 * - 全屏态重渲染图表（useMaxWidth: false，图表以自然尺寸展开）
 *
 * mermaid 库按需动态 import（浏览器端库，SSR 安全）。
 */
const props = defineProps<{
  code: string
}>()

const { isDark } = useData()
const theme = computed(() => isDark.value ? 'dark' : 'default')

const diagramRef = ref<HTMLElement | null>(null)
const fullscreenRef = ref<HTMLElement | null>(null)
const rendered = ref(false)
const isFullscreen = ref(false)
const fullscreenRendered = ref(false)

// 按需加载 mermaid（浏览器端库，SSR 安全）
let mermaidLib: typeof import('mermaid')['default'] | null = null
async function loadMermaid() {
  if (!mermaidLib) {
    mermaidLib = (await import('mermaid')).default
  }
  return mermaidLib
}

const renderDiagram = async (element: HTMLElement | null, fullscreen = false) => {
  if (!element || !props.code) return

  try {
    const mermaid = await loadMermaid()
    mermaid.initialize({
      startOnLoad: false,
      theme: theme.value,
      securityLevel: 'loose',
      gitGraph: { rotateCommitLabel: true },
      flowchart: { useMaxWidth: !fullscreen, htmlLabels: true, curve: 'basis' }
    })

    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const { svg } = await mermaid.render(id, props.code)
    element.innerHTML = svg

    if (fullscreen) {
      fullscreenRendered.value = true
    } else {
      rendered.value = true
    }
  } catch (error) {
    console.error('Mermaid render error:', error)
    element.innerHTML = `<pre style="color: var(--vp-c-danger-1); padding: 1rem;">Mermaid 渲染错误</pre>`
    if (fullscreen) {
      fullscreenRendered.value = true
    } else {
      rendered.value = true
    }
  }
}

// 全屏打开时重渲染到遮罩内（图表以自然尺寸展开）
watch(isFullscreen, (v) => {
  if (v) {
    fullscreenRendered.value = false
    nextTick(() => renderDiagram(fullscreenRef.value, true))
  }
})

onMounted(() => {
  renderDiagram(diagramRef.value)
})

// 主题切换时重渲染（mermaid 的 dark/default 配色不同）
watch(theme, () => {
  rendered.value = false
  fullscreenRendered.value = false
  nextTick(() => {
    renderDiagram(diagramRef.value)
    if (isFullscreen.value && fullscreenRef.value) {
      renderDiagram(fullscreenRef.value, true)
    }
  })
})
</script>

<template>
  <div class="mermaid-container">
    <!-- 正常态图表 -->
    <div
      ref="diagramRef"
      :class="['mermaid-wrapper', { 'mermaid-rendered': rendered }]"
    />

    <!-- 工具栏（按钮形式与其他组件一致） -->
    <div v-if="rendered" class="mermaid-toolbar">
      <button class="mermaid-btn" @click="isFullscreen = !isFullscreen">
        {{ isFullscreen ? '退出全屏' : '全屏' }}
      </button>
    </div>

    <!-- 全屏弹窗（FullscreenOverlay 统一遮罩） -->
    <FullscreenOverlay v-model:fullscreen="isFullscreen">
      <div
        ref="fullscreenRef"
        :class="['mermaid-fs-diagram', { 'mermaid-rendered': fullscreenRendered }]"
      />
    </FullscreenOverlay>
  </div>
</template>

<style scoped>
.mermaid-container {
  position: relative;
}

.mermaid-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 1.5rem 0;
  padding: 1.5rem;
  border-radius: 8px;
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  overflow-x: auto;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.mermaid-wrapper.mermaid-rendered {
  opacity: 1;
}

.mermaid-wrapper svg {
  max-width: 100%;
  height: auto;
}

/* 工具栏（右上角浮动，与 HtmlView 的 htmlview-toolbar 同构） */
.mermaid-toolbar {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
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

.mermaid-btn {
  padding: 0.25rem 0.6rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mermaid-btn:hover {
  background-color: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

/* 全屏态图表（渲染在 FullscreenOverlay 的 slot 里） */
.mermaid-fs-diagram {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.mermaid-fs-diagram.mermaid-rendered {
  opacity: 1;
}

.mermaid-fs-diagram svg {
  max-width: 100%;
  max-height: calc(90vh - 6rem);
}

/* 深色模式 */
html.dark .mermaid-wrapper {
  background-color: var(--vp-c-bg-alt);
}

/* 响应式 */
@media (max-width: 768px) {
  .mermaid-wrapper {
    padding: 1rem;
  }
}
</style>
