/**
 * Markdown 编辑视图与「新建笔记」对话框的全局单例状态。
 *
 * 「编辑此页」按钮（EditThisPage.vue）只负责调用 openMdEditor()，
 * 真正的编辑器视图（MarkdownEditor.vue）由主题 Layout 挂在 layout-bottom
 * 插槽、跨路由持久渲染——路由切换不会打断正在进行的编辑，同时全站同一
 * 时间只存在一个编辑视图。
 * 「＋ 新建笔记」按钮（NavBarNewNote.vue，顶栏 nav-bar-content-before 插槽）
 * 只负责 openNewNoteDialog()，
 * 对话框视图（NewNoteDialog.vue）同挂 layout-bottom，模式与编辑器一致。
 */
import { reactive } from "vue";
import { getLocalNotesThemeConfig } from "../../theme/config";

export const mdEditorState = reactive({
  /** 编辑视图是否打开 */
  open: false,
  /** 正在编辑的 vault 相对路径（如 notes/xxx.md） */
  path: "",
  /** 打开序号：作为组件 key，重复打开同一路径也强制重建全新实例 */
  nonce: 0,
});

export function openMdEditor(vaultPath: string): void {
  mdEditorState.path = vaultPath;
  mdEditorState.nonce += 1;
  mdEditorState.open = true;
}

export function closeMdEditor(): void {
  mdEditorState.open = false;
}

/**
 * 「新建笔记」对话框的全局单例状态（与编辑视图同款模式）。
 *
 * 对话框本体（NewNoteDialog.vue）由主题挂在 layout-bottom 插槽常驻渲染
 * （默认隐藏）；「＋ 新建笔记」按钮（NavBarNewNote.vue，顶栏）只负责
 * openNewNoteDialog()，挂载点与 MarkdownEditor 一致，保证跨路由可用。
 */
export const newNoteDialogState = reactive({ open: false });

export function openNewNoteDialog(): void {
  newNoteDialogState.open = true;
}

export function closeNewNoteDialog(): void {
  newNoteDialogState.open = false;
}

/**
 * 「新建笔记后待打开编辑器」标记（sessionStorage，跨 full reload 存活）。
 *
 * 为什么需要：vault 内新增 md 会触发自动重启插件（touch 站点配置 →
 * vite restart），重启期间 Vite 客户端会强制 full reload、内存状态全部丢失。
 * NewNoteDialog 创建成功后把目标笔记写入这里，并在「站点刷新中」状态里等待
 * ping 恢复后主动跳转；若 Vite 抢先 reload 了页面，则由 NewNoteDialog 挂载时
 * 的消费者接棒：不在目标页 → 继续跳转；已在目标页 → openMdEditor 并清除标记。
 */
const PENDING_OPEN_KEY = "md-editor:pending-open";

/** 标记有效期：重启实测数秒，2 分钟足够宽裕，防止陈旧标记在很久之后突然触发 */
const PENDING_OPEN_TTL_MS = 120_000;

interface PendingOpen {
  /** 目标笔记 vault 相对路径（如 notes/xxx.md） */
  path: string;
  /** 目标站点 URL（如 /notes/xxx） */
  url: string;
  /** 写入时刻（ms），过期判定用 */
  at: number;
}

/**
 * vault 相对路径 → 站点内 URL（rewrites 的正向映射：去 .md；首页文件 → /；
 * 目录 index → 目录路径/）。首页文件名来自主题配置 homeFile（默认 README.md）。
 */
export function vaultPathToSiteUrl(vaultPath: string): string {
  let p = vaultPath.replaceAll("\\", "/");
  if (p.toLowerCase().endsWith(".md")) p = p.slice(0, -3);
  const homeNoExt = getLocalNotesThemeConfig().homeFile.replace(/\.md$/i, "");
  if (p.toLowerCase() === homeNoExt.toLowerCase()) return "/";
  if (p.toLowerCase().endsWith("/index")) return `/${p.slice(0, -"index".length)}`;
  return `/${p}`;
}

export function setPendingOpenEditor(vaultPath: string): void {
  const item: PendingOpen = { path: vaultPath, url: vaultPathToSiteUrl(vaultPath), at: Date.now() };
  try {
    sessionStorage.setItem(PENDING_OPEN_KEY, JSON.stringify(item));
  } catch {
    /* sessionStorage 不可用（隐私模式等）时放弃自动打开，跳转本身仍会执行 */
  }
}

/**
 * 读取待打开标记；已过期则顺手清除并返回 null。
 * 注意「未过期但不匹配当前页」时不清除——full reload 后还要靠它继续跳转。
 */
export function readPendingOpenEditor(): PendingOpen | null {
  try {
    const raw = sessionStorage.getItem(PENDING_OPEN_KEY);
    if (!raw) return null;
    const item = JSON.parse(raw) as PendingOpen;
    if (
      typeof item?.path !== "string" ||
      typeof item?.url !== "string" ||
      typeof item?.at !== "number" ||
      Date.now() - item.at > PENDING_OPEN_TTL_MS
    ) {
      sessionStorage.removeItem(PENDING_OPEN_KEY);
      return null;
    }
    return item;
  } catch {
    return null;
  }
}

export function clearPendingOpenEditor(): void {
  try {
    sessionStorage.removeItem(PENDING_OPEN_KEY);
  } catch {
    /* 忽略 */
  }
}
