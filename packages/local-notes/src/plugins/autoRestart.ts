import path from "node:path";
import { utimesSync, watch } from "node:fs";
import type { Plugin } from "vite";
import type { LocalNotesOptions } from "../options.ts";
import { RESTART_PENDING_EVENT, resolveLocalNotesOptions } from "../options.ts";
import { isSelfRecentWrite } from "./selfWrite.ts";

/**
 * 重启预告事件名常量本体在 ../options（双端共享模块，原因见该处文档）。
 * 本插件职责：touch 触发 restart 前先经 ws 广播该事件（此刻 ws 仍存活，
 * 消息必达），主题端 restartBridge 收到后按 bootId 轮询新 server 并刷新。
 */

/** restart-ping 端点路由（apiBase 相对路径） */
export function restartPingRoute(apiBase: string): string {
  return `${apiBase}/restart-ping`.replace(/\/{2,}/g, "/");
}

/**
 * 每个 dev server 实例唯一的启动标识。
 *
 * 必须在插件工厂内生成而非模块级：restart 时 VitePress 重载 config 并重新调用
 * 插件工厂 → 新实例新值；而 local-notes 自身模块在 Node ESM 缓存下不会重新
 * 执行，模块级常量在 restart 前后不变，restartBridge 将永远等不到变化。
 */
function newBootId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * vault 笔记增删自动重启插件（仅 dev 生效）
 *
 * 为什么需要：VitePress 的侧栏、搜索索引、路由表都在配置加载时一次性生成——
 * 新增 md 文件只有重启 dev server 后才会进入菜单。自动重启达到「新建即出现在
 * 站点」的动态体验。
 *
 * 实现要点：不直接调 server.restart()——实测它会撞上 VitePress 模块级
 * MiniSearch 缓存（重启后初始 add 事件对已索引文档重复 add →
 * "duplicate ID" 异常 → 重启失败）。改为 touch 站点配置文件触发 Vite 原生
 * config watcher 的重启路径，该路径实测稳定。build 模式每次全新生成，
 * 无需此逻辑（apply: serve 仅 dev 生效）。
 *
 * 浏览器刷新闭环（与主题端 restartBridge 配合，见文件顶部 RESTART_PENDING_EVENT
 * 注释）：touch 前先经 ws 广播重启预告，主题端轮询本实例的 restart-ping 端点，
 * 发现 restart 后新 server 就绪即自动刷新页面，侧栏即时更新、无需手动刷新。
 *
 * 监听实现（L4 修正）：**不依赖 server.watcher**——Vite 8 原生 watcher 只监听
 * config root（站点目录）与已加载模块，vault 目录（srcDir）里的文件增删不会
 * 产生 add/unlink 事件（L4 回归实测：新建笔记后无任何事件、永不重启）。
 * 故插件自建 fs.watch(vaultDir, { recursive: true })（macOS/Windows 原生支持，
 * Linux Node ≥20 支持口）监听 vault，路径过滤规则不变。fs.watch 不可用时
 * 退回 server.watcher 监听并告警（保守降级）。
 *
 * configPath 解析优先级：显式 options.configPath > Vite configResolved 时
 * 实际加载的 configFile（VitePress 站点即 .vitepress/config.*；VitePress 2
 * dev 下 vite configFile 为空，实际使用必须显式传入）。
 *
 * 监听范围：vault 内 .md 的新增/删除；路径任一段命中跳过目录（内置 +
 * extraSkipDirs 合并）、以 .tmp 结尾（原子写的中间文件）、或为库自身刚写过的
 * 文件（selfWrite tracker——编辑保存 PUT 走 .tmp→rename，rename 事件的
 * filename 已是最终 .md 名，不排除会把「保存」误判成「新增」，导致保存 →
 * 重启 → 页面自动刷新 → 编辑态被销毁）时忽略。
 */
export function vaultMdAutoRestart(options: LocalNotesOptions): Plugin {
  const resolved = resolveLocalNotesOptions(options);
  const root = path.resolve(resolved.vaultDir).replaceAll("\\", "/");
  const skipDirs = new Set(resolved.skipDirs);
  const explicitConfigPath = resolved.configPath;
  // 实例级 bootId：工厂每次被调用（含 restart 后 config 重载）都生成新值
  const bootId = newBootId();

  let registeredAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let configFilePath = explicitConfigPath ?? "";
  let fsWatcher: ReturnType<typeof watch> | null = null;
  /** 上次实际 touch 时刻：同一批增删事件可能同时到达 fs.watch 与 server.watcher
   *  两条通道，冷却期内忽略后续触发，避免一次增删连跳两次重启 */
  let lastTouchAt = 0;

  const norm = (p: string) => p.replaceAll("\\", "/");
  /** 事件路径过滤：vault 内 .md 返回其归一化绝对路径；.tmp 中间文件、
   *  跳过目录（工程/隐私目录）任一段命中、或 vault 外路径返回 null。
   *  绝对路径（server.watcher 事件）与相对 root 的子路径（fs.watch 事件）都接受 */
  const vaultMdEventPath = (f: unknown): string | null => {
    if (typeof f !== "string" || !f.endsWith(".md")) return null;
    let p = norm(f);
    if (!p.startsWith("/")) p = `${root}/${p}`;
    if (!p.startsWith(root + "/")) return null;
    // 原子写中间文件（.tmp）不是 md；跳过目录（工程/隐私目录）任一段命中即忽略
    if (p.endsWith(".tmp")) return null;
    const rel = p.slice(root.length + 1);
    if (rel.split("/").some((seg) => skipDirs.has(seg))) return null;
    return p;
  };

  return {
    name: "local-notes:md-auto-restart",
    apply: "serve",
    configResolved(config) {
      // 显式传入优先；否则跟随 Vite 实际加载的配置文件（touch 它即触发原生重启）
      if (!configFilePath) configFilePath = config.configFile ?? "";
    },
    configureServer(server) {
      registeredAt = Date.now();
      const schedule = () => {
        // 冷却期：距上次 touch 不足 3s 的事件（同批事件双通道到达/连续保存）忽略
        if (Date.now() - lastTouchAt < 3000) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          if (!configFilePath) {
            server.config.logger.warn(
              "[local-notes:md-auto-restart] 未找到站点配置文件路径（configFile 为空），跳过自动重启；可通过 options.configPath 显式指定",
            );
            return;
          }
          // 重启预告：ws 此刻仍然存活（touch 之后旧 server 优雅关闭、Vite client
          // 只重连不刷新），主题端收到后轮询 bootId，新 server 就绪即自动刷新
          const ping = restartPingRoute(resolved.apiBase);
          server.ws.send({
            type: "custom",
            event: RESTART_PENDING_EVENT,
            data: { ping },
          });
          // touch 配置文件：mtime 变化触发 Vite 原生 config restart
          const now = new Date();
          utimesSync(configFilePath, now, now);
          lastTouchAt = Date.now();
        }, 800);
      };
      // 启动后 5 秒内忽略事件：初始扫描会对既有文件补发 add，避免重启死循环
      const guarded = (f: unknown) => {
        if (Date.now() - registeredAt < 5000) return;
        const p = vaultMdEventPath(f);
        if (!p) return;
        // 库自身写盘（编辑保存 PUT 的 .tmp→rename 原子写）不触发重启：保存只是
        // 内容变更、侧栏结构不变，而重启 → 页面自动刷新会销毁正在进行的编辑。
        // 外部工具（Obsidian 等）的写入未登记在 tracker 里，仍照常触发。
        if (isSelfRecentWrite(p)) return;
        schedule();
      };

      // restart-ping 端点：主题端 restartBridge 在重启预告后轮询这里，
      // bootId 变化即证明 restart 后的新 server 已就绪，此时刷新才能拿到
      // 重新生成的侧栏/siteData（过早刷新只会打到尚未关闭的旧 server）
      const pingRoute = restartPingRoute(resolved.apiBase);
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (url !== pingRoute) return next();
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify({ bootId }));
      });

      // 主通道：插件自建递归 fs.watch，覆盖 vault 内文件增删（Vite watcher 不管 srcDir）
      try {
        fsWatcher = watch(root, { recursive: true }, (_event, filename) => guarded(filename));
      } catch {
        server.config.logger.warn(
          "[local-notes:md-auto-restart] fs.watch(recursive) 不可用，退回 server.watcher 监听（可能收不到 vault 内新增文件事件）",
        );
      }
      // 兜底通道：server.watcher 事件照旧接（部分 Vite 版本会转发 srcDir 事件）
      server.watcher.on("add", guarded);
      server.watcher.on("unlink", guarded);
      server.watcher.on("close", () => {
        fsWatcher?.close();
        fsWatcher = null;
      });
    },
  };
}
