<script setup lang="ts">
import { computed } from "vue";
import { useData } from "vitepress";
import backlinks from "virtual:backlinks";

const { page } = useData();

interface BacklinkEntry {
  from: string;
  title: string;
  text: string;
}

// 当前页面的相对路径（无 .md 后缀，与构建时索引 key 一致）
const currentPagePath = computed(() => {
  // page.relativePath 形如 "02-永久笔记/xxx.md"
  const rel = page.value.relativePath || "";
  return rel.replace(/\.md$/, "");
});

// 当前页面的反向链接列表
const backlinkList = computed<BacklinkEntry[]>(() => {
  const key = currentPagePath.value;
  return (backlinks as Record<string, BacklinkEntry[]>)[key] || [];
});
</script>

<template>
  <div v-if="backlinkList.length > 0" class="backlinks-panel">
    <h2 class="backlinks-title">反向链接</h2>
    <ul class="backlinks-list">
      <li v-for="(bl, i) in backlinkList" :key="i" class="backlink-item">
        <a :href="'/' + bl.from + '.html'" class="backlink-link">
          {{ bl.title }}
        </a>
        <span v-if="bl.text !== bl.title" class="backlink-context">
          ← {{ bl.text }}
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.backlinks-panel {
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--vp-c-divider);
}

.backlinks-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  margin: 0 0 0.75rem 0;
  padding: 0;
}

.backlinks-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.backlink-item {
  padding: 0.3rem 0;
  font-size: 0.875rem;
  line-height: 1.5;
}

.backlink-link {
  color: var(--vp-c-brand-1);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.25s;
}

.backlink-link:hover {
  color: var(--vp-c-brand-2);
}

.backlink-context {
  color: var(--vp-c-text-3);
  margin-left: 0.5rem;
  font-size: 0.8rem;
}
</style>
