<script setup lang="ts">
/**
 * 任务看板组件（Tower 风格项目面板，零第三方依赖：自绘看板/表格/月历/统计）
 *
 * 用法（主题入口已全局注册，markdown 正文直接写；亦可单独 import 使用）：
 *   <TaskBoard src="/vault/xx/yy.taskboard.json" />
 *   <TaskBoard src="/vault/xx.taskboard.json" height="640px" mode="edit" initial-view="table" />
 * （src 前缀由主题配置 assetPrefix 决定，默认 /vault/，需与插件组配置一致）
 *
 * 数据源：vault 内 `*.taskboard.json`（schema 见 board/types.ts）。成员/状态/分类
 * 完全每板自配置——不同项目放不同 JSON 即得到不同分类体系。
 *
 * 模式：
 * - 阅读模式（默认）：看板/表格/日历/统计四视图 + 成员/分类/状态/优先级/关键字
 *   筛选全部可用，纯浏览不改数据；
 * - 编辑模式：mode="edit" 且 dev 保存服务（<apiBase>/board/ping）探测通过时进入，
 *   支持 ＋新建任务 / 点卡片编辑 / 拖拽卡片换状态列 / 成员增删改名 / 状态列与
 *   分类配置（改名、配色、排序、增删），data 变更后 3s 防抖自动保存，
 *   PUT <apiBase>/board 落盘到 vault 本地文件；任务移入完成列自动盖章 doneAt。
 *   build/preview 产物没有该路由 → ping 失败 → 不显示任何编辑入口，纯阅读。
 *
 * SSR 安全：组件不依赖任何 DOM 库，数据经 onMounted fetch 注入，SSR 渲染占位
 * 容器；404 与「SPA fallback 返回 200 HTML」都按 missing 处理（同 MindMap 口径）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vitepress";
import {
  getLocalNotesThemeConfig,
  joinApi,
  normalizeAssetPrefix,
  stripAssetPrefix,
} from "../theme/config";
import {
  BOARD_PALETTE,
  BOARD_PRIORITIES,
  formatBoardDate,
  genBoardId,
  isDoneStatus,
  isExternalLink,
  isOverdue,
  isTaskDone,
  linkHref,
  linkTitle,
  normalizeBoard,
  overallProgress,
  paletteColor,
  priorityWeight,
  taskProgress,
  todayStr,
  defaultStatuses,
  type BoardCategory,
  type BoardData,
  type BoardLink,
  type BoardMember,
  type BoardPriority,
  type BoardStatus,
  type BoardTask,
} from "./board/types.ts";

type BoardView = "board" | "table" | "calendar" | "stats";

const props = withDefaults(
  defineProps<{
    /** vault 资源 URL，如 <assetPrefix>xx/yy.taskboard.json（必填） */
    src: string;
    /** 容器高度 */
    height?: string;
    /** 初始模式：read 阅读 / edit 编辑（编辑还需 ping 探测通过） */
    mode?: "read" | "edit";
    /** 初始视图 */
    initialView?: BoardView;
    /** 整页模式（由 TaskBoardPage 挂载时置 true）：隐藏「整页」跳转按钮避免套娃 */
    fullpage?: boolean;
  }>(),
  { height: "560px", mode: "read", initialView: "board", fullpage: false },
);

// ---- 组件状态 ----
type State = "loading" | "ready" | "missing" | "error";
const state = ref<State>("loading");
const errorMsg = ref("");
/** dev 保存服务是否可用（GET <apiBase>/board/ping 探测） */
const pingOk = ref(false);
/** 当前是否处于编辑态 */
const editing = ref(false);
/** 有未保存改动 */
const dirty = ref(false);
/** 最近一次保存成功时间 HH:MM */
const savedAt = ref("");
const saveError = ref("");
const saving = ref(false);
const isFullscreen = ref(false);
/** 看板数据（归一化后） */
const board = ref<BoardData | null>(null);

const wrapRef = ref<HTMLDivElement | null>(null);
let bodyOverflowBackup = "";
let disposed = false;

// ---- 保存排程句柄（非响应式，语义同 MindMap） ----
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveInFlight = false;
let saveQueued = false;

// ---- 站点资源配置 ----
const cfg = getLocalNotesThemeConfig();
const assetPrefix = normalizeAssetPrefix(cfg.assetPrefix);
/** 整页路由（主题选项 boardPath）：配置了才显示「整页」快捷入口 */
const boardPath = cfg.boardPath;
const router = useRouter();

const fileName = computed(() => {
  try {
    return decodeURIComponent(props.src.split("/").pop() ?? props.src);
  } catch {
    return props.src;
  }
});
const boardName = computed(() => fileName.value.replace(/\.taskboard\.json$/i, ""));
/** PUT <apiBase>/board 的 path：去掉资源前缀并 decodeURIComponent */
const vaultPath = computed(() => stripAssetPrefix(cfg, props.src));

async function probePing(): Promise<boolean> {
  try {
    const res = await fetch(joinApi(cfg, "/board/ping"));
    return res.ok;
  } catch {
    return false;
  }
}

// ---- 加载 / 创建 ----
onMounted(async () => {
  if (!props.src.startsWith(assetPrefix)) {
    state.value = "error";
    errorMsg.value = `src 必须是以 ${assetPrefix} 开头的站点绝对路径（主题配置 assetPrefix）`;
    return;
  }
  window.addEventListener("keydown", onKeydown);
  pingOk.value = await probePing();
  if (disposed) return;
  await load();
  if (!disposed && state.value === "ready" && props.mode === "edit" && pingOk.value) {
    editing.value = true;
  }
});

async function load(): Promise<void> {
  state.value = "loading";
  errorMsg.value = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;
  try {
    // 防缓存：dev 下文件被 PUT 更新后需要拿到最新内容
    const res = await fetch(props.src + "?t=" + Date.now());
    if (res.status === 404 || res.status === 410) {
      state.value = "missing";
      return;
    }
    if (!res.ok) {
      state.value = "error";
      errorMsg.value = `读取看板文件失败（HTTP ${res.status}）`;
      return;
    }
    // 文件不存在时 VitePress 会以 SPA fallback 返回 200 的 HTML 页面（dev 与
    // preview 产物皆如此），无法只靠状态码判断——非 JSON 响应一律视为不存在
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("json")) {
      state.value = "missing";
      return;
    }
    raw = await res.json();
  } catch (e) {
    state.value = "error";
    errorMsg.value = `读取看板文件失败：${(e as Error)?.message ?? e}`;
    return;
  }
  if (disposed) return;
  board.value = normalizeBoard(raw, boardName.value);
  resetFilters();
  state.value = "ready";
}

/** src 404（ping 可用）时空态卡片 → PUT 默认骨架 → 就绪并进编辑 */
async function createBoard(): Promise<void> {
  if (!pingOk.value) return;
  const def = normalizeBoard(
    { title: boardName.value, members: [], statuses: defaultStatuses(), categories: [], tasks: [] },
    boardName.value,
  );
  try {
    const res = await fetch(joinApi(cfg, "/board"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: vaultPath.value, data: plainBoard(def) }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new Error((j as { error?: string })?.error ?? `HTTP ${res.status}`);
    }
  } catch (e) {
    state.value = "error";
    errorMsg.value = `创建看板失败：${(e as Error)?.message ?? e}`;
    return;
  }
  board.value = def;
  resetFilters();
  state.value = "ready";
  editing.value = true;
}

// src 变化（组件被复用时）：重置状态重新加载
watch(
  () => props.src,
  () => {
    if (disposed) return;
    exitFullscreen();
    closeDialog();
    editing.value = false;
    void load();
  },
);

// ---- 保存（PUT <apiBase>/board，dev 中间件原子写入 vault 文件） ----
/** 剥掉响应式代理的纯 JSON 数据（undefined 字段自然脱落，文件保持干净） */
function plainBoard(b: BoardData): Pick<BoardData, "title" | "members" | "statuses" | "categories" | "tasks"> {
  return JSON.parse(
    JSON.stringify({ title: b.title, members: b.members, statuses: b.statuses, categories: b.categories, tasks: b.tasks }),
  );
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

function markDirty(): void {
  dirty.value = true;
  saveError.value = "";
  scheduleSave();
}

async function saveNow(): Promise<void> {
  if (!pingOk.value || !board.value) return;
  if (saveInFlight) {
    saveQueued = true; // 在途时来了新改动：完成后补一次
    return;
  }
  saveInFlight = true;
  saving.value = true;
  const body = JSON.stringify({ path: vaultPath.value, data: plainBoard(board.value) });
  try {
    const res = await fetch(joinApi(cfg, "/board"), {
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

// ---- 编辑态切换 ----
function startEdit(): void {
  if (!pingOk.value) return;
  editing.value = true;
}

async function stopEdit(): Promise<void> {
  clearSaveTimer();
  // 退出编辑前把未保存改动落盘
  if (dirty.value) await saveNow();
  editing.value = false;
  closeDialog();
}

// ---- 视图切换与筛选 ----
const view = ref<BoardView>(props.initialView);
const viewTabs: ReadonlyArray<{ id: BoardView; name: string }> = [
  { id: "board", name: "看板" },
  { id: "table", name: "表格" },
  { id: "calendar", name: "日历" },
  { id: "stats", name: "统计" },
];

const fMembers = ref<Set<string>>(new Set());
const fCategories = ref<Set<string>>(new Set());
const fStatuses = ref<Set<string>>(new Set());
const fPriority = ref<BoardPriority | "">("");
const fOverdue = ref(false);
const fQuery = ref("");

// 注意：模板表达式里的 ref 会自动解包，不能把 ref 本身传给辅助函数再整只
// 替换 .value（拿到的是裸 Set，赋值无效）——因此每个筛选项给显式 toggle。
function toggleMemberFilter(id: string): void {
  const next = new Set(fMembers.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  fMembers.value = next;
}

function toggleCategoryFilter(id: string): void {
  const next = new Set(fCategories.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  fCategories.value = next;
}

function toggleStatusFilter(id: string): void {
  const next = new Set(fStatuses.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  fStatuses.value = next;
}

function resetFilters(): void {
  fMembers.value = new Set();
  fCategories.value = new Set();
  fStatuses.value = new Set();
  fPriority.value = "";
  fOverdue.value = false;
  fQuery.value = "";
}

const hasActiveFilter = computed(
  () =>
    fMembers.value.size > 0 ||
    fCategories.value.size > 0 ||
    fStatuses.value.size > 0 ||
    fPriority.value !== "" ||
    fOverdue.value ||
    fQuery.value.trim() !== "",
);

const filteredTasks = computed<BoardTask[]>(() => {
  const b = board.value;
  if (!b) return [];
  const q = fQuery.value.trim().toLowerCase();
  const today = todayStr();
  return b.tasks.filter((t) => {
    if (fMembers.value.size > 0 && !(t.assignees ?? []).some((a) => fMembers.value.has(a))) return false;
    if (fCategories.value.size > 0 && !(t.category && fCategories.value.has(t.category))) return false;
    if (fStatuses.value.size > 0 && !fStatuses.value.has(t.status)) return false;
    if (fPriority.value !== "" && t.priority !== fPriority.value) return false;
    if (fOverdue.value && !isOverdue(t, b.statuses, today)) return false;
    if (q) {
      const hay = [t.title, t.notes ?? "", ...(t.tags ?? [])].join("\n").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
});

// ---- 展示辅助 ----
function memberOf(id: string): BoardMember | undefined {
  return board.value?.members.find((m) => m.id === id);
}
function memberColor(id: string): string {
  return memberOf(id)?.color ?? paletteColor(id);
}
function memberInitial(id: string): string {
  const name = memberOf(id)?.name ?? id;
  return [...name][0] ?? "?";
}
function statusOf(task: BoardTask): BoardStatus | undefined {
  return board.value?.statuses.find((s) => s.id === task.status);
}
/** 任务状态色（未知状态灰兜底，模板直接用） */
function statusColorOf(task: BoardTask): string {
  const s = statusOf(task);
  return s ? statusColor(s) : "#9ca3af";
}
function statusNameOf(task: BoardTask): string {
  return statusOf(task)?.name ?? task.status;
}
function categoryOf(task: BoardTask): BoardCategory | undefined {
  return board.value?.categories.find((c) => c.id === task.category);
}
function categoryName(task: BoardTask): string {
  return categoryOf(task)?.name ?? "未分类";
}
function categoryColor(task: BoardTask): string {
  const c = categoryOf(task);
  return c?.color ?? "#9ca3af";
}
function priorityName(t: BoardTask): string {
  return BOARD_PRIORITIES.find((p) => p.id === t.priority)?.name ?? "—";
}

/** 总进度（全量任务口径，不随筛选——筛选口径的统计在「统计」视图里看） */
const overallPct = computed(() => {
  const b = board.value;
  if (!b) return 0;
  return overallProgress(b.tasks, b.statuses);
});
const doneCount = computed(() => {
  const b = board.value;
  if (!b) return 0;
  return b.tasks.filter((t) => isTaskDone(t, b.statuses)).length;
});

// ---- 看板视图 ----
const boardColumns = computed<{ status: BoardStatus; tasks: BoardTask[] }[]>(() => {
  const b = board.value;
  if (!b) return [];
  return b.statuses
    .filter((s) => fStatuses.value.size === 0 || fStatuses.value.has(s.id))
    .map((status) => ({
      status,
      tasks: filteredTasks.value.filter((t) => t.status === status.id),
    }));
});

function statusColor(s: BoardStatus): string {
  return s.color ?? (isDoneStatus(s) ? "#10b981" : "#8b8f94");
}

// 拖拽换列（仅编辑态启用）
const dragTaskId = ref<string | null>(null);
const dragOverStatus = ref<string | null>(null);

function onCardDragStart(e: DragEvent, task: BoardTask): void {
  if (!editing.value) {
    e.preventDefault();
    return;
  }
  dragTaskId.value = task.id;
  if (e.dataTransfer) {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
  }
}

function onCardDragEnd(): void {
  dragTaskId.value = null;
  dragOverStatus.value = null;
}

function onColumnDragOver(e: DragEvent, statusId: string): void {
  if (!editing.value || !dragTaskId.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  dragOverStatus.value = statusId;
}

/** 离开列（含从子卡片间穿过）：relatedTarget 仍在列内时不熄灭高亮，避免闪烁 */
function onColumnDragLeave(e: DragEvent, statusId: string): void {
  if (dragOverStatus.value !== statusId) return;
  const related = e.relatedTarget as Node | null;
  if (related && e.currentTarget instanceof Node && e.currentTarget.contains(related)) return;
  dragOverStatus.value = null;
}

function onColumnDrop(e: DragEvent, statusId: string): void {
  e.preventDefault();
  const id = dragTaskId.value ?? e.dataTransfer?.getData("text/plain") ?? null;
  dragTaskId.value = null;
  dragOverStatus.value = null;
  if (id && editing.value) moveTask(id, statusId);
}

/** 换状态列；进入/移出完成列时同步盖章/清除 doneAt（统计与日历的口径来源） */
function moveTask(taskId: string, toStatus: string): void {
  const b = board.value;
  if (!b) return;
  const task = b.tasks.find((t) => t.id === taskId);
  if (!task || task.status === toStatus) return;
  if (!b.statuses.some((s) => s.id === toStatus)) return;
  task.status = toStatus;
  stampDoneAt(task);
  markDirty();
}

function stampDoneAt(task: BoardTask): void {
  const st = statusOf(task);
  if (st && isDoneStatus(st)) {
    if (!task.doneAt) task.doneAt = todayStr();
  } else {
    task.doneAt = undefined;
  }
}

// ---- 表格视图 ----
type SortKey = "status" | "title" | "category" | "assignees" | "priority" | "progress" | "due";
const sortKey = ref<SortKey | null>(null);
const sortDir = ref<1 | -1>(1);

function toggleSort(key: SortKey): void {
  if (sortKey.value === key) sortDir.value = (sortDir.value === 1 ? -1 : 1) as 1 | -1;
  else {
    sortKey.value = key;
    sortDir.value = 1;
  }
}

const tableTasks = computed<BoardTask[]>(() => {
  const b = board.value;
  if (!b) return [];
  const arr = [...filteredTasks.value];
  const key = sortKey.value;
  const dir = sortDir.value;
  if (!key) return arr;
  const statusIdx = (t: BoardTask): number => {
    const i = b.statuses.findIndex((s) => s.id === t.status);
    return i === -1 ? 999 : i;
  };
  arr.sort((a, z) => {
    let r = 0;
    switch (key) {
      case "title":
        r = a.title.localeCompare(z.title, "zh-Hans-CN");
        break;
      case "priority":
        r = priorityWeight(a.priority) - priorityWeight(z.priority);
        break;
      case "progress":
        r = taskProgress(a, b.statuses) - taskProgress(z, b.statuses);
        break;
      case "due":
        r = (a.dueDate ?? "9999-99-99").localeCompare(z.dueDate ?? "9999-99-99");
        break;
      case "status":
        r = statusIdx(a) - statusIdx(z);
        break;
      case "category":
        r = categoryName(a).localeCompare(categoryName(z), "zh-Hans-CN");
        break;
      case "assignees":
        r = (a.assignees ?? []).length - (z.assignees ?? []).length;
        break;
    }
    return r * dir;
  });
  return arr;
});

function sortMark(key: SortKey): string {
  if (sortKey.value !== key) return "↕";
  return sortDir.value === 1 ? "↑" : "↓";
}

// ---- 日历视图 ----
const showDoneOnCal = ref(true);
const calCursor = ref(monthStart(new Date()));
const calWeekdays: ReadonlyArray<string> = ["一", "二", "三", "四", "五", "六", "日"];

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function calShift(delta: number): void {
  const c = calCursor.value;
  calCursor.value = new Date(c.getFullYear(), c.getMonth() + delta, 1);
}

function calToday(): void {
  calCursor.value = monthStart(new Date());
}

const calTitle = computed(() => {
  const c = calCursor.value;
  return `${c.getFullYear()} 年 ${c.getMonth() + 1} 月`;
});

/** 6×7 网格（周一起始），含前后月补位 */
const calCells = computed<{ date: Date; inMonth: boolean }[]>(() => {
  const first = calCursor.value;
  const lead = (first.getDay() + 6) % 7;
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(first.getFullYear(), first.getMonth(), 1 - lead + i);
    cells.push({ date: d, inMonth: d.getMonth() === first.getMonth() });
  }
  return cells;
});

function calEntries(d: Date): BoardTask[] {
  const ds = formatBoardDate(d);
  const out: BoardTask[] = [];
  const seen = new Set<string>();
  for (const t of filteredTasks.value) {
    const due = t.dueDate === ds;
    const doneToday = showDoneOnCal.value && !!t.doneAt && t.doneAt === ds;
    const spanning =
      !!t.startDate && !!t.dueDate && t.startDate <= ds && ds <= t.dueDate && t.startDate !== t.dueDate;
    if ((due || doneToday || spanning) && !seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  // 截止任务优先展示
  out.sort((a, z) => (a.dueDate === ds ? -1 : 1) - (z.dueDate === ds ? -1 : 1));
  return out;
}

function isToday(d: Date): boolean {
  return formatBoardDate(d) === todayStr();
}

function onCalCellClick(d: Date): void {
  if (!editing.value) return;
  openNewTask(formatBoardDate(d));
}

// ---- 统计视图（基于当前筛选的任务集） ----
const stats = computed(() => {
  const b = board.value;
  const tasks = filteredTasks.value;
  if (!b) return null;
  const today = todayStr();
  const dueSoonCutoff = formatBoardDate(new Date(Date.now() + 7 * 86400000));
  const done = tasks.filter((t) => isTaskDone(t, b.statuses));
  const overdue = tasks.filter((t) => isOverdue(t, b.statuses, today));
  const dueSoon = tasks.filter(
    (t) => !isTaskDone(t, b.statuses) && !!t.dueDate && t.dueDate >= today && t.dueDate <= dueSoonCutoff,
  );
  const noDue = tasks.filter((t) => !t.dueDate && !isTaskDone(t, b.statuses));
  const byStatus = b.statuses.map((s) => ({
    status: s,
    count: tasks.filter((t) => t.status === s.id).length,
  }));
  const members = fMembers.value.size > 0 ? b.members.filter((m) => fMembers.value.has(m.id)) : b.members;
  const byMember = members.map((m) => {
    const mine = tasks.filter((t) => (t.assignees ?? []).includes(m.id));
    const mineDone = mine.filter((t) => isTaskDone(t, b.statuses));
    return { member: m, total: mine.length, done: mineDone.length };
  });
  const catEntries: { id: string | null; name: string; color: string }[] = [
    ...b.categories.map((c) => ({ id: c.id, name: c.name, color: c.color ?? paletteColor(c.id) })),
    { id: null, name: "未分类", color: "#9ca3af" },
  ];
  const byCategory = catEntries
    .map((c) => {
      const list = tasks.filter((t) => (c.id ? t.category === c.id : !t.category));
      const d = list.filter((t) => isTaskDone(t, b.statuses));
      return { ...c, total: list.length, done: d.length };
    })
    .filter((c) => c.total > 0 || (c.id && b.categories.length > 0));
  return {
    total: tasks.length,
    done: done.length,
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    noDue: noDue.length,
    pct: overallProgress(tasks, b.statuses),
    byStatus,
    byMember,
    byCategory,
  };
});

function pct(total: number, done: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

// ---- 弹窗（任务编辑 / 成员管理 / 看板配置） ----
type Dialog =
  | { kind: "task"; draft: BoardTask; isNew: boolean }
  | { kind: "members"; draft: BoardMember[] }
  | { kind: "config"; statuses: BoardStatus[]; categories: BoardCategory[] };
const dialog = ref<Dialog | null>(null);

const taskDlg = computed(() => (dialog.value?.kind === "task" ? dialog.value : null));
const memberDlg = computed(() => (dialog.value?.kind === "members" ? dialog.value : null));
const configDlg = computed(() => (dialog.value?.kind === "config" ? dialog.value : null));

function closeDialog(): void {
  dialog.value = null;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function openTaskDialog(task: BoardTask): void {
  if (!board.value) return;
  const draft = clone(task);
  draft.links = clone(task.links ?? []); // 编辑器假设 links 是数组
  dialog.value = { kind: "task", draft, isNew: false };
}

function openNewTask(dueDate?: string): void {
  if (!board.value) return;
  const first = board.value.statuses[0];
  dialog.value = {
    kind: "task",
    isNew: true,
    draft: {
      id: genBoardId("task"),
      title: "",
      status: first?.id ?? "todo",
      category: board.value.categories[0]?.id,
      assignees: [],
      priority: "medium",
      startDate: undefined,
      dueDate,
      tags: [],
      notes: undefined,
      links: [],
    },
  };
}

function toggleDraftAssignee(id: string): void {
  const dlg = taskDlg.value;
  if (!dlg) return;
  const list = new Set(dlg.draft.assignees ?? []);
  if (list.has(id)) list.delete(id);
  else list.add(id);
  dlg.draft.assignees = [...list];
}

function onDraftTagsInput(e: Event): void {
  const dlg = taskDlg.value;
  if (!dlg) return;
  const raw = (e.target as HTMLInputElement).value;
  dlg.draft.tags = raw
    .split(/[，,、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const draftTagsText = computed(() => (taskDlg.value?.draft.tags ?? []).join(" "));

// ---- 弹窗内的关联文档链接编辑 ----
function addLinkDraft(): void {
  const dlg = taskDlg.value;
  if (!dlg) return;
  if (!dlg.draft.links) dlg.draft.links = [];
  dlg.draft.links.push({ title: "", url: "" });
}

function removeLinkDraft(i: number): void {
  const dlg = taskDlg.value;
  if (!dlg || !dlg.draft.links) return;
  dlg.draft.links.splice(i, 1);
}

/** 应用前清洗：丢掉 url 为空的行，trim 两字段；全空则置 undefined（文件保持干净） */
function cleanLinks(links: BoardLink[] | undefined): BoardLink[] | undefined {
  const out = (links ?? [])
    .map((l) => ({ title: (l.title ?? "").trim() || undefined, url: (l.url ?? "").trim() }))
    .filter((l) => l.url !== "");
  return out.length > 0 ? out : undefined;
}

/** 按「目标状态是否完成列」推算 doneAt：进入完成列盖章今天，移出清除 */
function computeDoneAt(statusId: string, currentDoneAt: string | undefined): string | undefined {
  const st = board.value?.statuses.find((s) => s.id === statusId);
  if (st && isDoneStatus(st)) return currentDoneAt ?? todayStr();
  return undefined;
}

function applyTaskDialog(): void {
  const b = board.value;
  const dlg = taskDlg.value;
  if (!b || !dlg) return;
  const draft = dlg.draft;
  if (draft.title.trim() === "") return;
  draft.title = draft.title.trim();
  draft.links = cleanLinks(draft.links);
  const doneAt = computeDoneAt(draft.status, draft.doneAt);
  if (dlg.isNew) {
    b.tasks.push({ ...clone(draft), doneAt });
  } else {
    const t = b.tasks.find((x) => x.id === draft.id);
    if (!t) return;
    Object.assign(t, clone(draft));
    t.doneAt = doneAt;
  }
  markDirty();
  closeDialog();
}

function removeTask(taskId: string): void {
  const b = board.value;
  if (!b || !editing.value) return;
  const i = b.tasks.findIndex((t) => t.id === taskId);
  if (i === -1) return;
  if (!window.confirm("确定删除该任务？")) return;
  b.tasks.splice(i, 1);
  markDirty();
  closeDialog();
}

function openMembers(): void {
  if (!board.value) return;
  dialog.value = { kind: "members", draft: clone(board.value.members) };
}

function addMemberDraft(): void {
  const dlg = memberDlg.value;
  if (!dlg) return;
  // 成员默认配色：调色板顺序取色（避免与已有成员撞色）
  dlg.draft.push({ id: genBoardId("m"), name: "新成员", color: BOARD_PALETTE[dlg.draft.length % BOARD_PALETTE.length] });
}

function removeMemberDraft(i: number): void {
  memberDlg.value?.draft.splice(i, 1);
}

function applyMembersDialog(): void {
  const b = board.value;
  const dlg = memberDlg.value;
  if (!b || !dlg) return;
  const list = dlg.draft.filter((m) => m.id.trim() !== "" && m.name.trim() !== "");
  for (const m of list) {
    m.id = m.id.trim();
    m.name = m.name.trim();
  }
  const keep = new Set(list.map((m) => m.id));
  b.members = list;
  // 同步清理任务上对已删成员的引用（脏引用渲染为灰头像没有意义）
  for (const t of b.tasks) {
    if (t.assignees?.length) t.assignees = t.assignees.filter((a) => keep.has(a));
  }
  markDirty();
  closeDialog();
}

function openConfig(): void {
  if (!board.value) return;
  dialog.value = {
    kind: "config",
    statuses: clone(board.value.statuses.length > 0 ? board.value.statuses : defaultStatuses()),
    categories: clone(board.value.categories),
  };
}

function addConfigStatus(): void {
  configDlg.value?.statuses.push({ id: genBoardId("s"), name: "新状态", done: false });
}

function addConfigCategory(): void {
  configDlg.value?.categories.push({ id: genBoardId("c"), name: "新分类" });
}

function moveConfigItem(list: unknown[], i: number, delta: number): void {
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  const [item] = list.splice(i, 1);
  list.splice(j, 0, item);
}

function applyConfigDialog(): void {
  const b = board.value;
  const dlg = configDlg.value;
  if (!b || !dlg) return;
  const statuses = dlg.statuses.filter((s) => s.id.trim() !== "" && s.name.trim() !== "");
  const categories = dlg.categories.filter((c) => c.id.trim() !== "" && c.name.trim() !== "");
  for (const s of statuses) {
    s.id = s.id.trim();
    s.name = s.name.trim();
    s.done = s.done === true;
  }
  const resolved = statuses.length > 0 ? statuses : defaultStatuses();
  const sIds = new Set(resolved.map((s) => s.id));
  const cIds = new Set(categories.map((c) => c.id));
  b.statuses = resolved;
  b.categories = categories;
  for (const t of b.tasks) {
    if (!sIds.has(t.status)) t.status = resolved[0].id;
    if (t.category && !cIds.has(t.category)) t.category = undefined;
    stampDoneAt(t); // done 标志可能被改 → 重新对齐 doneAt
  }
  markDirty();
  closeDialog();
}

// ---- 全屏（组件容器 fixed 覆盖视口，Esc 退出；同 MindMap 规范） ----
/** 跳整页：走主题选项 boardPath 的路由，当前 src 经 ?src= 传递（由 TaskBoardPage 接住） */
function goFullPage(): void {
  if (!boardPath || props.fullpage) return;
  void router.go(`${boardPath}?src=${encodeURIComponent(props.src)}`);
}

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

// ---- 键盘：Esc 关弹窗→退全屏；Cmd/Ctrl+S 手动保存 ----
function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    if (dialog.value) {
      closeDialog();
      return;
    }
    if (isFullscreen.value) exitFullscreen();
    return;
  }
  if (editing.value && (e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    e.stopPropagation();
    clearSaveTimer();
    void saveNow();
  }
}

onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener("keydown", onKeydown);
  if (isFullscreen.value) document.body.style.overflow = bodyOverflowBackup;
  clearSaveTimer();
});

const wrapStyle = computed(() => (isFullscreen.value ? {} : { height: props.height }));
</script>

<template>
  <div ref="wrapRef" class="tb-wrap" :class="{ fullscreen: isFullscreen }" :style="wrapStyle">
    <!-- 头部：标题 + 总进度 + 工具栏 -->
    <div class="tb-head">
      <div class="tb-title-row">
        <span class="tb-title">{{ board?.title ?? boardName }}</span>
        <span v-if="board && board.tasks.length > 0" class="tb-overall" title="整体完成进度（全部任务口径）">
          <span class="tb-overall-bar"><span class="tb-overall-fill" :style="{ width: overallPct + '%' }" /></span>
          <span class="tb-overall-num">{{ overallPct }}%</span>
          <span class="tb-overall-count">{{ doneCount }}/{{ board.tasks.length }}</span>
        </span>
        <span class="tb-spacer" />
        <span
          v-if="editing"
          class="tb-status"
          :class="{ error: saveError }"
          :title="saveError ? `保存失败：${saveError}` : ''"
        >
          <span class="tb-dot" :class="{ dirty: dirty, error: saveError }" />
          <template v-if="saveError">保存失败</template>
          <template v-else-if="saving">保存中…</template>
          <template v-else-if="dirty">未保存</template>
          <template v-else-if="savedAt">已保存 {{ savedAt }}</template>
          <template v-else>编辑中</template>
        </span>
        <template v-if="pingOk && state === 'ready'">
          <button v-if="!editing" class="tb-btn tb-btn-primary" @click="startEdit">编辑</button>
          <template v-else>
            <button class="tb-btn tb-btn-primary" @click="stopEdit">完成编辑</button>
            <button class="tb-btn" title="新建任务" @click="openNewTask()">＋ 任务</button>
            <button class="tb-btn" title="成员管理（添加人员/改名/配色/删除）" @click="openMembers">成员</button>
            <button class="tb-btn" title="看板配置（状态列与分类）" @click="openConfig">配置</button>
          </template>
        </template>
        <button
          v-if="boardPath && state === 'ready' && !fullpage"
          class="tb-btn"
          title="在整页视图打开当前看板"
          @click="goFullPage"
        >
          整页
        </button>
        <button class="tb-btn" @click="toggleFullscreen">{{ isFullscreen ? "退出全屏" : "全屏" }}</button>
      </div>

      <template v-if="board">
        <!-- 视图 Tab -->
        <div class="tb-tabs">
          <button
            v-for="tab in viewTabs"
            :key="tab.id"
            class="tb-tab"
            :class="{ active: view === tab.id }"
            @click="view = tab.id"
          >
            {{ tab.name }}
          </button>
          <span class="tb-tab-hint">{{ filteredTasks.length }}/{{ board.tasks.length }} 个任务</span>
        </div>

        <!-- 筛选条：成员 / 分类 / 状态 / 优先级 / 超期 / 搜索 -->
        <div class="tb-filters">
          <div v-if="board.members.length > 0" class="tb-fgroup">
            <span class="tb-flabel">成员</span>
            <button
              v-for="m in board.members"
              :key="m.id"
              class="tb-chip tb-chip-member"
              :class="{ active: fMembers.has(m.id) }"
              :title="m.name"
              @click="toggleMemberFilter(m.id)"
            >
              <span class="tb-avatar" :style="{ background: memberColor(m.id) }">{{ memberInitial(m.id) }}</span>
              <span>{{ m.name }}</span>
            </button>
          </div>
          <div v-if="board.categories.length > 0" class="tb-fgroup">
            <span class="tb-flabel">分类</span>
            <button
              v-for="c in board.categories"
              :key="c.id"
              class="tb-chip"
              :class="{ active: fCategories.has(c.id) }"
              @click="toggleCategoryFilter(c.id)"
            >
              <span class="tb-cdot" :style="{ background: c.color ?? paletteColor(c.id) }" />{{ c.name }}
            </button>
          </div>
          <div class="tb-fgroup">
            <span class="tb-flabel">状态</span>
            <button
              v-for="s in board.statuses"
              :key="s.id"
              class="tb-chip"
              :class="{ active: fStatuses.has(s.id) }"
              @click="toggleStatusFilter(s.id)"
            >
              <span class="tb-cdot" :style="{ background: statusColor(s) }" />{{ s.name }}
            </button>
          </div>
          <div class="tb-fgroup">
            <span class="tb-flabel">优先级</span>
            <select v-model="fPriority" class="tb-select">
              <option value="">全部</option>
              <option v-for="p in BOARD_PRIORITIES" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <label class="tb-check"><input v-model="fOverdue" type="checkbox" />只看超期</label>
          </div>
          <div class="tb-fgroup tb-fgrow">
            <input v-model="fQuery" class="tb-search" type="search" placeholder="搜索标题 / 标签 / 备注…" />
            <button v-if="hasActiveFilter" class="tb-btn tb-btn-link" @click="resetFilters">清除筛选</button>
          </div>
        </div>
      </template>
    </div>

    <!-- 主体 -->
    <div class="tb-body">
      <!-- 加载 / 空态 / 错误 -->
      <div v-if="state === 'loading'" class="tb-placeholder"><span>加载中…</span></div>
      <div v-else-if="state === 'missing'" class="tb-placeholder">
        <p class="tb-ph-title">该看板文件还不存在</p>
        <p class="tb-ph-path">{{ fileName }}</p>
        <button v-if="pingOk" class="tb-btn tb-btn-primary" @click="createBoard">创建看板</button>
        <p v-else class="tb-ph-hint">当前页面为静态构建产物，未检测到本地保存服务，暂不支持创建</p>
      </div>
      <div v-else-if="state === 'error'" class="tb-placeholder">
        <p class="tb-ph-title">看板加载失败</p>
        <p class="tb-ph-hint">{{ errorMsg }}</p>
      </div>

      <template v-else-if="board">
        <!-- 看板视图 -->
        <div v-if="view === 'board'" class="tb-kanban">
          <div
            v-for="col in boardColumns"
            :key="col.status.id"
            class="tb-column"
            :class="{ drop: dragOverStatus === col.status.id }"
            @dragover="onColumnDragOver($event, col.status.id)"
            @dragleave="onColumnDragLeave($event, col.status.id)"
            @drop="onColumnDrop($event, col.status.id)"
          >
            <div class="tb-col-head">
              <span class="tb-cdot" :style="{ background: statusColor(col.status) }" />
              <span class="tb-col-name">{{ col.status.name }}</span>
              <span class="tb-col-count">{{ col.tasks.length }}</span>
            </div>
            <div class="tb-col-body">
              <div
                v-for="task in col.tasks"
                :key="task.id"
                class="tb-card"
                :class="{ dragging: dragTaskId === task.id }"
                :draggable="editing"
                @dragstart="onCardDragStart($event, task)"
                @dragend="onCardDragEnd"
                @click="openTaskDialog(task)"
              >
                <div class="tb-card-title">{{ task.title }}</div>
                <div class="tb-card-meta">
                  <span class="tb-tag" :style="{ borderColor: categoryColor(task), color: categoryColor(task) }">
                    {{ categoryName(task) }}
                  </span>
                  <span v-for="tag in task.tags" :key="tag" class="tb-tag tb-tag-plain">{{ tag }}</span>
                  <a
                    v-for="l in (task.links ?? []).slice(0, 2)"
                    :key="l.url + (l.title ?? '')"
                    class="tb-tag tb-link"
                    :href="linkHref(l)"
                    :target="isExternalLink(l) ? '_blank' : undefined"
                    :title="`打开：${linkTitle(l)}`"
                    @click.stop
                  >
                    🔗 {{ linkTitle(l) }}
                  </a>
                  <span v-if="(task.links ?? []).length > 2" class="tb-tag tb-tag-plain" title="更多链接见任务详情">
                    +{{ (task.links ?? []).length - 2 }}
                  </span>
                </div>
                <div class="tb-card-foot">
                  <span class="tb-avatars">
                    <span
                      v-for="a in (task.assignees ?? []).slice(0, 3)"
                      :key="a"
                      class="tb-avatar tb-avatar-sm"
                      :class="{ ghost: !memberOf(a) }"
                      :style="{ background: memberOf(a) ? memberColor(a) : '#9ca3af' }"
                      :title="memberOf(a)?.name ?? a"
                    >
                      {{ memberInitial(a) }}
                    </span>
                    <span v-if="(task.assignees ?? []).length > 3" class="tb-avatar-more">
                      +{{ (task.assignees ?? []).length - 3 }}
                    </span>
                  </span>
                  <span
                    v-if="task.dueDate"
                    class="tb-due"
                    :class="{ overdue: isOverdue(task, board.statuses), done: isTaskDone(task, board.statuses) }"
                  >
                    {{ task.dueDate.slice(5) }} 截止
                  </span>
                  <span class="tb-progress">
                    <span class="tb-progress-bar">
                      <span class="tb-progress-fill" :style="{ width: taskProgress(task, board.statuses) + '%' }" />
                    </span>
                    <span class="tb-progress-num">{{ taskProgress(task, board.statuses) }}%</span>
                  </span>
                </div>
              </div>
              <div v-if="col.tasks.length === 0" class="tb-col-empty">无任务</div>
              <button v-if="editing" class="tb-col-add" title="在此列新建任务" @click="openNewTask()">＋</button>
            </div>
          </div>
        </div>

        <!-- 表格视图 -->
        <div v-else-if="view === 'table'" class="tb-table-wrap">
          <table class="tb-table">
            <thead>
              <tr>
                <th class="sortable" @click="toggleSort('status')">状态 {{ sortMark("status") }}</th>
                <th class="sortable" @click="toggleSort('title')">标题 {{ sortMark("title") }}</th>
                <th class="sortable" @click="toggleSort('category')">分类 {{ sortMark("category") }}</th>
                <th class="sortable" @click="toggleSort('assignees')">成员 {{ sortMark("assignees") }}</th>
                <th class="sortable" @click="toggleSort('priority')">优先级 {{ sortMark("priority") }}</th>
                <th class="sortable" @click="toggleSort('progress')">进度 {{ sortMark("progress") }}</th>
                <th class="sortable" @click="toggleSort('due')">截止 {{ sortMark("due") }}</th>
                <th>标签</th>
                <th>链接</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in tableTasks" :key="task.id" @click="openTaskDialog(task)">
                <td>
                  <span class="tb-tag" :style="{ borderColor: statusColorOf(task), color: statusColorOf(task) }">
                    {{ statusNameOf(task) }}
                  </span>
                </td>
                <td class="tb-td-title">{{ task.title }}</td>
                <td>{{ categoryName(task) }}</td>
                <td>
                  <span class="tb-avatars">
                    <span
                      v-for="a in task.assignees ?? []"
                      :key="a"
                      class="tb-avatar tb-avatar-sm"
                      :class="{ ghost: !memberOf(a) }"
                      :style="{ background: memberOf(a) ? memberColor(a) : '#9ca3af' }"
                      :title="memberOf(a)?.name ?? a"
                    >
                      {{ memberInitial(a) }}
                    </span>
                    <span v-if="(task.assignees ?? []).length === 0" class="tb-dim">—</span>
                  </span>
                </td>
                <td :class="'tb-prio-' + (task.priority ?? 'none')">{{ priorityName(task) }}</td>
                <td>
                  <span class="tb-progress">
                    <span class="tb-progress-bar">
                      <span class="tb-progress-fill" :style="{ width: taskProgress(task, board.statuses) + '%' }" />
                    </span>
                    <span class="tb-progress-num">{{ taskProgress(task, board.statuses) }}%</span>
                  </span>
                </td>
                <td :class="{ 'tb-overdue-text': isOverdue(task, board.statuses) }">
                  {{ task.dueDate ?? "—" }}
                </td>
                <td>
                  <span v-for="tag in task.tags" :key="tag" class="tb-tag tb-tag-plain">{{ tag }}</span>
                  <span v-if="(task.tags ?? []).length === 0" class="tb-dim">—</span>
                </td>
                <td>
                  <a
                    v-for="l in task.links ?? []"
                    :key="l.url + (l.title ?? '')"
                    class="tb-tag tb-link"
                    :href="linkHref(l)"
                    :target="isExternalLink(l) ? '_blank' : undefined"
                    @click.stop
                  >
                    🔗 {{ linkTitle(l) }}
                  </a>
                  <span v-if="(task.links ?? []).length === 0" class="tb-dim">—</span>
                </td>
              </tr>
              <tr v-if="tableTasks.length === 0">
                <td colspan="9" class="tb-empty-row">没有符合条件的任务</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 日历视图 -->
        <div v-else-if="view === 'calendar'" class="tb-calendar">
          <div class="tb-cal-head">
            <span class="tb-cal-title">{{ calTitle }}</span>
            <span class="tb-spacer" />
            <label class="tb-check"><input v-model="showDoneOnCal" type="checkbox" />显示完成日</label>
            <button class="tb-btn" @click="calShift(-1)">‹ 上月</button>
            <button class="tb-btn" @click="calToday">今天</button>
            <button class="tb-btn" @click="calShift(1)">下月 ›</button>
          </div>
          <div class="tb-cal-grid">
            <div v-for="w in calWeekdays" :key="w" class="tb-cal-weekday">{{ w }}</div>
            <div
              v-for="(cell, i) in calCells"
              :key="i"
              class="tb-cal-cell"
              :class="{ out: !cell.inMonth, today: isToday(cell.date), editable: editing }"
              @click="onCalCellClick(cell.date)"
            >
              <span class="tb-cal-day">{{ cell.date.getDate() }}</span>
              <div
                v-for="task in calEntries(cell.date).slice(0, 3)"
                :key="task.id"
                class="tb-cal-task"
                :class="{ done: isTaskDone(task, board.statuses), overdue: isOverdue(task, board.statuses) }"
                :title="`${task.title}（${task.dueDate === formatBoardDate(cell.date) ? '截止' : '进行中'}）`"
                @click.stop="openTaskDialog(task)"
              >
                <span class="tb-cdot" :style="{ background: categoryColor(task) }" />{{ task.title }}
              </div>
              <span v-if="calEntries(cell.date).length > 3" class="tb-cal-more">
                +{{ calEntries(cell.date).length - 3 }}
              </span>
            </div>
          </div>
        </div>

        <!-- 统计视图 -->
        <div v-else-if="view === 'stats' && stats" class="tb-stats">
          <p class="tb-stats-note">统计口径：当前筛选后的 {{ stats.total }} 个任务</p>
          <div class="tb-stat-cards">
            <div class="tb-stat-card">
              <span class="tb-stat-num">{{ stats.pct }}%</span>
              <span class="tb-stat-label">整体完成率</span>
              <span class="tb-progress tb-progress-lg">
                <span class="tb-progress-bar"><span class="tb-progress-fill" :style="{ width: stats.pct + '%' }" /></span>
              </span>
            </div>
            <div class="tb-stat-card">
              <span class="tb-stat-num">{{ stats.done }}<small> / {{ stats.total }}</small></span>
              <span class="tb-stat-label">已完成 / 全部</span>
            </div>
            <div class="tb-stat-card">
              <span class="tb-stat-num" :class="{ danger: stats.overdue > 0 }">{{ stats.overdue }}</span>
              <span class="tb-stat-label">超期未完成</span>
            </div>
            <div class="tb-stat-card">
              <span class="tb-stat-num">{{ stats.dueSoon }}</span>
              <span class="tb-stat-label">7 天内到期</span>
            </div>
            <div class="tb-stat-card">
              <span class="tb-stat-num">{{ stats.noDue }}</span>
              <span class="tb-stat-label">无截止日</span>
            </div>
          </div>
          <div class="tb-stat-section">
            <h4>各状态分布</h4>
            <div v-for="row in stats.byStatus" :key="row.status.id" class="tb-stat-row">
              <span class="tb-stat-name"><span class="tb-cdot" :style="{ background: statusColor(row.status) }" />{{ row.status.name }}</span>
              <span class="tb-stat-bar">
                <span
                  class="tb-stat-fill"
                  :style="{ width: pct(stats.total, row.count) + '%', background: statusColor(row.status) }"
                />
              </span>
              <span class="tb-stat-val">{{ row.count }}</span>
            </div>
          </div>
          <div v-if="stats.byMember.length > 0" class="tb-stat-section">
            <h4>按成员（分到 / 完成）</h4>
            <div v-for="row in stats.byMember" :key="row.member.id" class="tb-stat-row">
              <span class="tb-stat-name">
                <span class="tb-avatar tb-avatar-sm" :style="{ background: memberColor(row.member.id) }">
                  {{ memberInitial(row.member.id) }}
                </span>
                {{ row.member.name }}
              </span>
              <span class="tb-stat-bar">
                <span class="tb-stat-fill" :style="{ width: pct(row.total, row.done) + '%' }" />
              </span>
              <span class="tb-stat-val">{{ row.done }}/{{ row.total }}</span>
            </div>
          </div>
          <div v-if="stats.byCategory.length > 0" class="tb-stat-section">
            <h4>按分类（完成率）</h4>
            <div v-for="row in stats.byCategory" :key="row.name" class="tb-stat-row">
              <span class="tb-stat-name"><span class="tb-cdot" :style="{ background: row.color }" />{{ row.name }}</span>
              <span class="tb-stat-bar">
                <span class="tb-stat-fill" :style="{ width: pct(row.total, row.done) + '%', background: row.color }" />
              </span>
              <span class="tb-stat-val">{{ row.done }}/{{ row.total }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 任务编辑 / 详情弹窗 -->
    <div v-if="taskDlg" class="tb-modal" @click.self="closeDialog">
      <div class="tb-dialog">
        <div class="tb-dialog-head">
          <span>{{ taskDlg.isNew ? "新建任务" : editing ? "编辑任务" : "任务详情" }}</span>
          <button class="tb-btn tb-btn-icon" @click="closeDialog">×</button>
        </div>
        <div class="tb-dialog-body">
          <label class="tb-field">
            <span class="tb-field-label">标题</span>
            <input v-model="taskDlg.draft.title" class="tb-input" :disabled="!editing" placeholder="任务标题" />
          </label>
          <div class="tb-field-grid">
            <label class="tb-field">
              <span class="tb-field-label">状态</span>
              <select v-model="taskDlg.draft.status" class="tb-select" :disabled="!editing">
                <option v-for="s in board!.statuses" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </label>
            <label class="tb-field">
              <span class="tb-field-label">分类</span>
              <select v-model="taskDlg.draft.category" class="tb-select" :disabled="!editing">
                <option value="">未分类</option>
                <option v-for="c in board!.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </label>
            <label class="tb-field">
              <span class="tb-field-label">优先级</span>
              <select v-model="taskDlg.draft.priority" class="tb-select" :disabled="!editing">
                <option :value="undefined">未设置</option>
                <option v-for="p in BOARD_PRIORITIES" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </label>
            <label class="tb-field">
              <span class="tb-field-label">进度 {{ taskDlg.draft.progress ?? 0 }}%</span>
              <input
                v-model.number="taskDlg.draft.progress"
                class="tb-range"
                type="range"
                min="0"
                max="100"
                step="5"
                :disabled="!editing"
              />
            </label>
            <label class="tb-field">
              <span class="tb-field-label">开始日期</span>
              <input v-model="taskDlg.draft.startDate" class="tb-input" type="date" :disabled="!editing" />
            </label>
            <label class="tb-field">
              <span class="tb-field-label">截止日期</span>
              <input v-model="taskDlg.draft.dueDate" class="tb-input" type="date" :disabled="!editing" />
            </label>
          </div>
          <div class="tb-field">
            <span class="tb-field-label">负责人（点击勾选）</span>
            <div class="tb-assignees">
              <button
                v-for="m in board!.members"
                :key="m.id"
                type="button"
                class="tb-chip"
                :class="{ active: (taskDlg.draft.assignees ?? []).includes(m.id) }"
                :disabled="!editing"
                @click="toggleDraftAssignee(m.id)"
              >
                <span class="tb-avatar tb-avatar-sm" :style="{ background: memberColor(m.id) }">
                  {{ memberInitial(m.id) }}
                </span>
                {{ m.name }}
              </button>
              <span v-if="board!.members.length === 0" class="tb-dim">看板还没有成员，点顶部「成员」添加</span>
            </div>
          </div>
          <label class="tb-field">
            <span class="tb-field-label">标签（空格分隔）</span>
            <input class="tb-input" :value="draftTagsText" :disabled="!editing" @input="onDraftTagsInput" />
          </label>
          <label class="tb-field">
            <span class="tb-field-label">备注</span>
            <textarea v-model="taskDlg.draft.notes" class="tb-textarea" rows="3" :disabled="!editing" />
          </label>
          <div class="tb-field">
            <span class="tb-field-label">关联文档（任务说明 / 设计文档等）</span>
            <template v-if="editing">
              <div v-for="(l, i) in taskDlg.draft.links ?? []" :key="i" class="tb-link-row">
                <input v-model="l.title" class="tb-input tb-input-sm" placeholder="名称（可空）" />
                <input v-model="l.url" class="tb-input" placeholder="/guides/xxx.md 或 https://…" />
                <button class="tb-btn tb-btn-icon" title="删除此链接" @click="removeLinkDraft(i)">🗑</button>
              </div>
              <button class="tb-btn" @click="addLinkDraft">＋ 添加链接</button>
              <span class="tb-hint-inline">支持站内路径（/xxx）、vault 笔记（xxx.md）、外链（https://）</span>
            </template>
            <template v-else>
              <a
                v-for="l in taskDlg.draft.links ?? []"
                :key="l.url + (l.title ?? '')"
                class="tb-tag tb-link"
                :href="linkHref(l)"
                :target="isExternalLink(l) ? '_blank' : undefined"
              >
                🔗 {{ linkTitle(l) }}
              </a>
              <span v-if="(taskDlg.draft.links ?? []).length === 0" class="tb-dim">无</span>
            </template>
          </div>
        </div>
        <div v-if="editing" class="tb-dialog-foot">
          <button v-if="!taskDlg.isNew" class="tb-btn tb-btn-danger" @click="removeTask(taskDlg.draft.id)">
            删除任务
          </button>
          <span class="tb-spacer" />
          <button class="tb-btn" @click="closeDialog">取消</button>
          <button class="tb-btn tb-btn-primary" :disabled="taskDlg.draft.title.trim() === ''" @click="applyTaskDialog">
            {{ taskDlg.isNew ? "创建" : "保存" }}
          </button>
        </div>
      </div>
    </div>

    <!-- 成员管理弹窗 -->
    <div v-if="memberDlg" class="tb-modal" @click.self="closeDialog">
      <div class="tb-dialog tb-dialog-sm">
        <div class="tb-dialog-head">
          <span>成员管理</span>
          <button class="tb-btn tb-btn-icon" @click="closeDialog">×</button>
        </div>
        <div class="tb-dialog-body">
          <div v-for="(m, i) in memberDlg.draft" :key="m.id" class="tb-member-row">
            <input v-model="m.color" class="tb-color" type="color" title="头像颜色" />
            <input v-model="m.name" class="tb-input" placeholder="成员名称" />
            <span class="tb-member-id">{{ m.id }}</span>
            <button class="tb-btn tb-btn-icon" title="删除成员" @click="removeMemberDraft(i)">🗑</button>
          </div>
          <p v-if="memberDlg.draft.length === 0" class="tb-dim">还没有成员</p>
          <button class="tb-btn" @click="addMemberDraft">＋ 添加成员</button>
          <p class="tb-hint">删除成员会同时从所有任务上移除该负责人。</p>
        </div>
        <div class="tb-dialog-foot">
          <span class="tb-spacer" />
          <button class="tb-btn" @click="closeDialog">取消</button>
          <button class="tb-btn tb-btn-primary" @click="applyMembersDialog">应用</button>
        </div>
      </div>
    </div>

    <!-- 看板配置弹窗（状态列 + 分类） -->
    <div v-if="configDlg" class="tb-modal" @click.self="closeDialog">
      <div class="tb-dialog">
        <div class="tb-dialog-head">
          <span>看板配置</span>
          <button class="tb-btn tb-btn-icon" @click="closeDialog">×</button>
        </div>
        <div class="tb-dialog-body">
          <h4 class="tb-config-title">状态列（顺序即看板列序）</h4>
          <div v-for="(s, i) in configDlg.statuses" :key="s.id" class="tb-member-row">
            <input v-model="s.color" class="tb-color" type="color" title="列颜色" />
            <input v-model="s.name" class="tb-input" placeholder="状态名" />
            <label class="tb-check" title="该列视为「完成」，参与完成率统计">
              <input v-model="s.done" type="checkbox" />完成列
            </label>
            <button class="tb-btn tb-btn-icon" title="上移" @click="moveConfigItem(configDlg.statuses, i, -1)">↑</button>
            <button class="tb-btn tb-btn-icon" title="下移" @click="moveConfigItem(configDlg.statuses, i, 1)">↓</button>
            <button class="tb-btn tb-btn-icon" title="删除状态（任务会归到首列）" @click="configDlg.statuses.splice(i, 1)">
              🗑
            </button>
          </div>
          <button class="tb-btn" @click="addConfigStatus">＋ 添加状态</button>
          <h4 class="tb-config-title">任务分类</h4>
          <div v-for="(c, i) in configDlg.categories" :key="c.id" class="tb-member-row">
            <input v-model="c.color" class="tb-color" type="color" title="分类颜色" />
            <input v-model="c.name" class="tb-input" placeholder="分类名" />
            <span class="tb-member-id">{{ c.id }}</span>
            <button class="tb-btn tb-btn-icon" title="删除分类（任务变为未分类）" @click="configDlg.categories.splice(i, 1)">
              🗑
            </button>
          </div>
          <button class="tb-btn" @click="addConfigCategory">＋ 添加分类</button>
          <p class="tb-hint">删除状态后，原列任务自动归到第一列；删除分类后对应任务变为「未分类」。</p>
        </div>
        <div class="tb-dialog-foot">
          <span class="tb-spacer" />
          <button class="tb-btn" @click="closeDialog">取消</button>
          <button class="tb-btn tb-btn-primary" @click="applyConfigDialog">应用</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tb-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 0.75rem 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  overflow: hidden;
}

/* 全屏：fixed 覆盖整个视口（与 MindMap 同规范，z-index 高于导航/侧栏） */
.tb-wrap.fullscreen {
  position: fixed;
  inset: 0;
  z-index: 2100;
  margin: 0;
  border: none;
  border-radius: 0;
  height: auto !important;
}

/* ---- 头部 ---- */
.tb-head {
  flex: none;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.tb-title-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.8rem 0.2rem;
  flex-wrap: wrap;
}

.tb-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.tb-spacer {
  flex: 1;
}

.tb-overall {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.tb-overall-bar {
  width: 120px;
  height: 6px;
  border-radius: 3px;
  background: var(--vp-c-divider);
  overflow: hidden;
}

.tb-overall-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--vp-c-brand-1);
  transition: width 0.3s ease;
}

.tb-overall-num {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}

.tb-overall-count {
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
}

.tb-status {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
  white-space: nowrap;
}

.tb-status.error {
  color: var(--vp-c-danger-1);
}

.tb-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--vp-c-green-3);
  flex: none;
}

.tb-dot.dirty {
  background: var(--vp-c-yellow-3);
}

.tb-dot.error {
  background: var(--vp-c-danger-1);
}

/* ---- 按钮（同 MindMap 口径） ---- */
.tb-btn {
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

.tb-btn:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.tb-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tb-btn-primary {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}

.tb-btn-primary:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
  color: #fff;
}

.tb-btn-danger {
  color: var(--vp-c-danger-1);
  border-color: var(--vp-c-danger-2);
}

.tb-btn-danger:hover:not(:disabled) {
  border-color: var(--vp-c-danger-1);
  color: var(--vp-c-danger-1);
}

.tb-btn-link {
  border: none;
  background: transparent;
  padding: 0.2rem 0.3rem;
}

.tb-btn-icon {
  padding: 0.2rem 0.4rem;
}

/* ---- Tab 与筛选 ---- */
.tb-tabs {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.2rem 0.8rem 0;
  border-bottom: 1px solid var(--vp-c-divider);
}

.tb-tab {
  font-size: 0.8rem;
  padding: 0.35rem 0.7rem;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.tb-tab:hover {
  color: var(--vp-c-brand-1);
}

.tb-tab.active {
  color: var(--vp-c-brand-1);
  border-bottom-color: var(--vp-c-brand-1);
  font-weight: 600;
}

.tb-tab-hint {
  margin-left: auto;
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
}

.tb-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.9rem;
  padding: 0.45rem 0.8rem 0.6rem;
  max-height: 150px;
  overflow-y: auto;
}

.tb-fgroup {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.tb-fgrow {
  flex: 1;
  min-width: 200px;
  justify-content: flex-end;
}

.tb-flabel {
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
  flex: none;
}

.tb-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.72rem;
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.tb-chip:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
}

.tb-chip.active {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.tb-check {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.72rem;
  color: var(--vp-c-text-2);
  white-space: nowrap;
  cursor: pointer;
}

.tb-select,
.tb-search {
  font-size: 0.75rem;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.tb-search {
  width: 100%;
  max-width: 220px;
}

/* ---- 主体 ---- */
.tb-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.tb-placeholder {
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

.tb-placeholder > span {
  font-size: 0.85rem;
  color: var(--vp-c-text-3);
}

.tb-ph-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.tb-ph-path {
  margin: 0;
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tb-ph-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
  max-width: 85%;
}

/* ---- 看板视图 ---- */
.tb-kanban {
  display: flex;
  align-items: stretch;
  gap: 0.6rem;
  padding: 0.7rem;
  min-height: 100%;
  overflow-x: auto;
}

.tb-column {
  flex: 0 0 240px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  max-height: 100%;
}

.tb-column.drop {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 2px var(--vp-c-brand-soft);
}

.tb-col-head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.6rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  border-bottom: 1px solid var(--vp-c-divider);
}

.tb-col-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tb-col-count {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  padding: 0 0.4rem;
}

.tb-col-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.5rem;
  overflow-y: auto;
}

.tb-col-empty {
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
  text-align: center;
  padding: 0.6rem 0;
}

.tb-col-add {
  flex: none;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 6px;
  background: transparent;
  color: var(--vp-c-text-3);
  font-size: 0.8rem;
  padding: 0.25rem;
  cursor: pointer;
}

.tb-col-add:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.tb-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  padding: 0.5rem 0.6rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tb-card:hover {
  border-color: var(--vp-c-brand-1);
}

.tb-card.dragging {
  opacity: 0.45;
}

.tb-card[draggable="true"] {
  cursor: grab;
}

.tb-card-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  line-height: 1.35;
  word-break: break-word;
}

.tb-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.tb-card-foot {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 20px;
}

.tb-tag {
  font-size: 0.68rem;
  line-height: 1;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

.tb-tag-plain {
  border-color: var(--vp-c-divider);
  color: var(--vp-c-text-3);
}

/* 关联文档链接 chip：虚线下划线强调可点；卡片上点击不冒泡进详情弹窗 */
a.tb-link {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-soft);
  background: var(--vp-c-brand-soft);
  text-decoration: none;
  cursor: pointer;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

a.tb-link:hover {
  border-color: var(--vp-c-brand-1);
  text-decoration: underline;
}

.tb-link-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.35rem;
}

.tb-link-row .tb-input {
  flex: 1;
}

.tb-input-sm {
  flex: 0 0 130px !important;
}

.tb-hint-inline {
  font-size: 0.7rem;
  color: var(--vp-c-text-3);
}

.tb-avatars {
  display: inline-flex;
  align-items: center;
}

.tb-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.62rem;
  color: #fff;
  flex: none;
  user-select: none;
}

.tb-avatar-sm {
  width: 18px;
  height: 18px;
  font-size: 0.58rem;
}

.tb-avatars .tb-avatar + .tb-avatar,
.tb-avatar-sm + .tb-avatar-sm {
  margin-left: -5px;
}

.tb-avatars .tb-avatar {
  border: 1.5px solid var(--vp-c-bg);
}

.tb-avatar.ghost {
  opacity: 0.55;
}

.tb-avatar-more {
  font-size: 0.66rem;
  color: var(--vp-c-text-3);
  margin-left: 0.25rem;
}

.tb-due {
  margin-left: auto;
  font-size: 0.68rem;
  color: var(--vp-c-text-3);
  white-space: nowrap;
}

.tb-due.overdue {
  color: var(--vp-c-danger-1);
  font-weight: 600;
}

.tb-due.done {
  text-decoration: line-through;
}

.tb-progress {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex: none;
}

.tb-progress-bar {
  width: 44px;
  height: 4px;
  border-radius: 2px;
  background: var(--vp-c-divider);
  overflow: hidden;
}

.tb-progress-fill {
  display: block;
  height: 100%;
  background: var(--vp-c-brand-1);
  border-radius: 2px;
}

.tb-progress-num {
  font-size: 0.66rem;
  color: var(--vp-c-text-3);
}

.tb-progress-lg .tb-progress-bar {
  width: 100%;
}

/* ---- 表格视图 ---- */
.tb-table-wrap {
  padding: 0.7rem;
  overflow-x: auto;
}

.tb-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.tb-table th,
.tb-table td {
  border-bottom: 1px solid var(--vp-c-divider);
  padding: 0.45rem 0.5rem;
  text-align: left;
  color: var(--vp-c-text-1);
  white-space: nowrap;
}

.tb-table th {
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
  font-weight: 600;
  user-select: none;
}

.tb-table th.sortable {
  cursor: pointer;
}

.tb-table th.sortable:hover {
  color: var(--vp-c-brand-1);
}

.tb-table tbody tr {
  cursor: pointer;
}

.tb-table tbody tr:hover {
  background: var(--vp-c-bg-soft);
}

.tb-td-title {
  font-weight: 600;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tb-prio-high {
  color: var(--vp-c-danger-1);
  font-weight: 600;
}

.tb-prio-medium {
  color: #d97706;
}

.tb-prio-low {
  color: var(--vp-c-text-3);
}

.tb-overdue-text {
  color: var(--vp-c-danger-1);
  font-weight: 600;
}

.tb-dim {
  color: var(--vp-c-text-3);
}

.tb-empty-row {
  text-align: center !important;
  color: var(--vp-c-text-3);
  padding: 1.5rem 0 !important;
}

/* ---- 日历视图 ---- */
.tb-calendar {
  padding: 0.7rem;
}

.tb-cal-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}

.tb-cal-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
  margin-right: 0.5rem;
}

.tb-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.tb-cal-weekday {
  text-align: center;
  font-size: 0.7rem;
  color: var(--vp-c-text-3);
  padding: 0.2rem 0;
}

.tb-cal-cell {
  min-height: 84px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 0.25rem;
  font-size: 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.tb-cal-cell.out {
  opacity: 0.4;
  background: var(--vp-c-bg-soft);
}

.tb-cal-cell.today {
  border-color: var(--vp-c-brand-1);
}

.tb-cal-cell.today .tb-cal-day {
  color: var(--vp-c-brand-1);
  font-weight: 700;
}

.tb-cal-cell.editable {
  cursor: pointer;
}

.tb-cal-cell.editable:hover {
  border-color: var(--vp-c-brand-1);
}

.tb-cal-day {
  font-size: 0.72rem;
  color: var(--vp-c-text-2);
  flex: none;
}

.tb-cal-task {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.66rem;
  line-height: 1.2;
  padding: 0.12rem 0.3rem;
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tb-cal-task:hover {
  background: var(--vp-c-brand-soft);
}

.tb-cal-task.done {
  color: var(--vp-c-text-3);
  text-decoration: line-through;
}

.tb-cal-task.overdue {
  color: var(--vp-c-danger-1);
  font-weight: 600;
}

.tb-cal-more {
  font-size: 0.64rem;
  color: var(--vp-c-text-3);
}

/* ---- 统计视图 ---- */
.tb-stats {
  padding: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tb-stats-note {
  margin: 0;
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
}

.tb-stat-cards {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.tb-stat-card {
  flex: 1 1 130px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 0.7rem 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  background: var(--vp-c-bg-soft);
}

.tb-stat-num {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
  line-height: 1.1;
}

.tb-stat-num small {
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--vp-c-text-3);
}

.tb-stat-num.danger {
  color: var(--vp-c-danger-1);
}

.tb-stat-label {
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
}

.tb-stat-section {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 0.7rem 0.8rem;
}

.tb-stat-section h4 {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-1);
}

.tb-stat-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.2rem 0;
}

.tb-stat-name {
  flex: 0 0 140px;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.76rem;
  color: var(--vp-c-text-1);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tb-stat-bar {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--vp-c-divider);
  overflow: hidden;
}

.tb-stat-fill {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--vp-c-brand-1);
  transition: width 0.3s ease;
}

.tb-stat-val {
  flex: none;
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
  min-width: 42px;
  text-align: right;
}

/* ---- 弹窗 ---- */
.tb-modal {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  padding: 1rem;
}

.tb-dialog {
  width: min(560px, 100%);
  max-height: 90%;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}

.tb-dialog-sm {
  width: min(460px, 100%);
}

.tb-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.tb-dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.8rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.tb-dialog-foot {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 0.9rem;
  border-top: 1px solid var(--vp-c-divider);
}

.tb-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tb-field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

.tb-field-label {
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
}

.tb-input,
.tb-textarea,
.tb-range {
  font-size: 0.8rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  width: 100%;
  box-sizing: border-box;
}

.tb-range {
  padding: 0;
  border: none;
  accent-color: var(--vp-c-brand-1);
}

.tb-input:disabled,
.tb-select:disabled,
.tb-textarea:disabled {
  opacity: 0.7;
}

.tb-textarea {
  resize: vertical;
}

.tb-assignees {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.tb-member-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.4rem;
}

.tb-member-row .tb-input {
  flex: 1;
}

.tb-color {
  width: 32px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  cursor: pointer;
  flex: none;
}

.tb-member-id {
  font-size: 0.66rem;
  color: var(--vp-c-text-3);
  flex: none;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tb-config-title {
  margin: 0.4rem 0 0.5rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-1);
}

.tb-config-title:first-child {
  margin-top: 0;
}

.tb-hint {
  margin: 0.5rem 0 0;
  font-size: 0.7rem;
  color: var(--vp-c-text-3);
}

.tb-cdot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
</style>
