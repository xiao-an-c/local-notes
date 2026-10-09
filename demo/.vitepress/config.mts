import { fileURLToPath } from "node:url";
import { BiDirectionalLinks } from "@nolebase/markdown-it-bi-directional-links";
import { withLocalNotes } from "local-notes";
// 站点自带的字计数能力：构建期把每页汉字/字符/段落数写成标题下的一枚徽标
// （口径与实现见 .vitepress/word-count/，命令行版见 tools/wordcount.ts）
import { wordCountPlugin } from "./word-count/index.ts";

// ---------------------------------------------------------------------------
// 目录约定（唯一集中声明处）：
// - demo/site/    文档根 = VitePress srcDir = local-notes vault。站点全部
//                 Markdown 都住这里：index（首页）/graph/viewer + guides/
//                 等内容子目录，路由从文档根算起（site/graph.md → /graph），
//                 无需任何 rewrites
// - 仓库根的 packages/（主题包）、tools/（脚本）、.agents/（agent 文档）
//                 都在文档根之外，页面扫描天然不可见
// - site/templates/ 新建笔记模板：属于 vault 机制所以住在文档根内，
//                 由 withLocalNotes 自动加进 srcExclude 与侧栏排除
// ---------------------------------------------------------------------------
// vault 根 = demo/site/。用绝对路径定位，不依赖启动命令的 cwd。
const vaultDir = fileURLToPath(new URL("../site/", import.meta.url));

// ---------------------------------------------------------------------------
// node 侧接线（vite 插件、markdown-it 插件、侧栏生成、srcExclude、
// ignoreDeadLinks、outDir/configPath 探测）全部交给 withLocalNotes；
// 本文件只保留真正属于 demo 自己的东西：标题、wikilink 插件选型、
// 字数徽标、顶栏导航、侧栏排除哪些站点功能页。
// ---------------------------------------------------------------------------
export default withLocalNotes(
  {
    // vault 根（绝对路径，见上）
    vaultDir,
    // 新建笔记模板目录（相对 vault = site/templates）
    templateDir: "templates",
    sidebar: {
      // 不进侧栏菜单的站点功能页：图谱页与附件预览页（页面保留、顶栏
      // 「图谱」与附件链接可达，只是不算内容）
      excludeByGlobPattern: ["graph.md", "viewer.md"],
      // 菜单顺序 = 文档阅读顺序（默认文件名字母序 ≠ 阅读顺序）。
      // manualSortFileNameByPriority 匹配裸文件名/目录名，每层目录生效：
      // 列表内的按此顺序置顶，未列的按字母序排其后
      manualSortFileNameByPriority: [
        // guides/ 子页的阅读顺序
        "getting-started.md",
        "configuration.md",
        "markdown.md",
        "components.md",
        "assets.md",
        "editing.md",
        "extras.md",
      ],
    },
  },
  {
    title: "Notes 文档站",
    description: "基于 local-notes 主题包的本地 Markdown 文档站（demo）",

    markdown: {
      config(md) {
        // [[wikilink]] 渲染交给社区插件（库不重复造轮子，可换成任意同类实现）；
        // 须注册在库的 markdown-it 插件之后——withLocalNotes 已保证此顺序
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
        { text: "使用指南", link: "/guides/" },
      ],
      // 侧栏主体由 withLocalNotes 生成（文件夹结构即菜单 + 附件合并），
      // 这里不重复声明
    },
  },
);
