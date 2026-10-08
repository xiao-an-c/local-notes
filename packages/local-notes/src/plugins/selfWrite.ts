/**
 * 库自身写盘追踪（进程内共享状态）。
 *
 * 为什么需要：mdApi 的保存/新建走 `<dest>.tmp` + `renameSync` 原子写，
 * rename 在 fs.watch 里产生的事件 filename 已是最终 `.md` 名——autoRestart
 * 的 `.tmp` 过滤拦不住，会把「保存已有笔记」误判为「新增笔记」而触发重启；
 * 重启又引发页面自动刷新（restartBridge），正在进行的编辑直接被销毁。
 *
 * 原则：**库自己写的文件不触发自动重启**（内容变更不影响侧栏结构），
 * 外部工具（Obsidian、编辑器、脚本）的增删仍照常触发。
 *
 * mdApi 在写盘前调用 `trackSelfWrite`，autoRestart 的事件过滤里用
 * `isSelfRecentWrite` 短路。窗口期数秒即可覆盖 fs.watch 的异步派发延迟。
 */

const selfWrites = new Map<string, number>();

/** 记录一次库自身的写盘（写盘动作发起前调用，杜绝事件先于记录的竞态） */
export function trackSelfWrite(absPath: string): void {
  const now = Date.now();
  selfWrites.set(absPath, now);
  // 顺手清理过期项，Map 不随编辑次数无界增长
  for (const [p, ts] of selfWrites) {
    if (now - ts > SELF_WRITE_WINDOW_MS * 3) selfWrites.delete(p);
  }
}

/** 该路径是否在窗口期内被库自身写过（是则 autoRestart 应忽略事件） */
export function isSelfRecentWrite(absPath: string, windowMs = SELF_WRITE_WINDOW_MS): boolean {
  const ts = selfWrites.get(absPath);
  if (!ts) return false;
  if (Date.now() - ts > windowMs) {
    selfWrites.delete(absPath);
    return false;
  }
  return true;
}

const SELF_WRITE_WINDOW_MS = 5_000;
