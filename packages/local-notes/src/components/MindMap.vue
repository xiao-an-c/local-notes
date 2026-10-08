<script setup lang="ts">
/**
 * 内嵌思维导图组件（基于 wanglin2/mind-map，npm 包 simple-mind-map，MIT）
 *
 * 用法（主题入口已全局注册，markdown 正文直接写；亦可单独 import 使用）：
 *   <MindMap src="/vault/notes/公司分析框架.mindmap.json" />
 *   <MindMap src="/vault/xx.mindmap.json" height="560px" mode="edit" />
 * （src 前缀由主题配置 assetPrefix 决定，默认 /vault/，需与插件组配置一致）
 *
 * 模式：
 * - 阅读模式（默认）：可滚轮缩放 / 拖拽平移，readonly 配置让双击节点不进入文字编辑；
 * - 编辑模式：mode="edit" 且 dev 保存服务（<apiBase>/mindmap/ping）可用时进入，
 *   支持 Tab 加子节点 / Enter 加兄弟节点 / 双击改文字（RichText）/ 删除节点 /
 *   撤销重做（Ctrl+Z、Ctrl+Y 与工具栏按钮），Cmd/Ctrl+S 手动保存，
 *   data_change 后 3s 防抖自动保存，PUT <apiBase>/mindmap 落盘到 vault 本地文件。
 *
 * SSR 安全：VitePress build 会 SSR 渲染所有 md 页面，而 simple-mind-map 依赖 DOM，
 * 因此库与全部插件都在 onMounted 内动态 import，模板只留占位容器
 * （同 Graph 组件对 force-graph 的处理）。
 *
 * 降级：build/preview 产物没有 <apiBase>/mindmap/* 路由，ping 探测失败 →
 * 不显示任何编辑入口，组件纯阅读；src 404 → 空态卡片 + 「创建导图」（ping 可用时）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useData } from "vitepress";
import {
  getLocalNotesThemeConfig,
  joinApi,
  normalizeAssetPrefix,
  stripAssetPrefix,
} from "../theme/config";
// quill 基础样式（官方产物）：ESM 方式 import("simple-mind-map") 只带 JS 不带样式，
// UMD 构建内联的 quill.snow.css（.ql-editor p 等 { margin:0; padding:0 }、编辑态
// pre-wrap/光标规则）在 ESM 下缺失，必须显式引入，否则节点文字错位/被截断。
// 插件运行时 appendCss 注入的 .ql-editor{padding:0;line-height:1.2;height:auto}
// 晚于打包 CSS 入 head，同特异性后者胜，snow 主题的 padding/边框副作用已被覆盖。
import "simple-mind-map/dist/simpleMindMap.esm.css";

const props = withDefaults(
  defineProps<{
    /** vault 资源 URL，如 <assetPrefix>notes/xx.mindmap.json（必填） */
    src: string;
    /** 容器高度 */
    height?: string;
    /** 初始模式：read 阅读 / edit 编辑（编辑还需 ping 探测通过） */
    mode?: "read" | "edit";
  }>(),
  { height: "420px", mode: "read" },
);

const { isDark } = useData();

/** 站点资源配置（assetPrefix / apiBase 由 localNotesTheme(options) 落入，默认 /vault/、/api） */
const cfg = getLocalNotesThemeConfig();
const assetPrefix = normalizeAssetPrefix(cfg.assetPrefix);

// ---- 组件状态 ----
type State = "loading" | "ready" | "missing" | "error";
const state = ref<State>("loading");
const errorMsg = ref("");
/** dev 保存服务是否可用（GET <apiBase>/mindmap/ping 探测） */
const pingOk = ref(false);
/** 当前是否处于编辑态 */
const editing = ref(false);
/** 有未保存改动 */
const dirty = ref(false);
/** 最近一次保存成功时间 HH:MM */
const savedAt = ref("");
const saveError = ref("");
const saving = ref(false);
const exporting = ref(false);
const creating = ref(false);
const isFullscreen = ref(false);
/** 画布实例是否就绪（mm 本身保持非响应式，模板用这个驱动渲染） */
const instanceReady = ref(false);

const wrapRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLDivElement | null>(null);

// ---- 库实例与运行时句柄（非响应式） ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let MindMapCtor: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mm: any = null;
let resizeObserver: ResizeObserver | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** 吞掉「进入编辑态」时库内 originAddHistory 触发的第一次 data_change，避免假 dirty */
let suppressDirtyOnce = false;
/** data_change 监听器引用（mm.on/off 需要同一函数） */
let dataChangeHandler: (() => void) | null = null;
let saveInFlight = false;
let saveQueued = false;
let bodyOverflowBackup = "";
let disposed = false;
/** MindMap 插件表挂在类（全局）上，只需注册一次 */
let pluginsRegistered = false;

async function loadLib(): Promise<void> {
  if (MindMapCtor) return;
  const [
    { default: MindMap },
    { default: RichText },
    { default: Select },
    { default: Drag },
    { default: Export },
    { default: KeyboardNavigation },
    { default: MiniMap },
  ] = await Promise.all([
    import("simple-mind-map"),
    import("simple-mind-map/src/plugins/RichText"),
    import("simple-mind-map/src/plugins/Select"),
    import("simple-mind-map/src/plugins/Drag"),
    import("simple-mind-map/src/plugins/Export"),
    import("simple-mind-map/src/plugins/KeyboardNavigation"),
    import("simple-mind-map/src/plugins/MiniMap"),
  ]);
  // 插件注册写法照官方文档：从包内对应路径 import 后 MindMap.usePlugin(...)
  if (!pluginsRegistered) {
    MindMap.usePlugin(RichText); // 富文本节点编辑
    MindMap.usePlugin(Select); // Ctrl 多选
    MindMap.usePlugin(Drag); // 拖拽节点调整层级
    MindMap.usePlugin(Export); // 导出 PNG/SVG（浏览器端下载）
    MindMap.usePlugin(KeyboardNavigation); // 方向键节点导航
    MindMap.usePlugin(MiniMap); // 小地图 API
    pluginsRegistered = true;
  }
  MindMapCtor = MindMap;
}

// ---- 路径工具 ----
const fileName = computed(() => {
  try {
    return decodeURIComponent(props.src.split("/").pop() ?? props.src);
  } catch {
    return props.src;
  }
});
const exportName = computed(() => fileName.value.replace(/\.mindmap\.json$/i, ""));
/** PUT <apiBase>/mindmap 的 path：去掉资源前缀并 decodeURIComponent */
const vaultPath = computed(() => stripAssetPrefix(cfg, props.src));

async function probePing(): Promise<boolean> {
  try {
    const res = await fetch(joinApi(cfg, "/mindmap/ping"));
    return res.ok;
  } catch {
    return false;
  }
}

// ---- 初始化 / 加载 ----
onMounted(async () => {
  if (!props.src.startsWith(assetPrefix)) {
    state.value = "error";
    errorMsg.value = `src 必须是以 ${assetPrefix} 开头的站点绝对路径（主题配置 assetPrefix）`;
    return;
  }
  window.addEventListener("keydown", onKeydown);
  try {
    await loadLib();
  } catch (e) {
    state.value = "error";
    errorMsg.value = `思维导图库加载失败：${(e as Error)?.message ?? e}`;
    return;
  }
  pingOk.value = await probePing();
  if (disposed) return;
  await load({ wantEdit: props.mode === "edit" && pingOk.value });
});

async function load(opts?: { wantEdit?: boolean }): Promise<void> {
  state.value = "loading";
  errorMsg.value = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try {
    // 防缓存：dev 下文件被 PUT 更新后需要拿到最新内容
    const res = await fetch(props.src + "?t=" + Date.now());
    if (res.status === 404 || res.status === 410) {
      state.value = "missing";
      return;
    }
    if (!res.ok) {
      state.value = "error";
      errorMsg.value = `读取导图文件失败（HTTP ${res.status}）`;
      return;
    }
    // 文件不存在时 VitePress 会以 SPA fallback 返回 200 的 HTML 页面（dev 与
    // preview 产物皆如此），无法只靠状态码判断——非 JSON 响应一律视为不存在
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("json")) {
      state.value = "missing";
      return;
    }
    data = await res.json();
  } catch (e) {
    state.value = "error";
    errorMsg.value = `读取导图文件失败：${(e as Error)?.message ?? e}`;
    return;
  }
  if (disposed) return;
  // 先切到 ready 让画布容器真实渲染（MindMap 构造要求 el 有非 0 宽高）
  state.value = "ready";
  await nextTick();
  initInstance(data, opts?.wantEdit ?? false);
}

function initInstance(data: unknown, enterEdit: boolean): void {
  const el = canvasRef.value;
  if (!el || !MindMapCtor) return;
  destroyInstance();
  try {
    // 兼容两种文件形态：完整数据 {root,layout,theme,view} 与纯节点树
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const full = data && typeof data === "object" && (data as any).root ? (data as any) : null;
    mm = new MindMapCtor({
      el,
      data: full ? full.root : data,
      // readonly=true 时库原生阻止双击进入文字编辑（节点 dblclick 直接 return），
      // 但画布滚轮缩放 / 拖拽平移不受影响，正合阅读模式需求
      readonly: !enterEdit,
      // 滚轮缩放（默认是上下平移）
      mousewheelAction: "zoom",
      // 首次渲染自适应画布，完整图可见
      fit: true,
    });
    if (full) mm.setFullData(full); // 还原布局 / 主题 / 视图（含缩放平移）
    instanceReady.value = true;
    applyThemeConfig();
    editing.value = enterEdit;
    dirty.value = false;
    saveError.value = "";
    savedAt.value = "";
    if (enterEdit) attachDataChange();
    // 容器尺寸变化（含全屏切换）→ resize 画布，避免变形/裁切
    resizeObserver = new ResizeObserver(onContainerResize);
    resizeObserver.observe(el);
    // 库构造期的异步 fit 在「构造后立刻 setFullData + 重设主题」的时序下会
    // 基于过期几何算出错误视图变换（画布内容被平移出视野，实测必现）。
    // 文件里没有保存视图数据时，下一帧复位视图并重新 fit，保证初始整图可见；
    // 有保存视图的导图则尊重文件里的缩放平移，不做复位。
    if (!full?.view) {
      requestAnimationFrame(() => {
        if (disposed || !mm) return;
        try {
          mm.view.reset();
          mm.view.fit();
        } catch {
          /* 忽略视图复位的极端时序异常 */
        }
      });
    }
  } catch (e) {
    state.value = "error";
    errorMsg.value = `导图初始化失败：${(e as Error)?.message ?? e}`;
  }
}

/**
 * 明暗主题下画布底色与节点文字色跟随 VitePress：
 * 库默认主题的底层节点是透明底+深灰字（#6a6d6c），暗底上不可读，
 * 因此暗色下浅色化文字与二级节点底色；浅色模式恢复库默认。
 * 与文件里已保存的自定义主题配置（theme.config）合并而不是整体覆盖。
 */
function applyThemeConfig(): void {
  if (!mm) return;
  let base: Record<string, unknown> = {};
  try {
    base = mm.getCustomThemeConfig() ?? {};
  } catch {
    base = {};
  }
  const modeStyle = isDark.value
    ? {
        backgroundColor: "#1b1b1f",
        second: { fillColor: "#2d2d30", color: "#d6d6da" },
        node: { fillColor: "transparent", color: "#c6c6cb" },
      }
    : {
        backgroundColor: "#fafafa",
        second: { fillColor: "#ffffff", color: "#565656" },
        node: { fillColor: "transparent", color: "#6a6d6c" },
      };
  mm.setThemeConfig({ ...base, ...modeStyle });
}

watch(isDark, () => applyThemeConfig());

// src 变化（组件被复用时）：重置状态重新加载
watch(
  () => props.src,
  () => {
    if (disposed) return;
    exitFullscreen();
    destroyInstance();
    state.value = "loading";
    void (async () => {
      pingOk.value = await probePing();
      await load({ wantEdit: props.mode === "edit" && pingOk.value });
    })();
  },
);

// mode 变化：ping 可用时跟随切换
watch(
  () => props.mode,
  (m) => {
    if (!mm || !pingOk.value) return;
    if (m === "edit" && !editing.value) startEdit();
    else if (m === "read" && editing.value) void stopEdit();
  },
);

// ---- 编辑态切换 ----
function startEdit(): void {
  if (!mm || !pingOk.value) return;
  suppressDirtyOnce = true;
  // 必须先注册监听再 setMode：库在历史栈为空时 setMode("edit") 会同步
  // originAddHistory 并 emit data_change，注册晚了这次事件无人接收，
  // suppressDirtyOnce 会残留并吞掉用户进入编辑态后的第一条真实改动
  attachDataChange();
  mm.setMode("edit");
  // setMode 同步返回后复位检查：未消费说明本次 setMode 没触发 data_change
  // （如历史栈非空的再次进入编辑），不能让标志残留吞掉下一条真实改动
  if (suppressDirtyOnce) suppressDirtyOnce = false;
  editing.value = true;
}

async function stopEdit(): Promise<void> {
  if (!mm) return;
  clearSaveTimer();
  // 退出编辑前把未保存改动落盘
  if (dirty.value) await saveNow();
  mm.setMode("readonly");
  editing.value = false;
  detachDataChange();
}

// ---- 保存（PUT <apiBase>/mindmap，dev 中间件原子写入 vault 文件） ----
function attachDataChange(): void {
  if (!mm || dataChangeHandler) return;
  dataChangeHandler = () => {
    if (suppressDirtyOnce) {
      suppressDirtyOnce = false;
      return;
    }
    dirty.value = true;
    saveError.value = "";
    scheduleSave();
  };
  mm.on("data_change", dataChangeHandler);
}

function detachDataChange(): void {
  if (mm && dataChangeHandler) {
    mm.off("data_change", dataChangeHandler);
    dataChangeHandler = null;
  }
}

function clearSaveTimer(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

function scheduleSave(): void {
  clearSaveTimer();
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveNow();
  }, 3000);
}

async function saveNow(): Promise<void> {
  if (!mm || !pingOk.value) return;
  if (saveInFlight) {
    saveQueued = true; // 在途时来了新改动：完成后补一次
    return;
  }
  saveInFlight = true;
  saving.value = true;
  // getData(true) = 完整数据 {root, layout, theme:{template,config}, view}，往返无损
  const body = JSON.stringify({ path: vaultPath.value, data: mm.getData(true) });
  try {
    const res = await fetch(joinApi(cfg, "/mindmap"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new Error((j as { error?: string })?.error ?? `HTTP ${res.status}`);
    }
    dirty.value = false;
    saveError.value = "";
    const now = new Date();
    savedAt.value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  } catch (e) {
    saveError.value = (e as Error)?.message || "保存失败";
    // dirty 保持 true，等下一次改动/手动保存重试
  } finally {
    saveInFlight = false;
    saving.value = false;
    if (saveQueued) {
      saveQueued = false;
      if (dirty.value) scheduleSave();
    }
  }
}

// ---- 创建（src 404 时空态卡片 → PUT 默认结构 → 进入编辑） ----
async function createMindmap(): Promise<void> {
  if (!pingOk.value || creating.value) return;
  creating.value = true;
  const def = {
    root: { data: { text: exportName.value }, children: [] },
    theme: { template: "default" },
    layout: "logicalStructure",
  };
  try {
    const res = await fetch(joinApi(cfg, "/mindmap"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: vaultPath.value, data: def }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new Error((j as { error?: string })?.error ?? `HTTP ${res.status}`);
    }
  } catch (e) {
    state.value = "error";
    errorMsg.value = `创建导图失败：${(e as Error)?.message ?? e}`;
    creating.value = false;
    return;
  }
  creating.value = false;
  state.value = "ready";
  await nextTick();
  initInstance(def, true);
}

// ---- 工具栏动作 ----
function undo(): void {
  mm?.execCommand("BACK");
}
function redo(): void {
  mm?.execCommand("FORWARD");
}

async function doExport(type: "png" | "svg"): Promise<void> {
  if (!mm || exporting.value) return;
  exporting.value = true;
  try {
    // Export 插件：浏览器端生成并触发下载，不落盘
    await mm.export(type, true, exportName.value);
  } catch {
    /* 库内部已走 errorHandler，这里兜底避免未捕获拒绝 */
  } finally {
    exporting.value = false;
  }
}

// ---- 全屏（组件容器 fixed 覆盖视口，Esc 退出；尺寸变化由 ResizeObserver 驱动 resize） ----
function toggleFullscreen(): void {
  isFullscreen.value ? exitFullscreen() : enterFullscreen();
}

function enterFullscreen(): void {
  if (isFullscreen.value || !wrapRef.value) return;
  isFullscreen.value = true;
  bodyOverflowBackup = document.body.style.overflow;
  document.body.style.overflow = "hidden"; // 锁住底层页面滚动
}

function exitFullscreen(): void {
  if (!isFullscreen.value) return;
  isFullscreen.value = false;
  document.body.style.overflow = bodyOverflowBackup;
}

function onContainerResize(): void {
  if (!mm || !canvasRef.value) return;
  if (canvasRef.value.clientWidth <= 0 || canvasRef.value.clientHeight <= 0) return;
  try {
    mm.resize();
  } catch {
    /* 极端时序下容器尺寸为 0，库会抛错，忽略即可 */
  }
}

// ---- 键盘：Esc 退全屏；Cmd/Ctrl+S 手动保存 ----
function onKeydown(e: KeyboardEvent): void {
  if (isFullscreen.value && e.key === "Escape") {
    exitFullscreen();
    return;
  }
  if (
    editing.value &&
    (e.metaKey || e.ctrlKey) &&
    !e.altKey &&
    (e.key === "s" || e.key === "S")
  ) {
    e.preventDefault();
    e.stopPropagation();
    clearSaveTimer();
    void saveNow();
  }
}

// ---- 清理 ----
function destroyInstance(): void {
  detachDataChange();
  clearSaveTimer();
  instanceReady.value = false;
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (mm) {
    try {
      mm.destroy();
    } catch {
      /* 忽略销毁异常 */
    }
    mm = null;
  }
}

onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener("keydown", onKeydown);
  if (isFullscreen.value) document.body.style.overflow = bodyOverflowBackup;
  destroyInstance();
});

const wrapStyle = computed(() => (isFullscreen.value ? {} : { height: props.height }));
</script>

<template>
  <div ref="wrapRef" class="mindmap-wrap" :class="{ fullscreen: isFullscreen }" :style="wrapStyle">
    <!-- 浮动工具栏 -->
    <div v-if="state !== 'loading'" class="mindmap-toolbar">
      <span
        v-if="editing"
        class="mm-status"
        :class="{ error: saveError }"
        :title="saveError ? `保存失败：${saveError}` : ''"
      >
        <span class="mm-dot" :class="{ dirty: dirty, error: saveError }" />
        <template v-if="saveError">保存失败</template>
        <template v-else-if="dirty">未保存</template>
        <template v-else-if="savedAt">已保存 {{ savedAt }}</template>
        <template v-else>编辑中</template>
      </span>
      <button
        v-if="pingOk && state === 'ready'"
        class="mm-btn mm-btn-primary"
        @click="editing ? stopEdit() : startEdit()"
      >
        {{ editing ? "完成编辑" : "编辑" }}
      </button>
      <template v-if="state === 'ready' && instanceReady">
        <button v-if="editing" class="mm-btn" title="撤销（Ctrl+Z）" @click="undo">撤销</button>
        <button v-if="editing" class="mm-btn" title="重做（Ctrl+Y）" @click="redo">重做</button>
        <button class="mm-btn" :disabled="exporting" title="导出 PNG 图片到本地下载" @click="doExport('png')">
          导出 PNG
        </button>
        <button class="mm-btn" :disabled="exporting" title="导出 SVG 矢量图到本地下载" @click="doExport('svg')">
          导出 SVG
        </button>
        <button class="mm-btn" @click="toggleFullscreen">{{ isFullscreen ? "退出全屏" : "全屏" }}</button>
      </template>
    </div>

    <!-- 加载 / 空态 / 错误 -->
    <div v-if="state === 'loading'" class="mindmap-placeholder"><span>加载中…</span></div>
    <div v-else-if="state === 'missing'" class="mindmap-placeholder">
      <p class="mm-title">该导图文件还不存在</p>
      <p class="mm-path">{{ fileName }}</p>
      <button v-if="pingOk" class="mm-btn mm-btn-primary" :disabled="creating" @click="createMindmap">
        {{ creating ? "创建中…" : "创建导图" }}
      </button>
      <p v-else class="mm-hint">当前页面为静态构建产物，未检测到本地保存服务，暂不支持创建与编辑</p>
    </div>
    <div v-else-if="state === 'error'" class="mindmap-placeholder">
      <p class="mm-title">导图加载失败</p>
      <p class="mm-hint">{{ errorMsg }}</p>
    </div>

    <!-- 画布容器（MindMap 构造时要求真实尺寸，用 v-show 而非 v-if） -->
    <div v-show="state === 'ready'" ref="canvasRef" class="mindmap-canvas" />
  </div>
</template>

<style scoped>
.mindmap-wrap {
  position: relative;
  margin: 0.75rem 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  overflow: hidden;
}

/* 全屏：fixed 覆盖整个视口，z-index 高于 VitePress 导航/侧栏/背板 */
.mindmap-wrap.fullscreen {
  position: fixed;
  inset: 0;
  z-index: 2100;
  margin: 0;
  border: none;
  border-radius: 0;
}

.mindmap-canvas {
  position: absolute;
  inset: 0;
  cursor: grab;
}

.mindmap-canvas:active {
  cursor: grabbing;
}

/* ---- 节点文字样式隔离（配合顶部引入的官方 simpleMindMap.esm.css） ----
 * 库在脱离上下文的环境按内联 line-height:1.2 测量节点文字宽高（nodeCreateContents.js），
 * 渲染时必须与测量一致，否则文字被推出 foreignObject（错位）或超高被裁（截断）。
 * 这里用高特异性规则挡住三路泄入：浏览器默认 <p> margin、VitePress 正文样式
 * （.vp-doc p 的 margin:16px/line-height:28px、全局 img{max-width:100%;display:block}）、
 * 以及 ESM 下缺失的 quill 基础样式（静态文字节点没有 .ql-editor 祖先，官方 CSS 的
 * .ql-editor p 规则够不到它，需在此兜底）。 */
.mindmap-wrap :deep(.smm-richtext-node-wrap) {
  margin: 0;
  padding: 0;
  line-height: 1.2;
  white-space: normal;
  word-break: break-all;
}

.mindmap-wrap :deep(.smm-richtext-node-wrap p),
.mindmap-wrap :deep(.smm-richtext-node-wrap div),
.mindmap-wrap :deep(.smm-richtext-node-wrap span),
.mindmap-wrap :deep(.smm-richtext-node-wrap ul),
.mindmap-wrap :deep(.smm-richtext-node-wrap ol),
.mindmap-wrap :deep(.smm-richtext-node-wrap li),
.mindmap-wrap :deep(.smm-richtext-node-wrap h1),
.mindmap-wrap :deep(.smm-richtext-node-wrap h2),
.mindmap-wrap :deep(.smm-richtext-node-wrap h3),
.mindmap-wrap :deep(.smm-richtext-node-wrap h4),
.mindmap-wrap :deep(.smm-richtext-node-wrap h5),
.mindmap-wrap :deep(.smm-richtext-node-wrap h6) {
  margin: 0;
  padding: 0;
  line-height: 1.2;
  white-space: normal;
  word-break: break-all;
}

/* 节点内图片：不被全局 img{max-width:100%;height:auto} 压扁/拉伸 */
.mindmap-wrap :deep(.smm-richtext-node-wrap img) {
  margin: 0;
  padding: 0;
  max-width: none;
  height: auto;
}

.mindmap-toolbar {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-elv);
  background: color-mix(in srgb, var(--vp-c-bg-elv) 88%, transparent);
  backdrop-filter: blur(8px);
  max-width: calc(100% - 1rem);
  overflow-x: auto;
}

.mm-btn {
  flex: none;
  font-size: 0.75rem;
  line-height: 1;
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  white-space: nowrap;
}

.mm-btn:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.mm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mm-btn-primary {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}

.mm-btn-primary:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
  color: #fff;
}

.mm-status {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
  white-space: nowrap;
  padding: 0 0.2rem;
}

.mm-status.error {
  color: var(--vp-c-danger-1);
}

.mm-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--vp-c-green-3);
  flex: none;
}

.mm-dot.dirty {
  background: var(--vp-c-yellow-3);
}

.mm-dot.error {
  background: var(--vp-c-danger-1);
}

.mindmap-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  text-align: center;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
}

.mindmap-placeholder > span {
  font-size: 0.85rem;
  color: var(--vp-c-text-3);
}

.mm-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.mm-path {
  margin: 0;
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mm-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
  max-width: 85%;
}
</style>

<style>
/*
 * 编辑态文本框兜底：库把 .smm-richtext-node-edit-wrap（双击节点出现的
 * quill 编辑框，position:fixed）直接挂到 document.body，不在 .mindmap-wrap
 * 内，上面的 scoped 隔离够不到它；用库专属类名做窄作用域兜底，使编辑态
 * 与阅读态的段落 margin 表现一致（line-height 1.2 与 padding 由库内联控制）。
 * 注意：刻意不写全局 .ql-editor 规则——quill 依赖自身 pre-wrap/光标/选区
 * 样式，全局 reset 会破坏编辑体验；此处选择器只命中 simple-mind-map 的编辑框。
 */
.smm-richtext-node-edit-wrap p,
.smm-richtext-node-edit-wrap div,
.smm-richtext-node-edit-wrap ul,
.smm-richtext-node-edit-wrap ol,
.smm-richtext-node-edit-wrap li,
.smm-richtext-node-edit-wrap h1,
.smm-richtext-node-edit-wrap h2,
.smm-richtext-node-edit-wrap h3,
.smm-richtext-node-edit-wrap h4,
.smm-richtext-node-edit-wrap h5,
.smm-richtext-node-edit-wrap h6 {
  margin: 0;
  padding: 0;
}
</style>
