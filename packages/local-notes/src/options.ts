/**
 * local-notes 配置项与默认值（L1 定型；插件/主题实现层只消费这里解析出的值）。
 *
 * ## 零假设原则
 *
 * 库对笔记库（vault）的目录结构零假设：不预设任何目录名——模板目录、
 * 首页文件、排除页面等全部由使用方站点在接入时通过 options 显式传入。
 * 任何「编号分区」「固定模板目录」之类的约定都属于使用方项目，不属于本库。
 */

/**
 * 内置跳过目录：扫描笔记/附件/链接、校验 API 读写路径时一律跳过
 * （工程/工具/隐藏目录与常见站点目录——任何使用者都不该让笔记写进这些目录）。
 * 可用 extraSkipDirs 追加项目特有的目录名。
 */
export const DEFAULT_SKIP_DIRS: readonly string[] = [
  "node_modules",
  ".git",
  ".obsidian",
  ".claude",
  ".agents",
  ".workbuddy",
  ".pnpm-store",
  ".vitepress",
  ".quartz-cache",
  ".trash",
  "web",
  "web-vitepress",
  "dist",
];

/** 静态资源（PDF/EPUB/思维导图数据等）URL 前缀默认值 */
export const DEFAULT_ASSET_PREFIX = "/vault/";

/** dev 服务 API 路由前缀默认值（md 读写、思维导图保存等） */
export const DEFAULT_API_BASE = "/api";

/** 作为站点首页的 vault 根目录文件默认值（rewrites 为 index.md） */
export const DEFAULT_HOME_FILE = "README.md";

/** 附件预览页路由默认值（侧栏附件链接到 `<viewerPath>#<vault 相对路径>`） */
export const DEFAULT_VIEWER_PATH = "/viewer";

/**
 * 重启预告事件名（server → 浏览器，Vite ws custom 事件）。
 *
 * 为什么放在本文件：node 侧 autoRestart 插件与客户端 restartBridge 都要用
 * 这个常量，而本文件零依赖、双端导入都安全——若放插件文件里，客户端导入会
 * 把 node:fs 拖进浏览器模块图（vite dev 不做 tree-shaking，模块一执行就抛
 * "Module node:fs has been externalized" 错误；build 因 tree-shaking 不暴露）。
 *
 * 背景：VitePress restart 优雅关闭旧 dev server 时，Vite client 收到的是
 * clean close——其断线轮询逻辑只在「非干净断开」时自动 reload，因此 restart 后
 * 浏览器页面会静默重连 ws 但**不刷新**，侧栏停留在旧 siteData（实测缺陷）。
 * 故 touch 触发 restart 前，先经 ws 广播本事件；主题端 restartBridge 收到后
 * 轮询 restart-ping 端点，发现新 server 就绪即 location.reload()。
 */
export const RESTART_PENDING_EVENT = "local-notes:restart-pending";

/**
 * 服务端/构建插件组配置（传入 localNotesPlugins 及各独立插件工厂）。
 */
export interface LocalNotesOptions {
  /** vault 根目录。绝对路径，或相对 VitePress 站点 root 的路径（由插件实现层解析） */
  vaultDir: string;
  /** 附加跳过目录（与内置默认 DEFAULT_SKIP_DIRS 合并） */
  extraSkipDirs?: string[];
  /** 新建笔记可选模板所在目录（相对 vault）。默认 undefined = 不启用模板 */
  templateDir?: string;
  /** 静态资源 URL 前缀，默认 "/vault/" */
  assetPrefix?: string;
  /** dev API 路由前缀（服务端路由与前端 fetch 共用），默认 "/api" */
  apiBase?: string;
  /** 作为站点首页的 vault 根目录文件名，默认 "README.md"（rewrites 为 index.md） */
  homeFile?: string;
  /** 附件预览页路由（侧栏附件链接 `<viewerPath>#<assetPrefix><相对路径>`），默认 "/viewer" */
  viewerPath?: string;
  /** 站点工程页（图谱页/附件预览页等）的 vault 相对路径列表，供 rewrites 与 srcExclude 使用，默认 [] */
  excludedPages?: string[];
  /** build 模式附件拷贝目标目录（VitePress outDir），默认由调用方传入 */
  outDir?: string;
  /**
   * 笔记增删自动重启所 touch 的站点配置文件路径（触发 Vite 原生 config restart）。
   * 默认 undefined = 由插件在 configResolved 时自动取 Vite 实际加载的 configFile。
   */
  configPath?: string;
  /**
   * 是否启用 ```mermaid 围栏渲染（mermaidFencePlugin → MermaidFence 组件），
   * 默认 true。站点想换别的 mermaid 方案时置 false。
   */
  mermaid?: boolean;
}

/**
 * 主题（客户端）配置（传入 localNotesTheme）。
 */
export interface LocalNotesThemeOptions {
  /** 静态资源 URL 前缀（前端拼附件/导图 URL 用），默认 "/vault/"，应与服务端 assetPrefix 一致 */
  assetPrefix?: string;
  /** 附件预览页路由，默认 "/viewer" */
  viewerPath?: string;
  /** dev API 路由前缀（前端 fetch 编辑/导图接口用），默认 "/api"，应与服务端 apiBase 一致 */
  apiBase?: string;
  /**
   * 作为站点首页的 vault 根目录文件名，默认 "README.md"。
   * 「编辑此页」与新建后跳转做 rewrites 逆映射（index.md → 该文件）用。
   */
  homeFile?: string;
  /** 不显示编辑入口的站点页面（rewrites 后的 relativePath，如图谱页/附件预览页），默认 [] */
  excludedPages?: string[];
  /** 「新建笔记」对话框默认选中的目录（vault 相对路径）。默认 undefined = 选中首个顶层目录 */
  defaultNewNoteDir?: string;
  /**
   * 知识图谱页文件夹配色（顶层文件夹名 → CSS 颜色）。本库对 vault 目录名
   * 零假设，配色属于使用方项目——未传或未列出的文件夹用中性灰 #8c8c8c。
   */
  graphFolderColors?: Record<string, string>;
  /** 是否显示「✎ 编辑此页」入口（Monaco 编辑器视图仍挂载，仅隐藏入口按钮），默认 true */
  enableEditThisPage?: boolean;
  /** 是否显示顶栏「＋ 新建笔记」按钮；同时不挂载新建对话框，默认 true */
  enableNewNote?: boolean;
}

/** 填充默认值后的插件组配置（实现层只消费这个，避免默认值散落） */
export interface ResolvedLocalNotesOptions {
  vaultDir: string;
  /** 内置 + 附加合并后的跳过目录（保序去重） */
  skipDirs: string[];
  templateDir?: string;
  assetPrefix: string;
  apiBase: string;
  homeFile: string;
  viewerPath: string;
  excludedPages: string[];
  outDir?: string;
  configPath?: string;
  mermaid: boolean;
}

/** 填充默认值后的主题配置 */
export interface ResolvedLocalNotesThemeOptions {
  assetPrefix: string;
  viewerPath: string;
  apiBase: string;
  homeFile: string;
  excludedPages: string[];
  defaultNewNoteDir?: string;
  graphFolderColors: Record<string, string>;
  enableEditThisPage: boolean;
  enableNewNote: boolean;
}

/** 合并内置与附加跳过目录（保序去重） */
export function mergeSkipDirs(extraSkipDirs?: string[]): string[] {
  return [...new Set([...DEFAULT_SKIP_DIRS, ...(extraSkipDirs ?? [])])];
}

/** 填充 LocalNotesOptions 的默认值 */
export function resolveLocalNotesOptions(options: LocalNotesOptions): ResolvedLocalNotesOptions {
  return {
    vaultDir: options.vaultDir,
    skipDirs: mergeSkipDirs(options.extraSkipDirs),
    templateDir: options.templateDir,
    assetPrefix: options.assetPrefix ?? DEFAULT_ASSET_PREFIX,
    apiBase: options.apiBase ?? DEFAULT_API_BASE,
    homeFile: options.homeFile ?? DEFAULT_HOME_FILE,
    viewerPath: options.viewerPath ?? DEFAULT_VIEWER_PATH,
    excludedPages: options.excludedPages ?? [],
    outDir: options.outDir,
    configPath: options.configPath,
    mermaid: options.mermaid ?? true,
  };
}

/** 填充 LocalNotesThemeOptions 的默认值 */
export function resolveLocalNotesThemeOptions(
  options: LocalNotesThemeOptions = {},
): ResolvedLocalNotesThemeOptions {
  return {
    assetPrefix: options.assetPrefix ?? DEFAULT_ASSET_PREFIX,
    viewerPath: options.viewerPath ?? DEFAULT_VIEWER_PATH,
    apiBase: options.apiBase ?? DEFAULT_API_BASE,
    homeFile: options.homeFile ?? DEFAULT_HOME_FILE,
    excludedPages: options.excludedPages ?? [],
    defaultNewNoteDir: options.defaultNewNoteDir,
    graphFolderColors: options.graphFolderColors ?? {},
    enableEditThisPage: options.enableEditThisPage ?? true,
    enableNewNote: options.enableNewNote ?? true,
  };
}
