---
name: html-report
description: 把 Markdown 报告/文档转成自包含 HTML 页（浅底研报风、ECharts 图表、CSS 时间轴、可折叠术语卡、图/表切换），输出到 site/ 并可用站点的 HtmlView 组件内嵌阅读。只要用户想"生成 HTML 版""转成 HTML 报告""做一个 HTML 页面""把这篇报告做成网页""内嵌一份可视化报告"，就启用本技能。产出物是自包含 HTML（CDN 引 ECharts，无构建依赖），不是站点页面组件。
version: 1.0.0
---

# HTML 报告生成（自包含 HTML 输出层）

> **定位**：把**已经写完的 Markdown 报告**转成自包含 HTML 排版层。本技能只管
> **输出格式**，不替代内容生产——分析/结论必须先在 Markdown 里完成，HTML 是
> 排版与可视化，不是第二次研究。
> 来源：ResearchAnalysis `company-full` Phase 4 的 `html-研报规范.md` 实战验证版
> （2026-09-29 恒瑞全景实跑通过），去耦通用化适配本站。

---

## 0. 输出位置与站点内嵌（本站约定）

- 输出到 `site/` 下按内容归属建目录，如 `site/reports/主题_YYYYMMDD.html`
- 站点内嵌：Markdown 正文直接写
  `<HtmlView src="/vault/reports/主题_YYYYMMDD.html" height="720px" />`
  （`/vault/` 前缀 = 文档根相对路径；dev 与 build 产物均可渲染）
- 自包含定义：**单文件**（内联 CSS + 内联 `<script>`），外部只允许 ECharts CDN

## 1. 交付前必做：JS 语法自检（最高优先级）

HTML 里手写的内联 `<script>`（尤其 ECharts `option`）**极易括号/引号失配**——
一处失配整页 `<script>` SyntaxError，**所有图表全不渲染**（不是一个图空，是全空）。

```bash
# 把 HTML 里的内联 <script> 体抽出来存 .js，再校验
python3 - <<'PY'
import re
html = open('主题_YYYYMMDD.html', encoding='utf-8').read()
blocks = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', html, re.S)
open('/tmp/_check.js','w',encoding='utf-8').write("\n;\n".join(blocks))
PY
node --check /tmp/_check.js && echo "JS_SYNTAX_OK"
```

- 报错 → 按行列定位修到通过再交付。**"生成了文件"≠完成，图表能渲染才算完成。**
- 高发错误：`=>({...})` 少个 `)`、`series:[{...}},...]` 多个 `}`、字符串跨行断裂、
  legend.data 里混游离裸值。

## 2. 整体风格

- **浅底深字研报风**，避免暗色仪表盘风
- **首屏结论先行**：核心结论卡＋关键指标 KPI 卡放最顶上，先判断后论证
- 中文财经语境**红涨绿跌**（`.up{color:#d9342b} .down{color:#12a05c}`）
- 每个数据块附近标注**来源＋时点**（来源共享的表格可在表头/表尾统一标注）

## 3. 内容映射（Markdown 报告 → HTML）

| Markdown 报告节 | HTML 呈现方式 |
|---|---|
| 核心论点/摘要 | 首屏结论卡（引述块样式，判断原样保留） |
| 关键指标 | KPI 网格卡片（每卡：指标名 → 当前读数大字 → 参考线小字） |
| 分节要点 | 摘要表或分节卡片 |
| 时间演化（大事记/阶段史） | **CSS 时间轴**（竖线+圆点+日期标签，零 JS 风险） |
| 数值趋势（多年/多季） | ECharts 柱+线双轴图，**图/表可切换** |
| 同比/环比 | ECharts 柱+同比线双轴图 |
| 分位数/极值 | ECharts 折线+markPoint 标峰值/当前 |
| 结构映射/对照关系 | HTML 表格或卡片（关系型内容用 CSS/SVG，天然规避括号失配） |
| 最该盯的变量 | 监控卡片（变量/为什么/怎么盯/两种走向） |
| 术语/名词解释 | 三组可折叠 `<details>` 词条卡，默认收起、点开细读 |
| 数据缺口 | 灰底提示框，诚实列出 |
| 多视角观点 | 多列卡片 |

## 4. ECharts 骨架（填 data，别从零手敲）

引库（CDN，放 `<head>`）：
```html
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
```

柱+线双轴（趋势/同比通用骨架）：
```javascript
echarts.init(document.getElementById('c1')).setOption({
  tooltip: { trigger: 'axis' },
  legend: { data: ['营收', '归母净利'], top: 0 },
  grid: { left: 55, right: 60, top: 45, bottom: 35 },
  xAxis: { type: 'category', data: years, axisLine: { lineStyle: { color: '#d7dbe3' } } },
  yAxis: [
    { type: 'value', name: '营收(亿)', splitLine: { lineStyle: { color: '#f0f2f5' } } },
    { type: 'value', name: '净利(亿)', splitLine: { show: false } }
  ],
  series: [
    { name: '营收', type: 'bar', barWidth: '46%', itemStyle: { color: '#7f9bea', borderRadius: [3,3,0,0] }, data: rev },
    { name: '归母净利', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 7, lineStyle: { width: 3, color: '#d9342b' }, itemStyle: { color: '#d9342b' }, data: np }
  ]
});
```

图/表切换（默认图，一键切表查精确值）：
```javascript
function sw(cid, tid, btn) {
  var c = document.getElementById(cid), t = document.getElementById(tid);
  var btns = btn.parentNode.getElementsByTagName('button');
  for (var i = 0; i < btns.length; i++) { btns[i].className = ''; }
  btn.className = 'on';
  if (btn.textContent === '图') { c.className = ''; t.className = 'hide'; }
  else { c.className = 'hide'; t.className = ''; }
}
```

CSS 时间轴（零 JS 风险）：
```html
<div class="tl">
  <div class="item">
    <div class="d">2021-2022</div>
    <div class="t">阶段名称</div>
    <div class="x">旧结构 → 新结构（一句话）</div>
  </div>
</div>
```
```css
.tl { border-left: 2px solid #dfe4f2; margin: 8px 0 4px 6px; padding-left: 20px; }
.tl .item { position: relative; padding-bottom: 18px; }
.tl .item::before {
  content: ''; position: absolute; left: -27px; top: 6px; width: 10px; height: 10px;
  border-radius: 50%; background: #2b5fd9; border: 2px solid #fff; box-shadow: 0 0 0 1.5px #c3cdec;
}
```

## 5. 图表质量细则

- **图/表可切换**：数字密集的趋势数据块做"图/表切换"（默认看图看趋势，一键切表查精确值）
- **双轴量级差**：两个序列差一个量级以上必须双轴，小序列改折线挂第二轴
- **空值不入图**：缺基数的早期阶段不硬塞占位，x 轴从有数据处起
- **多取一个周期**：做同比图前多取一期数据，图上不出现前段空值
- 关系型内容（阶段史/映射/传导链）用 **CSS/SVG**；**数值型才用 ECharts**

## 6. 术语折叠卡

非专业读者是报告的第一读者——专业缩写不解释，报告等于没写。`<details>`
默认收起、点开细读、不占首屏：

```html
<details class="glossary">
  <summary>📖 术语手册（点开）</summary>
  <table>
    <tr><th>词</th><th>大白话解释（是什么＋类比）</th><th>在本报告的语境</th></tr>
    <tr><td>示例术语</td><td>「类比」：一句话讲清机制</td><td>报告中如何使用它</td></tr>
  </table>
</details>
```
```css
details.glossary { background: #fff; border-radius: 12px; padding: 12px 18px; box-shadow: 0 1px 4px rgba(30,42,80,.06); margin-bottom: 12px; }
details.glossary summary { cursor: pointer; font-size: 14.5px; font-weight: 700; color: #1d3a8f; }
details.glossary[open] summary { margin-bottom: 10px; }
```

写法纪律：①只收本报告实际用到的词；②**同一东西多个名字列全**（别名=别名=别名）；
③普通词条＝大白话（是什么＋生活化类比）＋语境；④承载报告核心判断的词不做一句话
翻译，在 `<details>` 内用「★ 词条名＋维度表」深拆（维度按词条类型选：作用/上游/
生产/利润构成/销售，或 量什么/怎么读/被谁修饰）。

## 7. KPI 卡与状态色

关键指标卡（每卡三行）：
- 指标名 → 当前读数（大字）→ 参考线（小字，注明口径）
- 状态色：✅ 绿 `#12a05c`、⚠️ 橙 `#e6a23c`、❌ 红 `#d9342b`

## 8. 免责声明（含投资判断时强制）

含具体投资判断的 HTML 页脚必须附固定文案：
> **免责声明**：以上内容基于公开数据和量化分析，仅供参考，不构成投资建议。市场有风险，投资需谨慎。任何投资决策应结合个人风险承受能力、资金状况和投资目标独立判断，必要时咨询持牌专业机构。过往表现不预示未来收益。

数据说明段注明：数据来源与时点；二手引用需核实原文；口径差异需注明。

---
*v1.0.0 · 2026-10 · 提取自 ResearchAnalysis company-full Phase 4（html-研报规范 v2.2，去耦通用化）*
