import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";
import { BiDirectionalLinks } from "@nolebase/markdown-it-bi-directional-links";
import { generateSidebar } from "vitepress-sidebar";
import {
  localNotesMarkdownItPlugins,
  localNotesPlugins,
  mergeVaultAssetSidebar,
} from "local-notes";

// ---------------------------------------------------------------------------
// This demo IS the vault: the folders around this file (notes/, journal/,
// projects/, templates/, assets/) are ordinary Markdown-keeper directories
// with no naming convention. local-notes makes zero assumptions about the
// structure — everything it needs to know is passed right here.
// ---------------------------------------------------------------------------
// vault 根 = demo 目录本身。用绝对路径定位，不依赖启动命令的 cwd。
const vaultDir = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig({
  title: "local-notes demo",
  description: "A structure-agnostic Markdown vault published by local-notes",

  // vault 内允许指向尚未创建页面的 wikilink，忽略死链
  ignoreDeadLinks: true,

  // 仓库文档不是笔记内容：README.md / LICENSE 由 Git 托管，不进站点
  // （README.md 尤其必须排除——VitePress 会把它当作 index.md 的同名路由）
  srcExclude: ["README.md", "LICENSE"],

  vite: {
    // ⭐ 接入点 1/2：vite 插件组一次装齐——反链/图谱索引、附件静态服务、
    // 思维导图保存 API、markdown 读写/新建 API（409 冲突保护）、笔记增删
    // 自动重启、HMR 竞态防护；传 outDir 后追加 build 附件拷贝（静态产物
    // 也能看 PDF/导图，只是降级只读）。
    plugins: localNotesPlugins({
      vaultDir,
      // 新建笔记模板目录（相对 vault 根）；不传则模板能力整体关闭
      templateDir: "templates",
      // build 附件拷贝目标（VitePress outDir）
      outDir: fileURLToPath(new URL("./dist", import.meta.url)),
      // VitePress 2 dev 下 vite configFile 为空，自动重启插件需显式拿到
      // 配置文件路径才能 touch 触发重启（笔记增删后新页面即时生效）
      configPath: fileURLToPath(new URL("./config.mts", import.meta.url)),
    }),
  },

  markdown: {
    config(md) {
      // markdown-it 形态的插件走次级入口（PDF 链接自动内嵌），
      // 必须注册在双向链接插件之前
      for (const p of localNotesMarkdownItPlugins({ vaultDir })) md.use(p);
      // [[wikilink]] 渲染交给社区插件（库不重复造轮子，可换成任意同类实现）
      md.use(
        BiDirectionalLinks({
          dir: vaultDir,
          includesPatterns: ["**/*.md"],
          excludesPatterns: ["node_modules/**", ".vitepress/**", "dist/**"],
          noNoMatchedFileWarning: true,
          // 产出相对当前文档的链接，交给 VitePress 原生重写为页面 URL
          isRelativePath: true,
        }),
      );
    },
  },

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Graph", link: "/graph" },
      { text: "Attachments", link: "/viewer" },
    ],
    // 动态扫描 vault 生成侧栏（推荐做法）：新建/删除笔记后，库的自动重启 +
    // 页面自动刷新会把变更即时反映到菜单。也可换成任意 sidebar 生成器或
    // 手写静态数组（那样新增文件不会自动进菜单）。
    // mergeVaultAssetSidebar 把 vault 内 PDF/EPUB 附件合并进对应目录分组
    sidebar: mergeVaultAssetSidebar(
      generateSidebar({
        // 相对 process.cwd()（demo 目录）——vault 根即 demo 目录本身
        documentRootPath: ".",
        excludeByGlobPattern: [
          "node_modules/**",
          ".vitepress/**",
          "dist/**",
          "templates/**",
          // 仓库文档（与上方 srcExclude 保持一致，别让它们进侧栏）
          "README.md",
          "LICENSE",
        ],
        capitalizeFirst: true,
        collapsed: true,
      }),
      { vaultDir },
    ),
  },
});
