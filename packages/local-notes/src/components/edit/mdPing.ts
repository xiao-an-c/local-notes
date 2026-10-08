/**
 * 「dev 编辑模式」可用性探测：GET <apiBase>/md/ping，Promise 做模块级缓存全站共享。
 *
 * dev 会话内 md API 插件恒在（探测恒通过）；build/preview 产物无此路由
 * （404/网络错误）→ 探测失败即判定「非编辑模式」，编辑类入口（「编辑此页」、
 * 顶栏「＋ 新建笔记」）整体隐藏，与 MindMap 组件的编辑按钮同款降级策略。
 *
 * 缓存 Promise 而非结果：同一次页面会话内所有入口共享同一次探测请求，
 * 路由间不重复发；dev→build 切换是整页刷新，模块级缓存自然失效，无需额外逻辑。
 */
import { getLocalNotesThemeConfig, joinApi } from "../../theme/config";

let pingPromise: Promise<boolean> | null = null;

export function probeMdPing(): Promise<boolean> {
  pingPromise ??= fetch(joinApi(getLocalNotesThemeConfig(), "/md/ping"))
    .then((res) => res.ok)
    .catch(() => false);
  return pingPromise;
}
