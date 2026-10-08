import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";
import { BiDirectionalLinks } from "@nolebase/markdown-it-bi-directional-links";
import { generateSidebar } from "vitepress-sidebar";
import {
  localNotesMarkdownItPlugins,
  localNotesPlugins,
  mergeVaultAssetSidebar,
} from "../packages/local-notes/src/index.ts";
// 站点自带的字计数能力：构建期把每页汉字/字符/段落数写成标题下的一枚徽标
// （口径与实现见 .vitepress/word-count/，命令行版见 scripts/wordcount.ts）
import { wordCountPlugin } from "./word-count/index.ts";

// ---------------------------------------------------------------------------
// 目录约定（唯一集中声明处）：
// - site/          文档根 = VitePress srcDir = local-notes vault。站点全部
//                  Markdown 都住这里：index（首页）/graph/viewer + guides/
//                  等内容子目录，路由从文档根算起（site/graph.md → /graph），
//                  无需任何 rewrites
// - 仓库根的 packages/（库源码）、tools/（脚本）、.agents/（agent 文档）
//                  都在文档根之外，页面扫描天然不可见
// - site/templates/ 新建笔记模板：属于 vault 机制所以住在文档根内，
//                  用 srcExclude + 侧栏排除挡住页面化/菜单化
// ---------------------------------------------------------------------------
// vault 根 = site/。用绝对路径定位，不依赖启动命令的 cwd。
const vaultDir = fileURLToPath(new URL("../site/", import.meta.url));

// ---------------------------------------------------------------------------
// 侧栏链接规范化：vitepress-sidebar 只扫文件系统——「文件夹分组链接」输出的是
// 源 md 路径（如 /components/index.md），而该路由在构建产物中是 /components/。
// 深遍历把结尾的 index.md 剥掉，得到真实路由。
// ---------------------------------------------------------------------------
type SidebarNode = { link?: string; items?: SidebarNode[] };
function normalizeSidebarLinks(items: SidebarNode[]): SidebarNode[] {
  for (const node of items) {
    if (node.link) node.link = node.link.replace(/\/index\.md$/, "/");
    if (node.items) normalizeSidebarLinks(node.items);
  }
  return items;
}

export default defineConfig({
  title: "Notes 文档站",
  description: "基于 local-notes 源码直用的本地 Markdown 文档站",

  // 文档根 = site/
  srcDir: "site",

  // vault 内允许指向尚未创建页面的 wikilink，忽略死链
  ignoreDeadLinks: true,

  // 模板是机器用的 md，不生成页面、不进侧栏（排除路径相对 srcDir）
  srcExclude: ["templates/**"],

  vite: {
    // local-notes 源码直用（packages/local-notes/src，无 dist、无 node_modules
    // 拷贝）：源码经相对导入进入 vite 源码管道，.vue 由站点 vue 插件编译、
    // MarkdownEditor 里的 monaco "?worker" 动态导入由 worker 插件处理，
    // 无需任何依赖排除/外部化配置。
    // ⭐ 接入点 1/2：vite 插件组一次装齐——反链/图谱索引、附件静态服务、
    // 思维导图保存 API、markdown 读写/新建 API（409 冲突保护）、笔记增删
    // 自动重启、HMR 竞态防护；传 outDir 后追加 build 附件拷贝（静态产物
    // 也能看 PDF/导图，只是降级只读）。
    plugins: localNotesPlugins({
      vaultDir,
      // 新建笔记模板目录（相对 vault 根 = site/templates）
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
          excludesPatterns: ["templates/**", "node_modules/**", "dist/**"],
          noNoMatchedFileWarning: true,
          // 产出相对当前文档的链接，交给 VitePress 原生重写为页面 URL
          isRelativePath: true,
        }),
      );

      // 字计数徽标：每页 H1 下方显示「汉字 / 字符 / 段落」，悬停给全五项口径。
      // exclude 匹配相对文档根的路径——首页/图谱/附件三个站点功能页不显示
      // 徽标；各内容子目录自己的 index.md 是正经内容页，照常显示。
      // 单页要关就在它的 frontmatter 写 wordCount: false。
      md.use(wordCountPlugin, {
        exclude: ["index.md", "graph.md", "viewer.md"],
      });
    },
  },

  themeConfig: {
    nav: [
      { text: "首页", link: "/" },
      { text: "图谱", link: "/graph" },
      { text: "模板与新建笔记", link: "/guides/templates" },
    ],
    // 动态扫描文档根生成侧栏：新建/删除笔记后，库的自动重启 + 页面自动
    // 刷新会把变更即时反映到菜单。分组标题取目录 index.md 的一级标题。
    // mergeVaultAssetSidebar 把 vault 内 PDF/EPUB 附件合并进对应目录分组
    sidebar: mergeVaultAssetSidebar(
      normalizeSidebarLinks(
        generateSidebar({
        // 相对 process.cwd()（仓库根）——文档根即 site/
        documentRootPath: "site",
        // 不进菜单的：模板、知识图谱、附件（后两个是站点功能页，页面保留、
        // 顶栏「图谱」与附件链接可达，只是不算内容）；首页 index.md 按惯例
        // 由生成器自动跳过。其余文件/文件夹按结构动态进菜单
        excludeByGlobPattern: ["templates/**", "graph.md", "viewer.md"],
        // 菜单文字取笔记本身的中文标题：优先 frontmatter title（图谱/附件页），
        // 否则取正文首个一级标题（笔记页），都没有才回落到文件名
        useTitleFromFrontmatter: true,
        useTitleFromFileHeading: true,
        // 目录分组标题取该目录 index.md 的一级标题，并让分组本身指向它。
        // 菜单顺序不做额外排序——生成器的默认遍历序就是文件名字母序
        //（与文件管理器一致）；将来个别条目要手工置顶，可用
        // manualSortFileNameByPriority 列文件名实现
        useFolderTitleFromIndexFile: true,
        useFolderLinkFromIndexFile: true,
        // 标题已来自笔记本身，不再对首字母做大写化
        capitalizeFirst: false,
        collapsed: true,
      }),
      ),
      { vaultDir },
    ),
  },
});
