<script setup lang="ts">
/**
 * 「新建笔记」对话框（目录映射选择 + 模板套用 + 创建后自动进编辑）。
 *
 * 打开方式：顶栏「＋ 新建笔记」（NavBarNewNote.vue，nav-bar-content-before
 * 插槽）→ newNoteDialog.openNewNoteDialog()；
 * 本组件由主题挂在 layout-bottom 插槽常驻渲染（默认 v-if 隐藏），
 * 与 MarkdownEditor 同款单例模式，任何页面均可呼出。
 *
 * 创建全流程（适配自动重启的重启窗口）：
 *  1. GET <apiBase>/md/dirs 拉取「已存在目录」树（目录映射——第一版只能在
 *     既有目录里建）与模板清单（服务端配置 templateDir 时才有）；
 *  2. 选目录 + 输文件名（自动补 .md、非法字符校验、防抖实时查重——GET
 *     <apiBase>/md 探测 200=已存在 / 404=可用）+ 可选模板 → POST <apiBase>/md；
 *  3. 201 后立即写 sessionStorage「待打开编辑」标记（setPendingOpenEditor），
 *     随后轮询 ping 等 dev server 自动重启：先等 ping 挂一次（重启开始），
 *     再等 ping 恢复（重启完成、侧栏/路由表已含新笔记）→ location.href 跳转新笔记页；
 *  4. 若 Vite 的 full reload 抢在我们跳转前发生（重启窗口的正常现象），本组件
 *     挂载时的消费者接棒：读标记 → 不在目标页则继续跳转，已在目标页则
 *     openMdEditor() 自动进入 Monaco 编辑并清除标记。
 *  兜底：「立即打开」一键直达；「留在此页」清除标记放弃自动流程。
 *
 * 目录默认选中：主题配置 defaultNewNoteDir 指定时选中它（不存在则忽略）；
 * 未指定（库默认）选中首个顶层目录——库对目录名零假设。
 *
 * SSR 安全：模板默认不渲染（v-if）；sessionStorage/fetch 全部在事件与
 * onMounted 中，build SSG 阶段无副作用。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  clearPendingOpenEditor,
  closeNewNoteDialog,
  newNoteDialogState,
  openMdEditor,
  readPendingOpenEditor,
  setPendingOpenEditor,
  vaultPathToSiteUrl,
} from "./mdEditorStore";
import { getLocalNotesThemeConfig, joinApi } from "../../theme/config";

const cfg = getLocalNotesThemeConfig();

// ---- 目录树 ----
interface DirNode {
  /** 目录名（末段） */
  name: string;
  /** vault 相对路径（posix，如 notes/2025） */
  rel: string;
  depth: number;
  children: DirNode[];
}

function buildTree(sortedDirs: string[]): DirNode[] {
  const roots: DirNode[] = [];
  const map = new Map<string, DirNode>();
  for (const rel of sortedDirs) {
    const segs = rel.split("/");
    const node: DirNode = {
      name: segs[segs.length - 1],
      rel,
      depth: segs.length - 1,
      children: [],
    };
    map.set(rel, node);
    const parentRel = segs.slice(0, -1).join("/");
    const parent = parentRel ? map.get(parentRel) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

// ---- 组件状态 ----
const dirsLoaded = ref(false);
const loadingDirs = ref(false);
const loadError = ref("");
const tree = ref<DirNode[]>([]);
const templates = ref<string[]>([]);
/** 服务端模板目录（相对 vault）；空串 = 未启用模板 */
const templateDir = ref("");
const expanded = ref<Set<string>>(new Set());
const selectedDir = ref("");
const fileNameRaw = ref("");
const templateSel = ref("");
const creating = ref(false);
const createError = ref("");
const createdPath = ref("");
type Phase = "form" | "created";
const phase = ref<Phase>("form");
/** 查重状态：idle=未检 checking free taken unknown */
const dupState = ref<"idle" | "checking" | "free" | "taken" | "unknown">("idle");
/** 重启等待阶段提示（created 态展示） */
const restartHint = ref("等待站点重启…");
/** 「留在此页/立即打开」后置 true，阻止 waitRestartThenOpen 再跳转 */
let openCancelled = false;
let dupTimer: ReturnType<typeof setTimeout> | null = null;
let dupSeq = 0;

// ---- 打开/关闭 ----
function requestClose(): void {
  if (creating.value) return; // 创建请求在途，禁止半途关闭造成状态错乱
  closeNewNoteDialog();
}

function onBackdrop(): void {
  if (phase.value !== "form") return; // created 态只能走显式按钮，避免误点丢标记
  requestClose();
}

/** created 态「留在此页」：放弃自动打开（清除标记），笔记本身已创建成功 */
function stayHere(): void {
  openCancelled = true;
  clearPendingOpenEditor();
  closeNewNoteDialog();
}

/** created 态「立即打开」：一键直达新笔记页（清除标记防消费者二次跳转） */
function openNow(): void {
  openCancelled = true;
  const url = vaultPathToSiteUrl(createdPath.value);
  clearPendingOpenEditor();
  window.location.href = url;
}

// ---- 目录加载 ----
async function fetchDirs(): Promise<void> {
  loadingDirs.value = true;
  loadError.value = "";
  try {
    const res = await fetch(joinApi(cfg, "/md/dirs"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = (await res.json().catch(() => null)) as any;
    if (!res.ok) throw new Error(j?.error ?? `目录列表加载失败（HTTP ${res.status}）`);
    const dirList: string[] = Array.isArray(j?.dirs) ? j.dirs.filter((s: unknown): s is string => typeof s === "string") : [];
    if (dirList.length === 0) throw new Error("vault 内没有可用目录");
    tree.value = buildTree(dirList);
    // 默认展开全部顶层目录；默认选中主题配置 defaultNewNoteDir（若存在），
    // 否则选中首个顶层目录——库对目录名零假设，不预设任何「入口目录」
    expanded.value = new Set(tree.value.map((n) => n.rel));
    let initial = "";
    if (cfg.defaultNewNoteDir && dirList.includes(cfg.defaultNewNoteDir)) {
      initial = cfg.defaultNewNoteDir;
      // 展开选中目录的祖先链（含自身），保证目标在树中可见可达
      const segs = initial.split("/");
      const ancestors = segs.slice(0, -1).map((_, i) => segs.slice(0, i + 1).join("/"));
      expanded.value = new Set([...expanded.value, ...ancestors, initial]);
    }
    if (!initial) initial = tree.value[0].rel;
    selectedDir.value = initial;
    templateDir.value = typeof j?.templateDir === "string" ? j.templateDir : "";
    templates.value = Array.isArray(j?.templates)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? j.templates.filter((s: unknown): s is string => typeof s === "string")
      : [];
    dirsLoaded.value = true;
  } catch (e) {
    loadError.value = (e as Error)?.message ?? String(e);
  } finally {
    loadingDirs.value = false;
  }
}

function pickDir(node: DirNode): void {
  selectedDir.value = node.rel;
  // 选中即展开该目录，方便顺势深入子目录
  if (node.children.length && !expanded.value.has(node.rel)) {
    const next = new Set(expanded.value);
    next.add(node.rel);
    expanded.value = next;
  }
}

function toggleExpand(node: DirNode): void {
  if (!node.children.length) return;
  const next = new Set(expanded.value);
  if (next.has(node.rel)) next.delete(node.rel);
  else next.add(node.rel);
  expanded.value = next;
}

/** 树的可见行（按展开状态拍平，供 v-for） */
const visibleRows = computed<DirNode[]>(() => {
  const rows: DirNode[] = [];
  const walk = (nodes: DirNode[]): void => {
    for (const n of nodes) {
      rows.push(n);
      if (expanded.value.has(n.rel)) walk(n.children);
    }
  };
  walk(tree.value);
  return rows;
});

// ---- 文件名校验 + 实时查重 ----
function ensureMdSuffix(name: string): string {
  return /\.md$/i.test(name) ? name : `${name}.md`;
}

/** 合法性校验；返回 null = 合法 */
function validateName(raw: string): string | null {
  const name = raw.trim();
  if (!name) return "请输入文件名";
  if (/[\\/:*?"<>|\n\r\0]/.test(name)) return "文件名不能包含 \\ / : * ? \" < > | 等字符";
  if (name.startsWith(".")) return "文件名不能以 . 开头";
  if (/[ .]$/.test(name)) return "文件名不能以空格或 . 结尾";
  return null;
}

const finalName = computed(() => ensureMdSuffix(fileNameRaw.value.trim()));
const nameError = computed(() => validateName(fileNameRaw.value));
/** 全路径预览（仅名字合法时展示） */
const fullPathPreview = computed(() =>
  selectedDir.value && !nameError.value ? `${selectedDir.value}/${finalName.value}` : "",
);

watch([selectedDir, fileNameRaw], () => {
  dupState.value = "idle";
  createError.value = "";
  if (dupTimer) clearTimeout(dupTimer);
  if (nameError.value || !selectedDir.value) return;
  const seq = ++dupSeq;
  const path = `${selectedDir.value}/${finalName.value}`;
  dupTimer = setTimeout(async () => {
    dupState.value = "checking";
    try {
      // 复用 GET <apiBase>/md 做存在性探测：200=已存在 / 404=可用
      const res = await fetch(joinApi(cfg, `/md?path=${encodeURIComponent(path)}`));
      if (seq !== dupSeq) return; // 已有更新的输入，丢弃过期结果
      dupState.value = res.status === 200 ? "taken" : res.status === 404 ? "free" : "unknown";
    } catch {
      if (seq === dupSeq) dupState.value = "unknown";
    }
  }, 350);
});

const nameHint = computed(() => {
  if (nameError.value) return nameError.value;
  if (!selectedDir.value) return "";
  if (dupState.value === "checking") return "查重中…";
  if (dupState.value === "taken") return "⚠ 同名笔记已存在，请换一个文件名";
  if (dupState.value === "free") return "✓ 文件名可用";
  return "";
});

const canCreate = computed(
  () => dirsLoaded.value && !!selectedDir.value && !nameError.value && dupState.value !== "taken" && !creating.value,
);

/** 模板下拉显示名：剥掉服务端模板目录前缀（如 "templates/读书模板.md" → "读书模板"） */
function templateLabel(t: string): string {
  if (templateDir.value && t.startsWith(templateDir.value + "/")) {
    return t.slice(templateDir.value.length + 1).replace(/\.md$/i, "");
  }
  return t.replace(/\.md$/i, "");
}

// ---- 创建 + 重启窗口适配 ----
async function create(): Promise<void> {
  if (!canCreate.value) return;
  creating.value = true;
  createError.value = "";
  const body: Record<string, unknown> = { path: `${selectedDir.value}/${finalName.value}` };
  if (templateSel.value) body.template = templateSel.value;
  try {
    const res = await fetch(joinApi(cfg, "/md"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = (await res.json().catch(() => null)) as any;
    if (res.status === 201 && j?.ok && typeof j.path === "string") {
      createdPath.value = j.path;
      // 先写标记再进入等待：Vite full reload 随时可能发生，标记必须抢先落位
      setPendingOpenEditor(j.path);
      phase.value = "created";
      void waitRestartThenOpen(vaultPathToSiteUrl(j.path));
    } else {
      createError.value = j?.error ?? `创建失败（HTTP ${res.status}）`;
    }
  } catch (e) {
    createError.value = (e as Error)?.message ? `创建失败：${(e as Error).message}` : "创建失败（网络异常）";
  } finally {
    creating.value = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function pingAlive(): Promise<boolean> {
  try {
    const res = await fetch(joinApi(cfg, "/md/ping"), { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 等自动重启的重启窗口走完再跳转：
 * 阶段一等 ping 挂一次（重启开始；防抖 800ms + restart 耗时，给 8s 窗口），
 * 阶段二等 ping 恢复（重启完成，上限 45s），随后整页跳转到新笔记页。
 * 任一阶段被 full reload 打断也无妨——sessionStorage 标记 + 挂载消费者接棒。
 */
async function waitRestartThenOpen(url: string): Promise<void> {
  const DOWN_WINDOW_MS = 8000;
  const UP_LIMIT_MS = 45000;
  const t0 = Date.now();
  let sawDown = false;
  while (Date.now() - t0 < DOWN_WINDOW_MS) {
    if (openCancelled) return;
    if (!(await pingAlive())) {
      sawDown = true;
      break;
    }
    await sleep(300);
  }
  if (sawDown) {
    restartHint.value = "站点重启中，等待恢复…";
    const t1 = Date.now();
    while (Date.now() - t1 < UP_LIMIT_MS) {
      if (openCancelled) return;
      await sleep(300);
      if (await pingAlive()) break;
    }
    if (openCancelled) return;
    restartHint.value = "站点已恢复，正在打开新笔记…";
    await sleep(400); // 缓冲：等路由表/页面模块就绪再跳
  } else {
    restartHint.value = "未探测到重启窗口，直接打开新笔记…";
  }
  if (openCancelled) return;
  window.location.href = url;
}

// ---- 挂载：接棒「待打开」标记（full reload 后由本组件继续流程） ----
function normPathname(p: string): string {
  try {
    p = decodeURIComponent(p);
  } catch {
    /* 保留原样 */
  }
  p = p.replace(/\.html$/i, "");
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

function isCurrentUrl(url: string): boolean {
  try {
    return normPathname(new URL(url, window.location.origin).pathname) === normPathname(window.location.pathname);
  } catch {
    return false;
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (!newNoteDialogState.open || e.key !== "Escape") return;
  e.preventDefault();
  e.stopPropagation();
  if (phase.value === "form") requestClose();
  else stayHere();
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown, true);
  // 消费「待打开编辑」标记：在目标页 → 直接开编辑器；不在 → 继续跳转过去
  const pending = readPendingOpenEditor();
  if (!pending) return;
  if (isCurrentUrl(pending.url)) {
    clearPendingOpenEditor();
    openMdEditor(pending.path);
  } else {
    window.location.href = pending.url;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown, true);
  if (dupTimer) clearTimeout(dupTimer);
});

// ---- 每次打开重置表单 ----
watch(
  () => newNoteDialogState.open,
  (v) => {
    if (!v) return;
    openCancelled = false;
    phase.value = "form";
    dirsLoaded.value = false;
    tree.value = [];
    templates.value = [];
    templateDir.value = "";
    selectedDir.value = "";
    fileNameRaw.value = "";
    templateSel.value = "";
    creating.value = false;
    createError.value = "";
    createdPath.value = "";
    dupState.value = "idle";
    restartHint.value = "等待站点重启…";
    void fetchDirs();
  },
);
</script>

<template>
  <div v-if="newNoteDialogState.open" class="nnd-overlay" role="dialog" aria-modal="true" aria-label="新建笔记">
    <div class="nnd-backdrop" @click="onBackdrop" />
    <div class="nnd-panel">
      <header class="nnd-head">
        <span class="nnd-title">＋ 新建笔记</span>
        <button class="nnd-x" title="关闭（Esc）" :disabled="creating" @click="requestClose">×</button>
      </header>

      <!-- 表单态 -->
      <template v-if="phase === 'form'">
        <div v-if="loadError" class="nnd-load-error">
          <p>{{ loadError }}</p>
          <button class="nnd-btn" @click="fetchDirs">重试</button>
        </div>

        <div v-else class="nnd-form">
          <label class="nnd-label">位置（从 vault 已有目录中选择）</label>
          <div class="nnd-tree" role="listbox" aria-label="目标目录">
            <div v-if="loadingDirs" class="nnd-tree-loading">目录加载中…</div>
            <div
              v-for="row in visibleRows"
              :key="row.rel"
              class="nnd-dir-row"
              :class="{ sel: row.rel === selectedDir }"
              :style="{ paddingLeft: `${8 + row.depth * 18}px` }"
              role="option"
              :aria-selected="row.rel === selectedDir"
              :title="row.rel"
              @click="pickDir(row)"
            >
              <span
                v-if="row.children.length"
                class="nnd-caret"
                :class="{ open: expanded.has(row.rel) }"
                @click.stop="toggleExpand(row)"
                >▸</span
              >
              <span v-else class="nnd-caret nnd-caret-leaf">·</span>
              <span class="nnd-dir-name">{{ row.name }}</span>
              <span v-if="row.rel === selectedDir" class="nnd-check">✓</span>
            </div>
          </div>

          <label class="nnd-label" for="nnd-name">文件名（自动补 .md）</label>
          <input
            id="nnd-name"
            v-model="fileNameRaw"
            class="nnd-input"
            placeholder="如：某某主题调研速记"
            spellcheck="false"
            @keydown.enter="create"
          />
          <p class="nnd-hint" :class="{ warn: nameError || dupState === 'taken', ok: !nameError && dupState === 'free' }">
            {{ nameHint || fullPathPreview }}
          </p>

          <label class="nnd-label" for="nnd-tpl">模板（可选，不选则仅一级标题）</label>
          <select id="nnd-tpl" v-model="templateSel" class="nnd-input">
            <option value="">（空笔记）</option>
            <option v-for="t in templates" :key="t" :value="t">
              {{ templateLabel(t) }}
            </option>
          </select>
        </div>

        <footer class="nnd-foot">
          <span class="nnd-error">{{ createError }}</span>
          <span class="nnd-spring" />
          <button class="nnd-btn" :disabled="creating" @click="requestClose">取消</button>
          <button class="nnd-btn nnd-primary" :disabled="!canCreate" @click="create">
            {{ creating ? "创建中…" : "创建" }}
          </button>
        </footer>
      </template>

      <!-- 创建成功态：等重启 → 自动跳转 → 自动进编辑 -->
      <template v-else>
        <div class="nnd-created">
          <p class="nnd-created-title">✅ 笔记已创建</p>
          <p class="nnd-created-path">{{ createdPath }}</p>
          <p class="nnd-created-desc">
            新增笔记会触发站点自动重启以刷新侧栏与搜索（约数秒），完成后将自动打开该笔记并进入编辑。
          </p>
          <footer class="nnd-foot">
            <span class="nnd-wait">{{ restartHint }}</span>
            <span class="nnd-spring" />
            <button class="nnd-btn" @click="stayHere">留在此页</button>
            <button class="nnd-btn nnd-primary" @click="openNow">立即打开</button>
          </footer>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* 遮罩层级：低于 MarkdownEditor 全屏编辑（3000）、高于 VitePress 导航与 MindMap 全屏（2100） */
.nnd-overlay {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nnd-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}

.nnd-panel {
  position: relative;
  width: min(460px, 92vw);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.nnd-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid var(--vp-c-divider);
}

.nnd-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.nnd-x {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  line-height: 1;
  color: var(--vp-c-text-3);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}

.nnd-x:hover:not(:disabled) {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
}

.nnd-x:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nnd-form {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0.8rem 1rem 0.2rem;
  overflow: auto;
}

.nnd-label {
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
  margin: 0.5rem 0 0.3rem;
}

/* 目录树（目录映射选择） */
.nnd-tree {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  max-height: 240px;
  overflow: auto;
  background: var(--vp-c-bg);
  padding: 4px 0;
}

.nnd-tree-loading {
  padding: 0.8rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
  text-align: center;
}

.nnd-dir-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--vp-c-text-1);
  cursor: pointer;
  user-select: none;
}

.nnd-dir-row:hover {
  background: var(--vp-c-bg-soft);
}

.nnd-dir-row.sel {
  background: color-mix(in srgb, var(--vp-c-brand-1) 12%, transparent);
  color: var(--vp-c-brand-1);
}

.nnd-caret {
  flex: none;
  width: 1em;
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
  transition: transform 0.15s;
  cursor: pointer;
}

.nnd-caret.open {
  transform: rotate(90deg);
}

.nnd-caret-leaf {
  cursor: default;
  text-align: center;
}

.nnd-dir-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nnd-check {
  flex: none;
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--vp-c-brand-1);
}

/* 文件名 / 模板 */
.nnd-input {
  width: 100%;
  box-sizing: border-box;
  font-size: 0.85rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.nnd-input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}

.nnd-hint {
  min-height: 1.2em;
  margin: 0.35rem 0 0;
  font-size: 0.74rem;
  color: var(--vp-c-text-3);
}

.nnd-hint.warn {
  color: var(--vp-c-warning-1);
}

.nnd-hint.ok {
  color: var(--vp-c-green-3);
}

.nnd-load-error {
  padding: 1rem;
  text-align: center;
  font-size: 0.82rem;
  color: var(--vp-c-danger-1);
}

.nnd-load-error .nnd-btn {
  margin-top: 0.6rem;
}

/* 底部按钮区 */
.nnd-foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1rem;
  border-top: 1px solid var(--vp-c-divider);
}

.nnd-spring {
  flex: 1;
}

.nnd-error {
  font-size: 0.78rem;
  color: var(--vp-c-danger-1);
}

.nnd-btn {
  flex: none;
  font-size: 0.78rem;
  line-height: 1;
  padding: 0.38rem 0.7rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  white-space: nowrap;
}

.nnd-btn:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.nnd-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nnd-primary {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}

.nnd-primary:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
  border-color: var(--vp-c-brand-2);
  color: #fff;
}

/* created 态 */
.nnd-created {
  padding: 1rem;
}

.nnd-created-title {
  margin: 0 0 0.4rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.nnd-created-path {
  margin: 0 0 0.6rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.78rem;
  color: var(--vp-c-brand-1);
  word-break: break-all;
}

.nnd-created-desc {
  margin: 0 0 0.8rem;
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.nnd-wait {
  font-size: 0.76rem;
  color: var(--vp-c-text-3);
}
</style>
