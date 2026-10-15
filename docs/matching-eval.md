# 匹配评测 — Task 2A（Before 基线 + After 验收）

日期：2026-09-06。同一套 18 条 golden fixtures，对比改算法前的 `matchStory`（Before，冻结）与 Phase 2 的 `decideMatch`（After）。
两版执行链与评测口径见 `src/game/agent/matching.eval.ts` 文件头，最终公式与推导见 `src/game/agent/matching.ts` 文件头。
Before 表由 `scripts/matching-eval-baseline.mts` 打印，After 表由 `src/game/agent/matching.eval.test.ts` 打印。

## Baseline 结果（Top1 7/18）

汇总：**Top1 7/18 (38.9%)、Top3 10/18 (55.6%)、collectedTop1 0**（COLLECTED 场景 8 条全部落空）。
候选池：STORIES 12（matchStory 可见）+ COLLECTED 10（不可见）。

| id | 玩家处境（一句话） | top1（实际） | expected | Top1 | Top3 |
|----|--------------------|--------------|----------|------|------|
| f01 | 方案改十几稿、群里只回收到了 | s1 林予/杭州 | s1 | hit | hit |
| f02 | 明天的事预演很多遍、凌晨盯清单 | s9 美咲/札幌 | s3 | MISS | hit |
| f03 | 答辩结束没人看到改到凌晨的页（region=east） | s4 阿宁/成都 | s12 | MISS | hit |
| f04 | 家里的事一个人托着、没人问托的人累不累 | s4 阿宁/成都 | s10 | MISS | hit |
| f05 | 交出最用心的东西换来一句知道了（east） | s4 阿宁/成都 | s4 | hit | hit |
| f06 | 预演/清单 query，region=europe | s3 Jonah/Chicago | s3 | hit | hit |
| f07 | 港口/窗/等一个不会来的人（region=east） | s2 Mara/Lisbon | s2 | hit | hit |
| f08 | 车间/模具/十二小时白班 | s1 林予/杭州 | c002 | MISS | miss |
| f09 | 手机扣床头/凌晨醒来/怕未读 | s3 Jonah/Chicago | c006 | MISS | miss |
| f10 | 厨房地上/冰箱嗡嗡/想找人说话翻了三屏 | s9 美咲/札幌 | c008 | MISS | miss |
| f11 | 深夜写东西/纸写一半/圆珠笔快没水 | s1 林予/杭州 | c012 | MISS | miss |
| f12 | 日更闹钟/手账半年没翻/凉咖啡 | s1 林予/杭州 | c014 | MISS | miss |
| f13 | 夜里守着孩子/揉皱的卷子/脏碗冲到指尖发白 | s9 美咲/札幌 | c007 | MISS | miss |
| f14 | 打了又删/留灯，avoid=["Mara"]（europe） | s6 Hana/Auckland | s6 | hit | hit |
| f15 | 车厢里练习「我没事」（只给 anxious） | s9 美咲/札幌 | s9 | hit | hit |
| f16 | 被说太敏感、把火收起来（america） | s8 Diego/Valparaíso | s8 | hit | hit |
| f17 | 深夜客厅灯/凉茶/手机藏进抽屉 | s5 Sefu/Nairobi | c005 | MISS | miss |
| f18 | 连日落雨/不再定闹钟/半夜醒来又睡着 | s5 Sefu/Nairobi | c011 | MISS | miss |

## Baseline 失败模式观察

1. **COLLECTED 结构性不可见（最大头）**：8 条 COLLECTED 场景（f08–f13、f17、f18）Top1/Top3 全部
   落空——`matchStory` 的候选池里根本没有 COLLECTED，无论情绪多重叠都不可能赢。这 8 条全部被
   「情绪重叠 + east 加分」随手塞给了 s1/s3/s5/s9。Contract 要求「COLLECTED 可以赢得匹配」，
   在这条链上结构性不可能。
2. **region 1.4 在平分时事实上决定归属**：f03（答辩页，east）与 f04（家务独扛，east）都因
   同情绪池里的 s4 拿到 +1.4 而被拉走；s3 其实远在 america，f02（预演/清单，east）也因此落到
   s9——情绪同为 anxious 时，赢家由「谁在 east」决定，与处境文本无关。
3. **纯情绪排序无法区分同情绪不同处境**：f02 与 f15 的 emotions 完全相同（[anxious]），处境一个在
   书桌前、一个在车厢里；baseline 对两者只看情绪 + region，f02 判错、f15 判对纯属 s9 恰好在 east。
4. **现存的 hit 多半靠结构巧合**：f07（s2 vs s5 情绪同分）与 f14（avoid Mara 后 s6/s7/s9 同分）都靠
   数组扫描顺序的平局规则取胜；f05/f16 则是「情绪 + region 恰好都对齐」的 easy case。也就是说
   baseline 的 38.9% 里没有一条来自对处境文本的理解。
5. **avoid 语义本身能工作**：f14 传入 `avoid=["Mara"]` 后身份确实换成了 s6，说明避让机制在，
   Phase 2 只需保证它在多路融合里不被别路翻掉。

## 为什么不是 RRF

先按 contract 推荐实现了 RRF `Σ w/(k+rank_i(d))`（`decideMatchRRF` 留在 matching.ts 供对照），同一套 18 条 fixture 实测：

| 变体 | Top1 | Top3 | collectedTop1 | 落榜 |
|------|------|------|---------------|------|
| RRF k=10, dense emo, textW=1 | 17/18 | 17/18 | 8 | f14→s4 |
| RRF k=10, dense emo, textW=2 | 17/18 | 17/18 | 8 | f14→s4 |
| RRF k=10, dense emo, textW=3 | 17/18 | 17/18 | 8 | f14→s4 |
| RRF k=10, dense emo, textW=5 | 17/18 | 17/18 | 8 | f14→s4 |
| RRF k=10, dense emo, textW=10 | 17/18 | 17/18 | 8 | f14→s4 |
| RRF k=10, ordinal emo, textW=1 | 16/18 | 18/18 | 7 | f03→s10, f12→c001 |
| RRF k=10, ordinal emo, textW=3 | 17/18 | 17/18 | 8 | f14→s1 |
| RRF k=1, dense emo, textW=1 | 17/18 | 17/18 | 8 | f14→s4 |
| RRF k=1, dense emo, textW=3 | 17/18 | 17/18 | 8 | f14→s4 |
| RRF k=60, dense emo, textW=1 | 16/18 | 17/18 | 8 | f04→s4, f14→s4 |
| RRF k=60, dense emo, textW=3 | 17/18 | 17/18 | 8 | f14→s4 |
| **最终：3·cov/maxCov + emo + 0.3·region** | **18/18** | **18/18** | **8** | — |

最终公式下 text 仍主导：18 条里 17 条 anchor 是 text#1，唯一例外 f14（text#5）靠 emotion 的 2v1 强度差胜出。

2026-10-15 用当前故事库重跑：表里只有「k=10, ordinal emo, textW=3」一行变了（Top3 18/18、f14→s4），
原因是之后 `stories.ts` 改过文案；其余各行、Baseline 与 After 数字都不变，结论不受影响。

## After 结果（Top1 18/18）

汇总：**Top1 18/18 (100%)、Top3 18/18 (100%)、collectedTop1 8/8**。
Before→After 对照（per-fixture）：

| id | 玩家处境（一句话） | Before top1 | After top1 | Before T1/T3 | After T1/T3 |
|----|--------------------|-------------|------------|--------------|-------------|
| f01 | 方案改十几稿、群里只回收到了 | s1 | s1 林予/杭州 | hit/hit | hit/hit |
| f02 | 明天的事预演很多遍、凌晨盯清单 | s9 | s3 Jonah/Chicago | MISS/hit | hit/hit |
| f03 | 答辩结束没人看到改到凌晨的页（east） | s4 | s12 Priya/Melbourne | MISS/hit | hit/hit |
| f04 | 家里的事一个人托着、没人问托的人累不累 | s4 | s10 Leila/Marrakesh | MISS/hit | hit/hit |
| f05 | 交出最用心的东西换来一句知道了（east） | s4 | s4 阿宁/成都 | hit/hit | hit/hit |
| f06 | 预演/清单 query，region=europe | s3 | s3 Jonah/Chicago | hit/hit | hit/hit |
| f07 | 港口/窗/等一个不会来的人（east） | s2 | s2 Mara/Lisbon | hit/hit | hit/hit |
| f08 | 车间/模具/十二小时白班 | s1 | **c002** 阿枳/厦门 | MISS/miss | hit/hit |
| f09 | 手机扣床头/凌晨醒来/怕未读 | s3 | **c006** 苏平/苏州 | MISS/miss | hit/hit |
| f10 | 厨房地上/冰箱嗡嗡/想找人说话翻了三屏 | s9 | **c008** 林野/苏州 | MISS/miss | hit/hit |
| f11 | 深夜写东西/纸写一半/圆珠笔快没水 | s1 | **c012** 苏榆/长沙 | MISS/miss | hit/hit |
| f12 | 日更闹钟/手账半年没翻/凉咖啡 | s1 | **c014** 阿岑/长沙 | MISS/miss | hit/hit |
| f13 | 夜里守着孩子/揉皱的卷子/脏碗冲到指尖发白 | s9 | **c007** 苏敏/苏州 | MISS/miss | hit/hit |
| f14 | 打了又删/留灯，avoid=["Mara"]（europe） | s6 | s6 Hana/Auckland | hit/hit | hit/hit |
| f15 | 车厢里练习「我没事」（只给 anxious） | s9 | s9 美咲/札幌 | hit/hit | hit/hit |
| f16 | 被说太敏感、把火收起来（america） | s8 | s8 Diego/Valparaíso | hit/hit | hit/hit |
| f17 | 深夜客厅灯/凉茶/手机藏进抽屉 | s5 | **c005** 林小婉/长沙 | MISS/miss | hit/hit |
| f18 | 连日落雨/不再定闹钟/半夜醒来又睡着 | s5 | **c011** 林舟/重庆 | MISS/miss | hit/hit |

After 修复了 Before 的三类失败：COLLECTED 结构性不可见（8 条全部翻正）、region 1.4 在平分时
决定归属（f02/f03/f04 归位）、纯情绪排序无法区分同情绪不同处境（f02/f15 各归其位）。
