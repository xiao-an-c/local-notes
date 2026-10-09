<script setup lang="ts">
import { computed } from "vue";
import Mermaid from "./Mermaid.vue";

/**
 * MermaidFence · ```mermaid 围栏的客户端载体。
 *
 * markdown-it 插件 plugins/mermaidFence.ts 在构建期把围栏代码 base64 编码后
 * 写成 <MermaidFence code-b64="...">，这里解码（UTF-8 安全）交给 Mermaid.vue。
 * 渲染/全屏/暗色主题等行为全部复用 Mermaid.vue，不重复实现。
 *
 * 主题入口已全局注册本组件，markdown 里写 ```mermaid 围栏即可，无需手写标签。
 */
const props = defineProps<{
  codeB64: string;
}>();

const code = computed(() => {
  const bin = atob(props.codeB64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
});
</script>

<template>
  <Mermaid :code="code" />
</template>
