// 事件名常量取自 ../options（双端共享模块）——不能从 ../plugins/autoRestart
// 导入：那是 node 侧插件文件（import node:fs），客户端导入会在 vite dev 下把
// node 内建模块拖进浏览器模块图，运行即抛 externalized 错误（详见 options.ts）。
import { RESTART_PENDING_EVENT } from "../options.ts";

/**
 * dev 重启桥：vault 笔记增删 → autoRestart 插件 touch 配置 → VitePress restart
 * 后，让**已打开的页面**自动刷新（否则侧栏停留在旧 siteData，新文件不进菜单）。
 *
 * 背景：VitePress restart 优雅关闭旧 server 时，Vite client 收到的是 clean
 * close——只静默重连 ws、不 location.reload（实测）。因此插件在 touch 前经
 * ws 广播 RESTART_PENDING_EVENT（此刻 ws 仍存活，消息必达），本模块收到后：
 *
 * 1. 轮询事件 data.ping（`<apiBase>/restart-ping`，autoRestart 插件提供）；
 * 2. 第一次成功响应记为基线 bootId（通常来自尚未关闭的旧 server）；
 * 3. 某次响应 bootId 与基线不同 ⇒ restart 后的新 server 已就绪 ⇒ 刷新页面，
 *    此时新 server 的 siteData/侧栏已包含新增/删除后的笔记。
 *
 * 仅 dev 生效：`import.meta.env.DEV` 在 build 下为 false 且 `import.meta.hot`
 * 会被 Vite 静态替换为 undefined，整段逻辑被摇树移除，不进生产产物。
 *
 * 边界：
 * - restart 窗口内 fetch 失败属预期（旧 server 已关、新 server 未就绪），静默重试；
 * - 轮询 30s 未观察到新 server 则放弃（防死轮询），退化为手动刷新的旧行为；
 * - 连续多次 restart（如同仓库多站点 config 相互触发）天然收敛到最后一次刷新。
 */
export function setupRestartBridge(): void {
  if (!import.meta.env.DEV) return;
  const hot = import.meta.hot;
  if (!hot) return;

  let polling = false;

  hot.on(RESTART_PENDING_EVENT, (data) => {
    if (polling) return;
    const ping = typeof (data as { ping?: unknown })?.ping === "string" ? (data as { ping: string }).ping : null;
    if (!ping) return;
    polling = true;

    const startedAt = Date.now();
    let baseline: string | null = null;
    const timer: ReturnType<typeof setInterval> = setInterval(() => {
      if (Date.now() - startedAt > 30_000) {
        clearInterval(timer);
        polling = false;
        return;
      }
      fetch(ping, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ bootId?: string }>) : null))
        .then((body) => {
          if (!body) return; // restart 窗口（连接拒绝/非 2xx），下一轮再试
          const boot = body.bootId ?? "";
          if (!boot) return;
          if (baseline === null) {
            baseline = boot; // 旧 server 的 bootId（restart 尚未发生）
            return;
          }
          if (boot !== baseline) {
            clearInterval(timer);
            location.reload();
          }
        })
        .catch(() => {
          /* server 重启窗口，继续轮询 */
        });
    }, 600);
  });
}
