import type { Plugin, ResolvedConfig } from "vite";

/**
 * 防御 @vitejs/plugin-vue 的 HMR 竞态崩溃（仅 dev 生效）。
 *
 * 现象：dev 下编辑文件（尤在 server 重启窗口期，如 vault 笔记增删触发
 * 配置文件 touch → vite restart）时，vite:vue 的 handleHotUpdate 在
 * options.value.compiler 尚为 null 的实例上执行，抛
 * "Cannot read properties of null (reading 'invalidateTypeCache')"，
 * 浏览器弹出红色错误 overlay。
 *
 * 处理：configResolved 时包一层 try/catch——竞态事件丢弃即可，
 * 页面刷新后自然恢复正确状态（远好于崩溃弹层）。
 */
export function vueHmrGuardPlugin(): Plugin {
  return {
    name: "local-notes:vue-hmr-guard",
    apply: "serve",
    configResolved(config: ResolvedConfig) {
      for (const p of config.plugins) {
        const plugin = p as { name?: string; handleHotUpdate?: unknown };
        if (plugin?.name !== "vite:vue" || typeof plugin.handleHotUpdate !== "function") continue;
        const original = plugin.handleHotUpdate as (this: unknown, ctx: { file?: string }) => Promise<unknown>;
        (plugin as { handleHotUpdate?: unknown }).handleHotUpdate = async function (
          this: unknown,
          ctx: { file?: string },
        ) {
          try {
            return await original.call(this, ctx);
          } catch (e) {
            config.logger.warn(
              `[local-notes:vue-hmr-guard] 拦截一次 HMR 竞态崩溃（${(e as Error)?.message ?? e}）` +
                ` file=${ctx?.file ?? "?"}，如页面未更新请手动刷新`,
            );
            return [];
          }
        };
      }
    },
  };
}

