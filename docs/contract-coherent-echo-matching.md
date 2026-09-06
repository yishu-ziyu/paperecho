# 验收契约 — Task 2A：Coherent Echo Matching（统一可解释匹配链）

分支 `feat/coherent-echo-matching`（自 main `d45515e`），新开 PR，不 merge。Task 1 行为全部保持。

## 产品语义（钉死）

「为什么是这个人」必须来自同一条可解释的匹配链：**anchor Story 决定 Echo 是谁**。
`Echo.name / city / returnLetter / greeting 锚点 / 核心经历` 必须全部可追溯到同一个 anchor Story；
supporting materials 只影响措辞细节，绝不改变身份/anchor 叙事/city/returnLetter 来源。

Echo 身份只能来自安全池（手写 STORIES + 已 rewrite+QA 的 COLLECTED）。
未经 rewrite+QA 的 live 文档：可为检索提供辅助信号、作临时 supporting material、后台 ingest；
**绝不能**成为显示身份 / 暴露真实作者信息 / 宣称找到真人。

## Change（用户可观察）

1. 新匹配：候选池 = `archiveStories()`（STORIES + COLLECTED，22 条）。COLLECTED 可以赢得匹配并成为最终 Echo。
2. ranking 多路 + fusion：situation/text 相关性、emotion 相容、region 偏好（非过滤）、avoid（有合理替代时避开）。推荐 RRF（`Σ 1/(k+rank_i(d))`，k 写明），若用别的融合法须用 evaluation 证明。
3. MatchDecision：anchor + supporting + evidence（textRank/emotionRank/regionRank/fusedRank/source）。anchor 进 JudgePanel/debug 可见（hits 证据行 + 结构化字段），不再只返回一个人名。
4. match 阶段 live discovery 始终被启动（与 local 并行、~4s 预算、超时/失败不挡飞机、local 立即可用）；超预算结果后台 ingest。**live raw 结果永不成为 anchor。**
5. supporting 收紧：「一个人是一个人」——supporting 必须与当前处境相关，材料顺序 anchor 优先，不得把多个人拼成一个人。

## Not this（不可接受）

- fallbackEcho 仍偷偷决定身份 / COLLECTED 永远赢不了 / region 权重过大压过高文本相关 / emotion overlap 支配全部排名。
- identity 与 story anchor 分裂（name/city 来自 A，opening 来自 B）。
- 巨大魔法公式凭感觉调参；为「AI 感」引入 vector DB / embedding / 新搜索服务。
- live 因 local 满被跳过；live raw 作者身份泄漏成 Echo name/city。
- revisit（seekPerson）被新 matcher 换人；Task 1 任何行为回归（session/turn/seal/no-key fallback/meter/daybook/journeys）。
- 大规模文件重组；对话 prompt 大重写；UI 大改。

## Evaluator（可证伪断言）

1. **Golden evaluation**（`src/game/agent/matching.test.ts` 或 eval 专用文件 + fixtures）：
   - ≥12 条 fixture（推荐 16–20），query 为语义改写（禁止复制 Story 原文），含：4 个 curated 场景（方案十几稿/预演清单/答辩凌晨/家里一人托）、≥3 个 COLLECTED 场景（车间模具十二小时→c002 类；手机扣床头凌晨醒来未读→c006 类；厨房冰箱洗碗想找人说话→c008 类）、同情绪不同处境、同 region 不同处境、不同 region 高相似、avoidNames。
   - fixture 字段：`{ id, letter, mirror?, emotions, region?, acceptableIds }`；acceptable set 不许放宽凑数。
   - **Baseline 先行**：harness 能对当前 matcher（matchStory/fallbackEcho 链）出 Top1/Top3，数字记录进 docs/eval 报告后才允许改算法。
   - 验收：distinctive set Top1 ≥ 80%、Top3 ≥ 95%（acceptableIds 任一命中算对）；≥3 条 fixture COLLECTED 为 Top-1 或 acceptable Top-1；region sanity（B 高文本相关不因 region 不同被 A 稳定压过）；avoid 后存在合理替代时必须选替代。
2. **Identity coherence**（端到端）：matcher 选出某 COLLECTED anchor 后，`echoChain.match` 产出 `echo.name === anchor.name`、`echo.city === anchor.city`、greeting/replies/returnLetter 可追溯到 anchor；opening prompt / shadow materials 首位含 anchor 自己的 story material。禁止「name/city 来自 A、opening 来自 B」。
3. **Live behavior**（fake/slow/failed provider 注入）：local ≥5 时 live 仍被调用；slow live 超预算不挡 match（local 结果先返回）；failed live 回退 local 正常；live raw 文档只进后台 ingest 与 supporting，结构上无法成为 Echo name/city。
4. **Task 1 全绿**：现有全部测试不改语义通过（tools.test 里「formatCaseHits is the library path and stays name-free」等隐私断言必须保持）。

## Evidence（必须产出）

- baseline vs new 的 Top1/Top3 真实数字（Before/After 对照，写进 PR 报告）。
- unit：各 signal、fusion、avoid、region sanity。
- identity coherence e2e 测试。
- live 三态测试 + raw identity 不可成为 anchor 的结构证明。
- Runtime gate：≥5 个不同 letter（方案打回/夜班身体累/家庭照顾/深夜孤独/反复预演），记录 input → Top3 → 最终 Echo → anchor id/source → evidence → latency → live called/contributed；人工判断 relevance/coherence/latency。
- 独立 validator 对抗性 review（重点：fallbackEcho 偷偷定身份 / COLLECTED 赢不了 / region 过重 / emotion 支配 / 身份分裂 / 多人拼一人 / live 未调用 / raw 泄漏 / avoid 失效 / revisit 被换人 / no-key 退化 / latency 爆炸 / Task 1 regression）。
- commit + push + 新 PR（不 merge）。
