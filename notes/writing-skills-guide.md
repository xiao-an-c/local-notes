# 网文写作技能手册

> 本仓库为《道士下山》项目安装的 12 个写作技能的用法沉淀。安装位置 `~/.agents/skills`（用户级），更新用 `npx skills update`。技能来源三个仓库：[tomsawyerhu/chinese-webnovel-skill](https://github.com/tomsawyerhu/chinese-webnovel-skill)（800★）、[danjdewhurst/story-skills](https://github.com/danjdewhurst/story-skills)（244★，活跃）、[tance-mang/chinese-webnovel-skills](https://github.com/tance-mang/chinese-webnovel-skills)（68★，内容独家）。

## 总览：四层流水线

```
管控层（基建）  story-init → character-management → voice-style → story-maintenance
                                                      （贯穿全程，canon 不乱）
规划层          webnovel-writing（卷纲/章纲/故事引擎）
起草层          expand（章纲→正文） ＋ scene-craft（场景结构）
打磨层          hook / shuangdian（钩子爽点）→ deslop（去AI味·表）→ human（人味·深）
```

先管控后写作：**canon 注册表建好，AI 再怎么生成都查得到、对得上、错不了**。

## 一、规划与起草

### webnovel-writing —— 总入口（tomsawyerhu，800★）

输入一段简介，按层输出：题材诊断 → 一句话 hook → premise → 故事引擎 → 第一卷规划 → 前 10-20 章章纲 → 开头/单章正文。**默认只输出当前最需要的一层**，不一次堆满。它解决的是"这本书卖什么、前 20 章靠什么推进、章末怎么留后劲"，不是文学表达。

### expand —— 章纲变正文（tance-mang）

- **人称默认第一人称**——要第三人称必须显式说明（咱们《下山》是第三人称，每次调用要带一句"第三人称"）
- 平台字数自带档位：**番茄长篇一章 2000-2200 字最佳**，起点 2000-3000
- 四条硬规矩：开头接上章钩子；对话+动作+心理交替；爽点当章落地（打脸四拍）；章尾断钩
- 自动对照**人设档案 + 语言指纹**（speech_profile）防 OOC；核对时间线/伤势/战力接续
- 参考库齐全：pov-guide / platform-profiles / trope-library / hook-library / show-emotion / anti-ai-checklist / sentence-rhythm / dark-style

### scene-craft —— 场景粒度手艺（danjdewhurst）

场景发平、中段塌腰、对话没潜台词、视角飘、设定堆着不会交付时用。按层选参考：scene-sequel（场景与续场的呼吸）、try-fail（尝试-失败递进）、scene-cards（多线排序）、dialogue-subtext（潜台词）、deep-pov（深视角）、exposition（设定交付）、flashbacks-time（闪回跳时）。**先规划后动笔**，改前必问清场景目的/视角/是否动 canon。

## 二、打磨四件套

### hook —— 钩子设计（tance-mang）

三类：**开篇钩**（七种结构：悬置危机/身份反差/结局倒挂/替身挡刀/金手指激活/日常爆破/反派开局，选 2-3 种各出一版）、**章尾钩**（八种，在情绪/动作**前一秒**断章）、**付费节点钩**。铁律：3 句内立危机；刀尖断章；埋钩 1-3 章必兑现；大钩套小钩。

### shuangdian —— 爽点设计（tance-mang）

- 三段式闭环：**压抑 → 蓄势 → 释放**（压抑越具体，释放越爽；番茄 1-2 章内必释放）
- 打脸四拍：**嘲讽 → 沉默 → 碾压 → 围观**（围观拍最常被漏，也最爽）
- 爽点升级链防疲劳：打脸同窗 → 长辈 → 宗门 → 天才 → 大势力 → 天道，同级不重复

### deslop —— 去 AI 味·表面层（tance-mang）

症状 → 改法对照表，覆盖：无缘无故的修辞、跨度不搭的引用、排比癖、喊情绪不演、翻译腔、句子过度工整、重复修辞、同义反复、极端词（非常/极其）、莫名升华、AI 转折词（然而/与此同时/值得一提的是）、端着的对话，以及标点规范（省略号用"……"、破折号一章最多一次、不用直角引号、不撒装饰符号）。**每个比喻过一道筛：它让读者更懂更爽了吗？没有就删。**

### human —— 人味·深层（tance-mang）

AI 味的本质是**缺人类失控感**：AI 写得像说明书（都解释、都闭环、都中立），人写得像情绪记录。五种诊断：情绪太平均 / 冲突太干净 / 句子太顺 / 人物太正常 / 太中立。三种注入：**非理性行为**（明知会输还赌）、**情绪不完整表达**（"他没说完那句话"）、**逻辑不完全闭环**（次要的事不解释尽）。原则：点睛不发疯（关键处 1-2 个失控点）；不牺牲爽和钩；主线大坑必须回收。**与 deslop 分工：先 deslop 治表，再 human 治里。**

## 三、canon 管控（danjdewhurst Story Skills 体系）

这是"人物、剧情、设定、物品不会乱"的答案——**结构化注册表 + ID 交叉引用 + 校验 CLI + git**，不靠 AI 记性：

### story-init —— 项目初始化

生成完整结构：`story.md`（书档）+ `characters/` `worldbuilding/` `plot/` `continuity/` `glossary/` 各带 `_index.md` 注册表 + `chapters/` 章节追踪。`--form novel` 记录体量目标（默认 8 万字）。**已有手稿不重跑 init**，用 `story import` 导入后从实体候选建档；`--force` 只补缺文件、绝不覆盖已有 story.md。

### character-management —— 人物档案

每个角色一个 `characters/{name-kebab}.md`（YAML frontmatter）：外貌、性格怪癖、动机（外在想要 vs 内在需要）、**voice-words / voice-avoid**（这人嘴边挂什么、绝不会说什么）、弧光（起点-转折-终点）、时间线大事。起名先跑 `story names "名字"`——**与任何已有角色/别名/地点/门派/物品/词条撞车直接报错**，形近警告。关系字段用 ID 互指，改一处自动提醒互更。

### series-continuity —— 系列互联

第二卷/前传/姐妹篇各是独立项目，通过 `story.md` 的 `follows / precedes` **双向回链**，`story series` 检查共享 canon（人物、地点、体系、词条是否跨书一致）。时间线和出版顺序分离：前传可以 book-number: 2。

### story-maintenance —— 巡检 CLI

从项目根目录跑：`story validate`（结构）/ `reindex`（重建注册表）/ `links`（断链）/ `continuity`（连续性）/ `prose`（文风违规计数）/ `voices`（人物声音漂移）/ `pacing` / `clues`（伏笔回收）/ `timeline` / `names`（撞名）/ `wordcount`。CLI 不可用时按 story-init 的约定手工维护。

### voice-style —— 文风表

`style-sheet.md` 是拷贝编辑记录：拼写/大写/数字/对话标点规范 + **每个主要说话者一句话 voice** + 盯梢清单（高频词、口头禅）。`story prose` 按它逐章数违规——文风漂移从"感觉"变成"计数"。

## 四、本项目的使用约定

1. **项目根**：`projects/xiuxian-story/`（canon 文件落这里，md 进站点侧栏，git 全程可回滚）
2. **人称**：第三人称——所有 expand 调用必须显式声明
3. **修改顺序**：hook/shuangdian（结构）→ deslop（表面）→ human（深层）→ voice-style 核表
4. **每次新增实体**（人物/丹药/矿/城/门派）：先 `story names` 查重，再入注册表
5. **每章交稿前**：`story validate` + `story continuity` 过一遍

## 五、相关阅读

- [[what-is-local-notes]] —— 本笔记库本身
- [[01-descent]] —— 第一幕成稿（技能试验田）
