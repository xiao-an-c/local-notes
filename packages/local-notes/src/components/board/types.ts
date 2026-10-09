/**
 * 任务看板数据 schema 与归一化（客户端安全：零依赖、不 import node/插件文件）。
 *
 * 数据源是 vault 内 `*.taskboard.json`（与 `<TaskBoard src>` 一一对应），
 * 结构完全每板自配置——成员/状态/分类都存在文件里，不同项目不同分类零成本。
 * 组件渲染一律消费 normalizeBoard() 归一化后的结果：字段缺失、类型不对、
 * 引用了不存在的 id 等脏数据在这里兜底（过滤/补默认），绝不把异常抛进渲染。
 */

/** 成员（看板参与者；color 缺省时由组件按 id 哈希取调色板） */
export interface BoardMember {
  id: string;
  name: string;
  color?: string;
}

/** 状态列（看板列 = statuses 数组顺序；done: true 标记「完成列」，统计/超期判定用它） */
export interface BoardStatus {
  id: string;
  name: string;
  done?: boolean;
  color?: string;
}

/** 任务分类（完全可配置；color 用于卡片色签与统计条） */
export interface BoardCategory {
  id: string;
  name: string;
  color?: string;
}

/** 优先级（内置三档；未知值按 none 显示） */
export type BoardPriority = "high" | "medium" | "low";

/** 任务 */
export interface BoardTask {
  id: string;
  title: string;
  /** BoardStatus.id；引用不存在的状态时归一化到首列 */
  status: string;
  /** BoardCategory.id；缺省/未知 = 未分类 */
  category?: string;
  /** BoardMember.id 列表；未知 id 渲染为灰底占位头像 */
  assignees?: string[];
  priority?: BoardPriority;
  /** 0–100；缺省按状态推导（完成列 → 100，否则 0） */
  progress?: number;
  /** YYYY-MM-DD */
  startDate?: string;
  /** YYYY-MM-DD（日历视图落格依据；超期判定） */
  dueDate?: string;
  /** YYYY-MM-DD：任务被移入完成列的日期（自动盖章；统计与日历可叠加显示） */
  doneAt?: string;
  tags?: string[];
  notes?: string;
  /** 关联文档链接（任务说明/设计文档等，外链/站内路由/vault 笔记皆可） */
  links?: BoardLink[];
}

/** 任务关联文档链接（title 可省略，展示时回退为 URL 文件名） */
export interface BoardLink {
  title?: string;
  url: string;
}

/** 看板数据根（*.taskboard.json 的内容） */
export interface BoardData {
  title?: string;
  members: BoardMember[];
  statuses: BoardStatus[];
  categories: BoardCategory[];
  tasks: BoardTask[];
}

/** 内置优先级档位（展示名与排序权重） */
export const BOARD_PRIORITIES: ReadonlyArray<{ id: BoardPriority; name: string; weight: number }> = [
  { id: "high", name: "高", weight: 0 },
  { id: "medium", name: "中", weight: 1 },
  { id: "low", name: "低", weight: 2 },
];

/** 成员/分类默认调色板（按 id 哈希取色，保证同 id 稳定同色） */
export const BOARD_PALETTE: ReadonlyArray<string> = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#84cc16",
];

/** 归一化时的兜底状态列（文件没有 statuses 或数组为空时使用） */
export function defaultStatuses(): BoardStatus[] {
  return [
    { id: "todo", name: "待办" },
    { id: "doing", name: "进行中" },
    { id: "done", name: "已完成", done: true },
  ];
}

/* ---------- 内部小工具（不导出） ---------- */

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** 生成短 id：编辑态新建任务/成员/分类用（时间戳 base36 + 随机，够防撞） */
export function genBoardId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normIdList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
}

/** YYYY-MM-DD 严格宽松解析（本地时区零点）；非法返回 null */
export function parseBoardDate(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return null;
  const [y, m, d] = v.trim().split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // 2 月 30 日这类伪日期会被 Date 顺延，校验往返一致
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** Date → YYYY-MM-DD（本地时区） */
export function formatBoardDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 今天的 YYYY-MM-DD */
export function todayStr(): string {
  return formatBoardDate(new Date());
}

/* ---------- 归一化 ---------- */

function normMembers(v: unknown): BoardMember[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: BoardMember[] = [];
  for (const raw of v) {
    const rec = asRecord(raw);
    if (!rec) continue;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: name || id,
      color: typeof rec.color === "string" && rec.color.trim() !== "" ? rec.color.trim() : undefined,
    });
  }
  return out;
}

function normStatuses(v: unknown): BoardStatus[] {
  const list = normMembers(v) as BoardStatus[];
  return list.map((s) => ({
    ...s,
    // done 判定：显式 done === true，或约定俗成的 id === "done"（老文件/手写文件兜底）
    done: s.done === true || s.id === "done",
  }));
}

function normCategories(v: unknown): BoardCategory[] {
  return normMembers(v) as BoardCategory[];
}

/** 链接归一化：过滤无 url/非对象的脏项，title 空串视为未设置 */
function normLinks(v: unknown): BoardLink[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: BoardLink[] = [];
  for (const raw of v) {
    const rec = asRecord(raw);
    if (!rec) continue;
    // url 允许 string；兼容手写成 { url: 123 } 之类的脏数据
    if (typeof rec.url !== "string" || rec.url.trim() === "") continue;
    const title = typeof rec.title === "string" && rec.title.trim() !== "" ? rec.title.trim() : undefined;
    out.push({ title, url: rec.url.trim() });
  }
  return out.length > 0 ? out : undefined;
}

/** vault 笔记路径 → 站点路由：foo/bar.md → /foo/bar（首页 README.md → /） */
function mdPathToRoute(url: string): string {
  const bare = url.replace(/\.md$/i, "");
  if (/^readme\.md$/i.test(url)) return "/";
  return bare.startsWith("/") ? bare : `/${bare}`;
}

/**
 * 链接展示 href：外链原样；「xxx.md」形态的 vault 笔记路径转站点路由
 * （保留查询与锚点），其余（站内 / 开头等）原样交由 VitePress 路由处理。
 */
export function linkHref(link: BoardLink): string {
  if (!/^https?:\/\//i.test(link.url) && !link.url.startsWith("//")) {
    const m = /^([^?#]*\.md)([?#].*)?$/i.exec(link.url);
    if (m) return mdPathToRoute(m[1]) + (m[2] ?? "");
  }
  return link.url;
}

/** 链接展示标题：title 优先，否则从 URL 取文件名（去扩展名/尾斜杠） */
export function linkTitle(link: BoardLink): string {
  if (link.title) return link.title;
  try {
    const path = link.url.split("#")[0].split("?")[0];
    const last = path.replaceAll("\\", "/").split("/").filter(Boolean).pop();
    if (last) return last.replace(/\.(md|html?)$/i, "") || link.url;
  } catch {
    /* 保底返回原 url */
  }
  return link.url;
}

/** 是否外部链接（新标签打开） */
export function isExternalLink(link: BoardLink): boolean {
  return /^https?:\/\//i.test(link.url) || link.url.startsWith("//");
}

function normTasks(v: unknown, statusIds: Set<string>, firstStatus: string): BoardTask[] {
  if (!Array.isArray(v)) return [];
  const out: BoardTask[] = [];
  for (const raw of v) {
    const rec = asRecord(raw);
    if (!rec) continue;
    const id = typeof rec.id === "string" && rec.id.trim() !== "" ? rec.id.trim() : genBoardId("task");
    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    const status = typeof rec.status === "string" && statusIds.has(rec.status) ? rec.status : firstStatus;
    const priority =
      rec.priority === "high" || rec.priority === "medium" || rec.priority === "low" ? rec.priority : undefined;
    const progress =
      typeof rec.progress === "number" && Number.isFinite(rec.progress)
        ? Math.min(100, Math.max(0, Math.round(rec.progress)))
        : undefined;
    const startDate = parseBoardDate(rec.startDate) ? (rec.startDate as string).trim() : undefined;
    const dueDate = parseBoardDate(rec.dueDate) ? (rec.dueDate as string).trim() : undefined;
    const doneAt = parseBoardDate(rec.doneAt) ? (rec.doneAt as string).trim() : undefined;
    out.push({
      id,
      title: title || "(未命名任务)",
      status,
      category: typeof rec.category === "string" && rec.category.trim() !== "" ? rec.category.trim() : undefined,
      assignees: normIdList(rec.assignees),
      priority,
      progress,
      startDate,
      dueDate,
      doneAt,
      tags: normIdList(rec.tags),
      notes: typeof rec.notes === "string" ? rec.notes : undefined,
      links: normLinks(rec.links),
    });
  }
  return out;
}

/**
 * 把任意来源（fetch 到的 JSON）归一化为可渲染的 BoardData：
 * - statuses/categories/members/tasks 缺失或含脏项 → 过滤/补默认；
 * - statuses 为空 → 兜底「待办/进行中/已完成」三列；
 * - 引用未知状态的任务 → 归到首列（不出现在幽灵列）。
 */
export function normalizeBoard(raw: unknown, fallbackTitle: string): BoardData {
  const rec = asRecord(raw);
  const statuses = normStatuses(rec?.statuses);
  const resolvedStatuses = statuses.length > 0 ? statuses : defaultStatuses();
  const statusIds = new Set(resolvedStatuses.map((s) => s.id));
  return {
    title: typeof rec?.title === "string" && rec.title.trim() !== "" ? rec.title.trim() : fallbackTitle,
    members: normMembers(rec?.members),
    statuses: resolvedStatuses,
    categories: normCategories(rec?.categories),
    tasks: normTasks(rec?.tasks, statusIds, resolvedStatuses[0]?.id ?? "todo"),
  };
}

/* ---------- 派生口径（统计/展示共用，保证各视图口径一致） ---------- */

/** 状态是否「完成列」 */
export function isDoneStatus(status: BoardStatus): boolean {
  return status.done === true;
}

/** 任务所属状态对象（未知状态返回 undefined，调用方自行兜底） */
export function taskStatus(task: BoardTask, statuses: BoardStatus[]): BoardStatus | undefined {
  return statuses.find((s) => s.id === task.status);
}

/** 任务是否已完成（完成列判定，不看 progress 数字） */
export function isTaskDone(task: BoardTask, statuses: BoardStatus[]): boolean {
  const st = taskStatus(task, statuses);
  return st ? isDoneStatus(st) : false;
}

/** 任务进度口径：显式 progress 优先，否则按状态推导（完成 → 100，未完成 → 0） */
export function taskProgress(task: BoardTask, statuses: BoardStatus[]): number {
  if (typeof task.progress === "number") return task.progress;
  return isTaskDone(task, statuses) ? 100 : 0;
}

/** 整体完成进度 = 各任务进度的平均值（空板 → 0） */
export function overallProgress(tasks: BoardTask[], statuses: BoardStatus[]): number {
  if (tasks.length === 0) return 0;
  const sum = tasks.reduce((acc, t) => acc + taskProgress(t, statuses), 0);
  return Math.round(sum / tasks.length);
}

/** 任务是否超期：未完成且 dueDate < today */
export function isOverdue(task: BoardTask, statuses: BoardStatus[], today = todayStr()): boolean {
  if (isTaskDone(task, statuses)) return false;
  const due = parseBoardDate(task.dueDate);
  if (!due) return false;
  return formatBoardDate(due) < today;
}

/** 按 id 哈希从调色板取色（同 id 稳定同色；显式 color 优先由调用方处理） */
export function paletteColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return BOARD_PALETTE[h % BOARD_PALETTE.length];
}

/** 优先级排序权重（未知值排最后） */
export function priorityWeight(p: BoardTask["priority"]): number {
  const found = BOARD_PRIORITIES.find((x) => x.id === p);
  return found ? found.weight : BOARD_PRIORITIES.length;
}
