<script setup lang="ts">
/**
 * Markdown 全屏编辑视图（Monaco，VS Code 同源编辑器内核）
 *
 * 打开方式：EditThisPage「编辑此页」→ mdEditorStore.openMdEditor(path) →
 * 主题在 layout-bottom 插槽挂载本组件（全局单例，跨路由持久）。
 *
 * 数据流（依赖 md 读写 API 插件，仅 dev 可用）：
 *   打开 → GET  <apiBase>/md?path=            拉取原文 + mtime
 *   保存 → PUT  <apiBase>/md（带 baseMtime）  乐观锁写回；409 = 外部修改冲突
 *   冲突 → 「以编辑器内容覆盖」（盲写重 PUT）或「重新加载外部版本」（重新 GET）
 *
 * Monaco 按需加载（体积敏感，禁止全量）：
 *   - 只引 editor/editor.api（编辑器内核 + API）；0.56 的 package.json exports
 *     把子路径映射为 esm/vs/<subpath>.js，公开导入路径省去 esm/vs/ 层级；
 *   - markdown 语言：languages/definitions/markdown/register.js（0.56 起
 *     basic-languages 重构为 languages/definitions/<lang>/register.js）；
 *   - 精选 contrib features（复制粘贴/查找/折叠/多光标/右键菜单等编辑必需项），
 *     不引 editor.main.js（= 全部语言 + LSP client，数 MB）；
 *   - worker：editor/editor.worker.js?worker + self.MonacoEnvironment，
 *     仅客户端设置。
 *
 * SSR 安全（VitePress build 会 SSG 渲染全部页面，同 MindMap 骨架）：
 *   Monaco / worker / markdown-it 的 import 全部在 onMounted 内动态进行，
 *   SSR 渲染阶段只输出占位模板，build 无副作用。
 *
 * 保存策略说明：本组件为【手动保存】——只在 Cmd/Ctrl+S 或点「保存」时 PUT，
 * 不做防抖自动保存。与 MindMap 导图编辑的「data_change 后 3s 防抖自动保存」
 * 有意不同：笔记全文是长文本创作，半途的中间态落盘会污染 mtime 乐观锁基准并
 * 在外部编辑器端频繁触发同步；以显式保存为准，改动是否入库完全由用户掌控。
 *
 * 保存后页面联动：PUT 以 tmp+rename 落盘，dev 下触发 vault md 的 HMR，
 * 底层页面自动热更新；若 HMR 未生效，保存成功 toast 提供「刷新页面查看效果」
 * 手动兜底按钮。
 *
 * 分屏预览（客户端近似 + 白名单组件真实渲染）：
 *   - markdown-it 客户端实例 html:true，<MindMap /> / <PdfViewer /> 以原始
 *     标签进入预览 DOM，随后扫描挂载真实组件（createVNode + render，经
 *     vnode.appContext 继承宿主 provide，useData 才不会 throw）；
 *   - 每轮重建先 render(null) 卸载旧实例再替换 html，防抖连续输入不泄漏；
 *   - [[wikilink]] 双链等构建期特性仍显示为原文（需全库索引，客户端做不了）。
 */
import {
  createVNode,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  render as vueRender,
  watch,
  type AppContext,
  type Component,
} from "vue";
import { useData } from "vitepress";
import { closeMdEditor } from "./edit/mdEditorStore";
import { getLocalNotesThemeConfig, joinApi } from "../theme/config";
import MindMapComp from "./MindMap.vue";
// L3 迁移前的占位实现：预览白名单先接住 <PdfViewer /> 标签（渲染空占位），
// L3 换上真实 PdfViewer 后此处自动获得完整能力，无需再改本组件
import { PdfViewer as PdfViewerComp } from "./PdfViewer";

// ---- 预览白名单组件（真实渲染，其余 HTML 不实例化为组件） ----
// markdown 正文里的 <MindMap ... /> / <PdfViewer ... /> 经 html:true 进入预览
// DOM 后（未知标签名被 HTML 解析器小写化），在这里按标签名映射到组件对象。
const PREVIEW_COMPONENTS: Record<string, Component> = {
  mindmap: MindMapComp,
  pdfviewer: PdfViewerComp,
};
/** 提示文案里还原原始大写标签名 */
const COMPONENT_LABELS: Record<string, string> = {
  mindmap: "MindMap",
  pdfviewer: "PdfViewer",
};

const props = defineProps<{
  /** vault 相对路径（如 notes/xxx.md、README.md） */
  path: string;
}>();

const emit = defineEmits<{ close: [] }>();

const { isDark } = useData();

/** 站点资源配置（apiBase 由 localNotesTheme(options) 落入，默认 /api） */
const cfg = getLocalNotesThemeConfig();

// ---- 组件状态 ----
type State = "loading" | "ready" | "error";
const state = ref<State>("loading");
const loadError = ref("");
/** 有未保存改动（编辑器当前内容 !== 初始内容） */
const dirty = ref(false);
const saving = ref(false);
/** 最近一次保存成功时间 HH:MM */
const savedAt = ref("");
const saveError = ref("");
/** 409 冲突面板是否显示 */
const conflict = ref(false);
/** 保存成功 toast（含「刷新页面查看效果」兜底按钮） */
const savedToast = ref(false);

// ---- 非响应式运行时句柄 ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let monaco: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let editor: any = null;
let contentListener: { dispose: () => void } | null = null;
/** 乐观锁基准：打开文件时的 mtime / 上次成功保存后的新 mtime */
let baseMtime = 0;
/** dirty 比对基准（打开时原文 / 上次成功保存后的内容） */
let initialContent = "";
let previewTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let disposed = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let md: any = null; // markdown-it 实例（惰性创建）
const previewHtml = ref("");
/** 预览容器（扫描组件占位标签、挂载真实组件都发生在它的子树里） */
const previewRef = ref<HTMLDivElement | null>(null);
/** 预览内已挂载组件的挂载点（重建前逐一 render(null) 卸载，防幽灵实例） */
const mountedCompEls: HTMLDivElement[] = [];
/** 同一 tick 多次渲染只安排一次挂载扫描（扫描始终面向最新 DOM） */
let compMountScheduled = false;
/**
 * 宿主（VitePress app）上下文：手动挂载的组件经 vnode.appContext 继承
 * app 级 provide——MindMap/PdfViewer 的 useData() 依赖 dataSymbol 注入，
 * 缺失会在 setup 阶段直接 throw（vitepress useData 无兜底）。
 */
let hostAppContext: AppContext | null = getCurrentInstance()?.appContext ?? null;

const editorRef = ref<HTMLDivElement | null>(null);

// ---- 数据读写（md 读写 API） ----
async function fetchContent(): Promise<{ content: string; mtime: number }> {
  const res = await fetch(joinApi(cfg, `/md?path=${encodeURIComponent(props.path)}`));
  const j = (await res.json().catch(() => null)) as
    | { content?: string; mtime?: number; error?: string }
    | null;
  if (!res.ok) throw new Error(j?.error ?? `读取失败（HTTP ${res.status}）`);
  if (typeof j?.content !== "string" || typeof j.mtime !== "number") {
    throw new Error("响应格式异常（缺少 content/mtime）");
  }
  return { content: j.content, mtime: j.mtime };
}

// ---- Monaco 按需加载（仅编辑器内核 + markdown 语言 + 精选编辑 features） ----
async function loadMonaco(): Promise<void> {
  if (monaco) return;
  const [
    api,
    { default: EditorWorker },
    // 以下均为副作用 import：注册语言 / 编辑 features，无导出物
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _markdown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _coreCommands,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _clipboard,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _find,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _folding,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _bracketMatching,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _wordHighlighter,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _linesOperations,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _wordOperations,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _multicursor,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _contextmenu,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _smartSelect,
  ] = await Promise.all([
    // monaco 0.56 的 package.json exports 把 `<subpath>` 映射到 `esm/vs/<subpath>.js`，
    // 公开子路径不含 esm/vs/ 层级（写 esm/vs/... 反而解析失败）
    import("monaco-editor/editor/editor.api.js"),
    import("monaco-editor/editor/editor.worker.js?worker"),
    // markdown 语法高亮（Monarch tokenizer，懒加载）
    import("monaco-editor/languages/definitions/markdown/register.js"),
    // 编辑器基础命令（光标/选区/撤销重做的命令绑定）
    import("monaco-editor/editor/browser/coreCommands.js"),
    // 精选 contrib features：复制粘贴 / 查找替换 / 折叠 / 括号匹配 /
    // 同词高亮 / 行操作 / 词操作 / 多光标 / 右键菜单 / 扩展选区。
    // 刻意不引 editor.main.js（全量语言 + LSP）与 hover/suggest 等语言服务向 features
    import("monaco-editor/editor/contrib/clipboard/browser/clipboard.js"),
    import("monaco-editor/editor/contrib/find/browser/findController.js"),
    import("monaco-editor/editor/contrib/folding/browser/folding.js"),
    import("monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js"),
    import("monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter.js"),
    import("monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js"),
    import("monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js"),
    import("monaco-editor/editor/contrib/multicursor/browser/multicursor.js"),
    import("monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js"),
    import("monaco-editor/editor/contrib/smartSelect/browser/smartSelect.js"),
  ]);
  // worker 只在客户端创建（onMounted 内，SSR 不执行到这里）
  (self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
  };
  monaco = api;
}

// ---- 客户端 markdown-it 近似预览（新建独立实例） ----
async function loadMarkdownIt(): Promise<void> {
  if (md) return;
  const { default: MarkdownIt } = await import("markdown-it");
  // html:true → <MindMap /> / <PdfViewer /> 等标签原样进入预览 DOM，由下方
  // mountPreviewComps 扫描后挂载真实组件。XSS 取舍：预览是用户本人内容、
  // 本地单人工具，开放原样 HTML 的风险可接受；组件实例化只限上面两张白名单，
  // 其余 HTML 仅按浏览器原生行为展示、不会被实例化为组件。不开 linkify/breaks，
  // 保持与构建期管道可对齐的基础子集（标题/列表/表格/代码块/粗斜体/链接）。
  // [[wikilink]] 双链需要构建期全库索引，客户端刻意不装 → 预览仍显示为原文。
  md = new MarkdownIt({ html: true, linkify: false, breaks: false });
}

function renderPreview(src: string): void {
  if (!md) return;
  // 先卸载上一轮挂载的组件实例（此刻旧 DOM 还在，卸载时序可控），再整体
  // 替换预览 html，最后等 DOM 刷新后扫描挂载新一轮组件（见 scheduleCompMount）
  unmountPreviewComps();
  // 浏览器原生 HTML 解析不认非 void 元素的自闭合写法：<MindMap ... /> 会成为
  // 「永不闭合」的开放标签，把其后全部内容吞作子元素直到文档末尾（构建期站点
  // 无此问题，Vue 模板编译器认自闭合）。这里给白名单标签补显式闭合标签，
  // 其余 HTML 不做任何改写。
  previewHtml.value = md
    .render(src)
    .replace(/<(MindMap|PdfViewer)\b([^>]*)\/>/gi, "<$1$2></$1>");
  scheduleCompMount();
}

/** 300ms 防抖：Monaco 内容变化 → 右栏近似预览 */
function schedulePreview(): void {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    if (editor) renderPreview(editor.getValue());
  }, 300);
}

// ---- 预览内白名单组件真实渲染（挂载 / 卸载） ----
// 原理：md.render 后 <MindMap ... /> 以 HTMLUnknownElement（<mindmap>）形态
// 存在于预览 DOM，属性原样保留。扫描到占位标签后，解析 src/height/mode 等
// 属性为 props，createVNode(组件, props) + vueRender 挂载到等位挂载点上；
// 重建前 render(null) 卸载旧实例（触发 MindMap 自身的画布/监听器/定时器清理）。

/** 读取占位标签属性（兼容 Vue 绑定风格 :attr="..."，值一律按字符串取） */
function readPlaceholderAttr(el: Element, name: string): string | null {
  return el.getAttribute(name) ?? el.getAttribute(`:${name}`);
}

/** 同一 tick 内多次 renderPreview 只安排一次挂载扫描（nextTick = DOM 刷新后） */
function scheduleCompMount(): void {
  if (compMountScheduled) return;
  compMountScheduled = true;
  void nextTick(() => {
    compMountScheduled = false;
    if (disposed || state.value !== "ready") return;
    mountPreviewComps();
  });
}

/** 扫描预览 DOM 中的白名单组件标签，替换为挂载点并挂载真实组件实例 */
function mountPreviewComps(): void {
  const container = previewRef.value;
  if (!container) return;
  for (const ph of Array.from(container.querySelectorAll("mindmap, pdfviewer"))) {
    const kind = ph.tagName.toLowerCase();
    const label = COMPONENT_LABELS[kind] ?? kind;
    const mountEl = document.createElement("div");
    mountEl.className = "mde-comp-mount";
    // src 必填：缺失时不挂载组件，就地显示提示卡片（不崩预览）
    const src = readPlaceholderAttr(ph, "src");
    if (!src) {
      mountEl.classList.add("mde-comp-missing");
      mountEl.textContent = `⚠️ <${label}> 缺少必填的 src 属性，无法渲染`;
      ph.replaceWith(mountEl);
      continue;
    }
    const props: Record<string, unknown> = { src };
    const height = readPlaceholderAttr(ph, "height");
    if (height) props.height = height;
    if (kind === "mindmap") {
      const mode = readPlaceholderAttr(ph, "mode");
      if (mode === "read" || mode === "edit") props.mode = mode;
    } else {
      const title = readPlaceholderAttr(ph, "title");
      if (title) props.title = title;
      const page = Number(readPlaceholderAttr(ph, "page") ?? NaN);
      if (Number.isFinite(page) && page > 0) props.page = page;
      if (ph.hasAttribute("collapsed") || readPlaceholderAttr(ph, "collapsed") === "true") {
        props.collapsed = true;
      }
    }
    try {
      const vnode = createVNode(PREVIEW_COMPONENTS[kind], props);
      if (hostAppContext) vnode.appContext = hostAppContext;
      ph.replaceWith(mountEl);
      vueRender(vnode, mountEl);
      mountedCompEls.push(mountEl);
    } catch (e) {
      // 单个组件挂载失败不影响其余内容（如未来 vitepress 注入关系变化导致 useData 失败）
      mountEl.classList.add("mde-comp-missing");
      mountEl.textContent = `⚠️ <${label}> 预览渲染失败：${(e as Error)?.message ?? e}`;
      ph.replaceWith(mountEl);
    }
  }
}

/** 卸载全部已挂载的预览组件实例（render(null) 同步触发组件自身 onBeforeUnmount 清理） */
function unmountPreviewComps(): void {
  while (mountedCompEls.length > 0) {
    const el = mountedCompEls.pop() as HTMLDivElement;
    try {
      vueRender(null, el);
    } catch {
      /* 忽略卸载异常，避免阻塞整轮预览重建 */
    }
    el.remove();
  }
}

// ---- 初始化 ----
onMounted(async () => {
  window.addEventListener("keydown", onKeydown, true);
  window.addEventListener("beforeunload", onBeforeUnload);
  try {
    // 拉文件、加载 Monaco、加载 markdown-it 三路并行（Monaco 体积大，先给出加载态）
    const [{ content, mtime }] = await Promise.all([
      fetchContent(),
      loadMonaco(),
      loadMarkdownIt(),
    ]);
    if (disposed) return;
    initialContent = content;
    baseMtime = mtime;
    state.value = "ready";
    // 等容器以真实尺寸渲染后再建编辑器（Monaco 需非 0 尺寸）
    await new Promise((r) => requestAnimationFrame(r));
    if (disposed || !editorRef.value) return;
    createEditor(content);
    renderPreview(content);
  } catch (e) {
    if (disposed) return;
    state.value = "error";
    loadError.value = (e as Error)?.message ?? String(e);
  }
});

function createEditor(content: string): void {
  if (!monaco || !editorRef.value) return;
  editor = monaco.editor.create(editorRef.value, {
    value: content,
    language: "markdown",
    theme: isDark.value ? "vs-dark" : "vs",
    wordWrap: "on",
    minimap: { enabled: false },
    fontSize: 14,
    lineHeight: 22,
    automaticLayout: true, // 容器尺寸变化（窗口/分屏）自动 adaptiveLayout
    scrollBeyondLastLine: false,
    lineNumbers: "on",
    tabSize: 2,
    padding: { top: 12, bottom: 24 },
    renderWhitespace: "selection",
    // 中文笔记含大量全角标点，关闭「歧义字符」高亮避免整屏黄色虚框
    unicodeHighlight: { ambiguousCharacters: false },
    quickSuggestions: false,
  });
  // dirty 追踪：与初始内容比对（撤销回原文会自动恢复「无改动」）
  contentListener = editor.onDidChangeModelContent(() => {
    dirty.value = editor.getValue() !== initialContent;
    if (dirty.value) {
      saveError.value = "";
      savedToast.value = false;
    }
    schedulePreview();
  });
}

// 明暗主题跟随 VitePress 切换
watch(isDark, () => {
  monaco?.editor.setTheme(isDark.value ? "vs-dark" : "vs");
});

// ---- 保存（手动保存：Cmd/Ctrl+S 或工具栏按钮） ----
async function save(force = false): Promise<void> {
  if (!editor || saving.value) return;
  saving.value = true;
  const body: Record<string, unknown> = {
    path: props.path,
    content: editor.getValue(),
  };
  if (!force) body.baseMtime = baseMtime;
  try {
    const res = await fetch(joinApi(cfg, "/md"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      // 乐观锁冲突：文件已被外部工具修改，弹冲突面板，dirty 保持
      conflict.value = true;
      return;
    }
    const j = (await res.json().catch(() => null)) as { mtime?: number; error?: string } | null;
    if (!res.ok) {
      // 404 / 400 等：提示错误、保持 dirty 等待重试
      saveError.value = j?.error ?? `保存失败（HTTP ${res.status}）`;
      return;
    }
    baseMtime = typeof j?.mtime === "number" ? j.mtime : Date.now();
    initialContent = editor.getValue();
    dirty.value = false;
    saveError.value = "";
    const now = new Date();
    savedAt.value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    showToast();
  } catch (e) {
    saveError.value = (e as Error)?.message || "保存失败（网络异常）";
  } finally {
    saving.value = false;
  }
}

function showToast(): void {
  savedToast.value = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastTimer = null;
    savedToast.value = false;
  }, 8000);
}

/** 保存成功 toast 的手动兜底：HMR 万一未刷新底层页面时使用 */
function reloadPage(): void {
  window.location.reload();
}

// ---- 冲突处理（409） ----
/** 以编辑器内容覆盖外部版本（不带 baseMtime 盲写） */
async function overwriteExternal(): Promise<void> {
  conflict.value = false;
  await save(true);
}

/** 重新加载外部版本：丢弃编辑器改动，重新 GET（二次确认） */
async function reloadExternal(): Promise<void> {
  const ok = window.confirm(
    "确定放弃编辑器中的全部改动、重新加载磁盘上的外部版本吗？",
  );
  if (!ok) return;
  conflict.value = false;
  try {
    const { content, mtime } = await fetchContent();
    initialContent = content;
    baseMtime = mtime;
    editor?.setValue(content);
    renderPreview(content);
    dirty.value = false;
    saveError.value = "";
  } catch (e) {
    saveError.value = `重新加载失败：${(e as Error)?.message ?? e}`;
  }
}

// ---- 关闭（有未保存改动时确认；Esc 同效） ----
function requestClose(): void {
  if (dirty.value) {
    const ok = window.confirm("当前有未保存的改动，确定关闭吗？（改动将丢失）");
    if (!ok) return;
  }
  closeEditor();
}

function closeEditor(): void {
  emit("close");
  closeMdEditor();
}

// ---- 键盘（capture 阶段，先于 Monaco 内部处理，且不与 VitePress 快捷键冲突） ----
function onKeydown(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    e.stopPropagation();
    void save(false);
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    requestClose();
  }
}

function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (dirty.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}

// ---- 清理 ----
onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener("keydown", onKeydown, true);
  window.removeEventListener("beforeunload", onBeforeUnload);
  if (previewTimer) clearTimeout(previewTimer);
  if (toastTimer) clearTimeout(toastTimer);
  compMountScheduled = false; // 已排队的挂载扫描由 disposed 标志拦截
  unmountPreviewComps();
  contentListener?.dispose();
  contentListener = null;
  if (editor) {
    try {
      editor.getModel()?.dispose();
      editor.dispose();
    } catch {
      /* 忽略销毁异常 */
    }
    editor = null;
  }
});
</script>

<template>
  <div class="mde-overlay" role="dialog" aria-modal="true" :aria-label="`编辑 ${path}`">
    <!-- 顶部工具栏 -->
    <div class="mde-toolbar">
      <span class="mde-crumb" :title="path">
        <span class="mde-crumb-icon">✎</span>
        <span class="mde-crumb-path">{{ path }}</span>
      </span>
      <span class="mde-status" :class="{ error: saveError }" :title="saveError || ''">
        <span class="mde-dot" :class="{ dirty: dirty, error: saveError, saving: saving }" />
        <template v-if="saving">保存中…</template>
        <template v-else-if="saveError">保存失败</template>
        <template v-else-if="dirty">未保存</template>
        <template v-else-if="savedAt">已保存 {{ savedAt }}</template>
        <template v-else>已加载</template>
      </span>
      <span class="mde-spring" />
      <button class="mde-btn mde-primary" :disabled="saving || state !== 'ready'" @click="save(false)">
        保存<span class="mde-kbd">⌘/Ctrl+S</span>
      </button>
      <button class="mde-btn" @click="requestClose">关闭</button>
    </div>

    <!-- 左编辑器 / 右预览 分屏（第一版固定 50/50） -->
    <div class="mde-body">
      <div ref="editorRef" class="mde-editor" />
      <div class="mde-divider" aria-hidden="true" />
      <div class="mde-preview-wrap">
        <div ref="previewRef" class="mde-preview vp-doc" v-html="previewHtml" />
        <span class="mde-preview-note">
          组件（MindMap / PdfViewer）已实时渲染；[[wikilink]] 双链等构建期特性仍显示为原文（需构建期全库索引），保存后刷新页面才是真实效果
        </span>
      </div>
    </div>

    <!-- 加载 / 错误态 -->
    <div v-if="state === 'loading'" class="mde-placeholder">
      <p class="mde-placeholder-title">正在加载编辑器…</p>
      <p class="mde-placeholder-hint">Monaco 体积较大，首次加载需要数秒</p>
    </div>
    <div v-else-if="state === 'error'" class="mde-placeholder">
      <p class="mde-placeholder-title">无法打开编辑器</p>
      <p class="mde-placeholder-hint">{{ loadError }}</p>
      <button class="mde-btn" @click="requestClose">关闭</button>
    </div>

    <!-- 409 冲突面板 -->
    <div v-if="conflict" class="mde-conflict-backdrop">
      <div class="mde-conflict" role="alertdialog" aria-label="保存冲突">
        <p class="mde-conflict-title">⚠️ 文件已被外部修改</p>
        <p class="mde-conflict-desc">
          磁盘上的 <code>{{ path }}</code> 在你打开之后被其他工具改过，为避免覆盖他人改动，本次保存被拒绝（409）。
        </p>
        <div class="mde-conflict-actions">
          <button class="mde-btn mde-danger" :disabled="saving" @click="overwriteExternal">
            以编辑器内容覆盖
          </button>
          <button class="mde-btn" :disabled="saving" @click="reloadExternal">
            重新加载外部版本
          </button>
          <button class="mde-btn" @click="conflict = false">暂不处理</button>
        </div>
        <p class="mde-conflict-hint">
          「覆盖」将丢弃磁盘上的外部改动；「重新加载」将丢弃编辑器中的未保存改动。
        </p>
      </div>
    </div>

    <!-- 保存成功 toast（含 HMR 失效时的手动刷新兜底） -->
    <Transition name="mde-fade">
      <div v-if="savedToast" class="mde-toast">
        <span>✅ 已保存 {{ savedAt }}</span>
        <button class="mde-btn" @click="reloadPage">刷新页面查看效果</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 全屏 overlay：z-index 3000 高于 VitePress 导航（var(--vp-nav-height) 层级）
   与 MindMap 全屏（2100） */
.mde-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

/* ---- 工具栏 ---- */
.mde-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.9rem;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-elv);
}

.mde-crumb {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  font-size: 0.82rem;
  color: var(--vp-c-text-1);
}

.mde-crumb-icon {
  flex: none;
  color: var(--vp-c-brand-1);
}

.mde-crumb-path {
  font-family: var(--vp-font-family-mono);
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mde-status {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  white-space: nowrap;
}

.mde-status.error {
  color: var(--vp-c-danger-1);
}

.mde-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--vp-c-green-3);
  flex: none;
}

.mde-dot.dirty {
  background: var(--vp-c-yellow-3);
}

.mde-dot.error {
  background: var(--vp-c-danger-1);
}

.mde-dot.saving {
  animation: mde-pulse 1s ease-in-out infinite;
}

@keyframes mde-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.mde-spring {
  flex: 1;
}

.mde-btn {
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

.mde-btn:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.mde-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mde-btn-primary {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}

.mde-btn-primary:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
  color: #fff;
}

.mde-btn-danger {
  background: var(--vp-c-danger-1);
  border-color: var(--vp-c-danger-1);
  color: #fff;
}

.mde-btn-danger:hover:not(:disabled) {
  background: var(--vp-c-danger-2);
  color: #fff;
}

.mde-kbd {
  margin-left: 0.4rem;
  font-size: 0.68rem;
  opacity: 0.75;
}

/* ---- 分屏 ---- */
.mde-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.mde-editor {
  flex: 1 1 50%;
  min-width: 0;
}

.mde-divider {
  flex: none;
  width: 1px;
  background: var(--vp-c-divider);
}

.mde-preview-wrap {
  flex: 1 1 50%;
  min-width: 0;
  position: relative;
  display: flex;
  background: var(--vp-c-bg);
}

/* 复用 VitePress .vp-doc 全局排版（该类样式作用于本容器内部，不影响全站） */
.mde-preview {
  flex: 1;
  overflow: auto;
  padding: 16px 28px 96px;
}

.mde-preview :deep(h1) {
  margin-top: 0.4rem;
}

/* 预览局限提示（角落小字） */
.mde-preview-note {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 5;
  max-width: min(88%, 460px);
  font-size: 0.72rem;
  line-height: 1.5;
  color: var(--vp-c-text-3);
  background: color-mix(in srgb, var(--vp-c-bg-elv) 88%, transparent);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 4px 10px;
  pointer-events: none;
  backdrop-filter: blur(6px);
}

/* 预览内挂载的组件挂载点：占位 div 为流式块级，宽随容器；
   组件自身的边框/外距/高度由 MindMap / PdfViewer 的 scoped 样式负责 */
.mde-preview :deep(.mde-comp-mount) {
  width: 100%;
}

/* 组件标签缺 src 或挂载异常时的就地提示卡片（DOM 手工创建、无 scope id，用 :deep 命中） */
.mde-preview :deep(.mde-comp-missing) {
  margin: 0.75rem 0;
  padding: 0.75rem 1rem;
  border: 1px dashed var(--vp-c-warning-1);
  border-radius: 8px;
  font-size: 0.82rem;
  color: var(--vp-c-warning-1);
  background: color-mix(in srgb, var(--vp-c-warning-1) 8%, transparent);
}

/* ---- 加载 / 错误占位 ---- */
.mde-placeholder {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  text-align: center;
  background: var(--vp-c-bg-soft);
}

.mde-placeholder-title {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.mde-placeholder-hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--vp-c-text-3);
}

/* ---- 冲突面板 ---- */
.mde-conflict-backdrop {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.mde-conflict {
  width: min(540px, 92vw);
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-warning-1);
  border-radius: 12px;
  padding: 1.1rem 1.3rem;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
}

.mde-conflict-title {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.mde-conflict-desc {
  margin: 0 0 0.9rem;
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.mde-conflict-desc code {
  font-size: 0.76rem;
}

.mde-conflict-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.mde-conflict-hint {
  margin: 0.8rem 0 0;
  font-size: 0.74rem;
  color: var(--vp-c-text-3);
}

/* ---- 保存成功 toast ---- */
.mde-toast {
  position: absolute;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 25;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.55rem 0.9rem;
  font-size: 0.82rem;
  color: var(--vp-c-text-1);
  background: color-mix(in srgb, var(--vp-c-bg-elv) 92%, transparent);
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(8px);
}

.mde-fade-enter-active,
.mde-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.mde-fade-enter-from,
.mde-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
