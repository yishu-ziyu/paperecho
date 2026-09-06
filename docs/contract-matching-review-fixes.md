# 验收契约 — Task 2A 第二轮 review 修复（材料白名单 / raw live discovery-only）

分支 `feat/coherent-echo-matching`（延续，不新开分支/PR），commit 到 PR #2，不 merge。

## 背景

PR #2 主体已通过 review（候选池 / decideMatch / anchor identity / golden eval / region / avoid / bounded live start / Task 1 regression 全部接受）。剩两个 blocking finding。

## Finding 1 — 未批准的其它 Story 人生仍可能被当前 Echo 说出

根因：`alignShadowToAnchor()` 在 `[anchor, ...supporting, ...live]` 之后无条件回填
`base.materials` 的剩余项（`rest`），而 `respond.ts` 的 `rankedMaterials` 会按当前
userLine 对全部 materials 重排——未经 MatchDecision 批准的 Story 可借此排到前面，
被当成当前 Echo 的第一人称经历说出。

### Fix 1A — speakable materials 改为白名单
match 阶段最终进入 respond 的 materials 只允许：
1. anchor Story 的 `storyToPost`；
2. 通过 relevance gate 的 approved supporting（MatchDecision.supporting）。
删除 `rest` 回填与 live 帖消费（见 Finding 2）。不靠 prompt 叮嘱，数据进模型前解决。

### Fix 1B — supporting 必须有正相关
仅 `textRank <= 5` 不够：全部 cov=0 时 dense rank 并列使无关 Story 共享 rank 1。
新增硬条件：**raw coverage > 0**（与 query 共享至少一个 idf>0 的非全池通用 token）。
零文本相关 ⇒ 不得成为 supporting。阈值语义写进代码注释与文档，不为 18/18 调神秘数。

### Finding 1 tests
- Test A（leak-back）：链级 no-key match，构造 base.materials 含与当前 userLine 高度相关
  但未经批准的其它 Story 行；断言 hits blob（= respond 实际收到的 materials 的 blob）
  中每条素材行都出自 anchor 或 decideMatch 批准的 supporting；未批准行（如「导师批注论文」）
  不得存在。不能只查 echo.name。
- Test B（zero-affinity）：query 与全池无有效重叠（如空 query）⇒ `supporting.length === 0`，
  不得因 dense 并列自动获得两个 supporting。
- Test C（approved supporting 仍可用）：真实高相关的 anchor+supporting 场景，
  supporting 仍进入（不许为防污染删掉 supporting 功能）。

## Finding 2 — raw live 内容未经 rewrite+QA 进入 prompt

根因：`cleanHit` 只是基础清理；`docToPost` 直接截取 `CleanDoc.text` 句子作 Post.content，
经 `livePosts → pickLiveMaterials → materials → respond prompt`，真名/城市/公司/联系方式/
≥8 字原句都可能进 prompt。「原文不进 prompt」不成立。

### 修法（preferred）：raw live = discovery only
未经 `rewriteStory + qaStory` 的 live 内容：
- 仍被搜索（live 每次 match 仍启动，与 local 并行、独立预算、超时/失败不挡飞机）；
- 只进后台 ingest queue（`scheduleIngest` 不动）；
- **不得进入当前 Echo 的 speakable materials / respond prompt（任何路径，含 revisit 的
  `synthesizeLibraryFirst` live 填充）**；
- 只有完成 rewrite+QA 进入 COLLECTED 后，未来 match 才可安全使用。
删除 `pickLiveMaterials` / `LIVE_AFFINITY_MIN`（随之成为死代码）。

### Finding 2 tests（fake live docs）
- PII test：`gatherShadow(ctx, true, fakeSource)` 返回含
  「我叫张三，在深圳南山区腾讯工作…」的帖 ⇒ materials 不含任何该内容；discovery 结果仍被捕获。
- Source-overlap test：raw live 一句 ≥8 连续字独特文本 ⇒ 不进 materials/prompt。
- Contact test：email / phone / @handle / URL ⇒ 不进 materials/prompt。
- Background ingest：live discovery 仍发生、成功 CleanDoc 仍 schedule ingest，
  pipeline 不因本轮不用 raw post 退化为死代码（Runtime 3 取证 + 单元/结构证据）。

## 必须保持（回归红线）

live 每次 match 仍启动；live 超时/失败不挡飞机；anchor 恒出自安全池；COLLECTED 仍可
Top-1 identity；18-fixture eval 不改 fixtures 且 ≥80% / ≥95% / collectedTop1 ≥3 保持；
avoid；region sanity；revisit 零改动；Task 1 全部行为（session/turn/seal/no-key fallback
3/TokenMeter/daybook/journeys/name-free 断言）；match latency 不恶化。

## Evidence

- 上述全部测试真实输出；`npm run typecheck` / `npm test` / `lint` / `check:deps` / `build` 全绿。
- Runtime 1（coherence）：真实模型 5 个场景，记录 anchor id / approved supporting ids /
  final materials 来源 / Echo opening；materials ⊆ {anchor ∪ approved supporting}。
- Runtime 2（privacy）：fake live provider 投放真名/城市/公司/8+ 字独特原句/联系方式，
  捕获真实发给模型的请求体（LLM request body），断言 raw 内容零出现。
- Runtime 3（live lifecycle）：live called=yes + current prompt raw live=no +
  background ingest scheduled=yes（rewrite+QA 成功进 COLLECTED 或 rejected 记录，均证 pipeline 活着）。
- Eval integrity：fixtures 零改动（git diff 证明），After 数字保持。
- 独立 validator 复验（10 项攻击面），blocking 修完重验。
- commit + push 到 PR #2（52eb936 之上），不 merge，不新开分支。
