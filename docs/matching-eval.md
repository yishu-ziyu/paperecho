# 匹配评测 — Task 2A（Before 基线 + After 验收）

日期：2026-09-06。分支 `feat/coherent-echo-matching`（基 main `d45515e`）。
第一部分记录 **改算法之前** 的 baseline 数字与失败模式；第二部分是 Phase 2 新 matcher
（`decideMatch`）用同一套 fixtures / harness 跑出的 After 验收数字与融合公式论证。

## 生成命令

```bash
# Before 数字来自这个 runner（输出即下表）
npx tsx scripts/matching-eval-baseline.mts

# 同一套数字也会在测试输出里打印（Phase 2 后一次跑出 Before + After 两张表）：
node --experimental-strip-types --test src/game/agent/matching.eval.test.ts
```

涉及文件：

- `src/game/agent/matching.fixtures.ts` — 18 条 golden fixtures（语义改写，全池查重无 ≥6 连续字复制）。
- `src/game/agent/matching.eval.ts` — 纯确定性 harness：`baselineMatchFn`（Before，冻结）/
  `newMatchFn`（After）/ `evaluate` / `collectedAvailable`。
- `src/game/agent/matching.eval.test.ts` — fixtures 质量规则 + Before/After 数字 + 门槛断言。
- `src/game/agent/matching.ts` — Phase 2 的统一可解释匹配链（纯、确定性、无网络）。

## 执行链（Before）

`match` 链（`src/game/agent/chains.ts` → `makeRuntime`）里，Echo 身份由
`fallbackEcho(fingerprint, region, avoidNames)`（`src/game/kernel.ts`）决定：

1. `ownedOf(fp, 0.3)` 从情绪指纹取 feels；
2. `matchStory(feels, region, avoid)`（`src/game/stories.ts`）评分 = **情绪 overlap×2 + region 相同 +1.4**，
   只扫手写 `STORIES`（12 条）——`COLLECTED`（10 条）不在候选池里，**结构性不可见**；
   avoid 硬避让，全被避开才回退全池；评分平局时按数组扫描顺序（严格大于才替换）；
3. `storyToEcho(...)` 用这条 story 定下 Echo 的 name/city/greeting/replies/returnLetter；
4. 之后 `researchStep → gatherShadow` 只产出检索 materials（EchoShadow），**不回写身份**；
   材料库 ≥5 条时 live 被跳过。

harness 的口径：`fixture.emotions` 直接当作 `ownedOf(fp, 0.3)` 之后的 feels（以 closeness=1 的
Fingerprint 喂真实 `fallbackEcho` 时 `ownedOf(·, 0.3)` 原样返回该集合）。测试逐条断言
`baselineMatchFn().top1` 的身份（name+city）与真实 `fallbackEcho` 产出一致——评测没有自己另造口径。

## Baseline 结果（Top1 x/18）

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

## After 执行链（Phase 2）

身份只来自同一条可解释链：`decideMatch`（`src/game/agent/matching.ts`，纯、确定性、无网络）
在候选池 `archiveStories()`（STORIES 12 + COLLECTED 10 = 22 条）上选出 anchor：

1. **makeRuntime**（`chains.ts`）：新遇（`input.echo` 为空）先跑 `decideMatch({letter, mirror,
   playerLine, feels=ownedOf(fp,0.3), region, avoid})`，`storyToEcho(anchor)` 定下 Echo 的
   name/city/greeting 种子/replies 种子/returnLetter——身份字段全部同源；revisit（locked echo，
   revisit identity lock）路径不进 matcher，零改动。
2. **researchStep("match")**：`gatherShadow`（live 始终与 local 并行起步，~4s 预算，失败→[]；
   raw live discovery-only——结果只挂 `shadow.livePosts` 供观测并后台 ingest，不进当前
   generation materials）之后 `alignShadowToAnchor` 将 respond() 的 generation materials
   重建为 allowlist：anchor Story 第一项 + approved supporting Stories（textRank ≤
   SUPPORTING_TEXT_RANK_MAX 且 coverage > 0，≤2 条），其余项一律不回填；evidence 证据行与
   结构化 `NightResult.match` 只进 hits/JudgePanel，不进 prompt。
3. **respond**：只基于 allowlist 内的 materials 生成措辞；生成结果经 keepSpoken guard 后作为
   spoken，失败/被拒时回退 anchor narrative source（storyToEcho 的 greeting 基底）；
   returnLetter/felt 恒为 anchor 基底。旧「十七稿特判」删除（它只在身份固定为林予时才有意义）。
4. **fallbackEcho**（`kernel.ts`）：签名不变，内部改走 `decideMatch`（query 文本为空 → text 项
   整体为 0，由 emotion+region 决定）；`store.launch` catch 路径与 `session.restoreEchoSession`
   随签名不变自动升级。COLLECTED 从此可成为身份。

## After 融合公式与论证

三路 signal（全池排序，dense rank：并列共享名次；tie-break 一律 story.id 字典序）：

- **text/situation**：query（letter+mirror+playerLine）对 story 文本（opening+lines）的
  idf 加权覆盖率。token 复用 `memory.tokensOf`（CJK 单字+双字 + ASCII 词），query 侧剔除指代
  bigram（那句/话我 之类的切词伪影，f14 的实证教训）；双字/词权重 1、单字 0.3；
  idf = ln(N/df)，全池都有的 token 权重 0；覆盖率 = 命中权重 / 该 story 全词权重（消长文偏置）。
  禁止 exact-substring（baseline 的 `includes` 已证明无效）。
- **emotion**：`story.feels ∩ query.feels` 计数（保留 2 比 1 的强度差，不归一）。
- **region**：同区二元偏好（非过滤），权重 0.3（baseline 是 1.4）。

**fusion（最终采用）**：`fused = 3·(cov(d)/maxCov) + emoOverlap(d) + 0.3·sameRegion(d)`；
query 无有效 token（maxCov=0）时 text 项整体为 0，自然退化为 emotion+region。

**为什么不是 RRF k=10**：先按 contract 推荐实现 RRF `Σ w/(k+rank_i(d))`（`decideMatchRRF`
保留在 matching.ts 供对照），同一套 18 条 fixture 的实测：

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

结构性原因：f14 要靠 emotion 的 2v1 强度差让 s6 压过 text 近并列的替代者——rank 融合里
「text#1 vs #2」只差一档，权重再大也只是同比例放大，永远翻不过 emotion 的名次差；
把 text 保留为**连续分数**（覆盖率归一后 3 分封顶，emotion 计数最大 2×重叠、region 0.3），
text 仍主导（18 条里 17 条 anchor 是 text#1），emotion/region 只在 text 近并列时有发言权。
这是 18 条全过的最小公式，没有更大的权重取值。复现：`node --experimental-strip-types
--test src/game/agent/matching.eval.test.ts`（打印 Before/After 两张表）。

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

## 验收断言的落地方式（contract Evaluator 1–3）

- **门槛断言**（`matching.eval.test.ts`）：Top1 ≥ 80%、Top3 ≥ 95%、collectedTop1 ≥ 3、
  region sanity（f03/f06/f07 的 anchor 都是跨 region 的 text#1——B 高文本相关不因 region 不同
  被压过；f05 作 region 一致时的对照）、avoid（f14 避开 Mara → s6，硬避让、池空回退全池）、
  evidence 与 ranked 对齐 / anchor 恒 fused#1 / supporting ≤2 且 textRank ≤
  SUPPORTING_TEXT_RANK_MAX、coverage > 0 / 同输入同输出。
- **Identity coherence e2e**（no-key，fetch=0，streamFn 不注入）：f08 → c002：`echo.name === 阿枳`、
  `echo.city === 厦门`、returnLetter/greeting = c002 原文、hits 有 `anchor=c002` 证据行、
  shadow 首材料含 anchor 自己的行；f01 → s1 对拍 STORIES 路径同源。
- **live 三态**（`gatherShadow` 第三参注入 liveSource）：local ≥5 时 live 仍被调用；slow live
  （1.5s > 60ms 预算）不挡 match、slow 帖不进 materials；failed live → 纯 local 正常；Post 结构上
  无 name/city 字段、anchor 恒出自 archiveStories（source ∈ {handwritten, collected}）。
