import {
  resolveLocalNotesThemeOptions,
  type LocalNotesThemeOptions,
  type ResolvedLocalNotesThemeOptions,
} from "../options.ts";

/**
 * 主题（客户端）配置的模块级存取。
 *
 * localNotesTheme(options) 在主题入口处调用 setLocalNotesThemeConfig 落配置；
 * 各组件（EditThisPage / MarkdownEditor / MindMap / NewNoteDialog 等）经
 * getLocalNotesThemeConfig 读取——SSG 与客户端各自初始化一次，值一致。
 * 组件单独使用（未经 localNotesTheme 组装）时拿到全默认值。
 */

let current: ResolvedLocalNotesThemeOptions = resolveLocalNotesThemeOptions();

/** 落配置（仅主题入口 localNotesTheme 调用；重复调用以最后一次为准） */
export function setLocalNotesThemeConfig(options: LocalNotesThemeOptions): ResolvedLocalNotesThemeOptions {
  current = resolveLocalNotesThemeOptions(options);
  return current;
}

/** 读配置（组件 setup/事件中随时可取，拿到的是填充默认值后的结果） */
export function getLocalNotesThemeConfig(): ResolvedLocalNotesThemeOptions {
  return current;
}

/** dev API 路由前缀拼接：joinApi(cfg, "/md/ping") → "<apiBase>/md/ping" */
export function joinApi(cfg: ResolvedLocalNotesThemeOptions, suffix: string): string {
  const base = cfg.apiBase.replace(/\/+$/, "");
  return suffix.startsWith("/") ? base + suffix : `${base}/${suffix}`;
}

/** 资源 URL 前缀规范化（保证以 "/" 开头结尾，便于 startsWith 与 slice 去前缀） */
export function normalizeAssetPrefix(raw: string): string {
  let p = raw.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  if (!p.endsWith("/")) p = `${p}/`;
  return p;
}

/** 去掉 src 上的资源前缀，得到 vault 相对路径（decodeURIComponent 容错） */
export function stripAssetPrefix(cfg: ResolvedLocalNotesThemeOptions, src: string): string {
  const prefix = normalizeAssetPrefix(cfg.assetPrefix);
  const raw = src.startsWith(prefix) ? src.slice(prefix.length) : src;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
