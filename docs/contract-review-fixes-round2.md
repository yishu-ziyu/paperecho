# 验收契约 — PR #1 review 修复第二轮（transcript 对称压缩 / no-key 静默 / TokenMeter 丢失）

对应 PR #1 review 的 3 个 blocking finding。分支 `fix/encounter-agent-session`，不新开 PR，不 merge main。

## Change（用户必须能观察到什么）

1. **长对话不再忘掉 Echo 自己早期说过的话**：同一个人聊到 20+ 轮后，Echo 早期说过的专有事实（如「我妹妹小夏昨天离职了」）滑出最近 10 条逐字窗口后，仍以**明确属于 Echo 自己**的说话人归属出现在 turn prompt 里；同时更早的玩家句照旧保留。禁止出现「窗口外只忘 Echo、不忘玩家」。
2. **无 key + 空 daybook + lastEcho === greeting 时不再静默**：玩家发出一条正常 turn 后，必然收到一条非空、不复读上一句、符合当前 StoryDepth、不偷玩家记忆、不产生网络请求的 Echo 回复；store 能把这条回复 append 成气泡，不卡 waiting、不 seal。
3. **主 Pi Agent 的真实 TokenMeter 不再被丢弃**：turn 链主路径真实产生 usage 时，`NightResult.meter` 保留 prompt/completion/total（store → JudgePanel 显示真实数字）。只报告真实观测到的 usage，不伪造。
4. （review 非阻塞项，同 PR 顺手改）README 与 JudgePanel 里「确定性检索 → 单工具 LLM 步」的过时链路描述改为符合现状的「短命多工具 Agent」表述。

## Not this（不可接受的替代品）

- 把窗口外双方内容混成一个无 speaker 的摘要，或丢掉角色归属。
- 重新让无限 raw transcript 进入 recent block（recent 10 条逐字窗口保持不变）。
- 引入向量库 / LLM summarization subsystem / 新依赖 / 新的大段 fallback 文案系统。
- 为绕过静默 turn 改 store 的 `nightLine` 放行逻辑（root fix 在 turn 链兜底，store 行为不变）。
- 用 ECHO.greeting 恰好不等于 lastEcho 的 happy-path 测试冒充本 bug 的回归覆盖（测试必须复现 lastEcho === greeting + 空 daybook 的真实初始条件）。
- 伪造 token 数：Agent fallback 路径没暴露 usage 时，只报告已知 usage，不得编造。
- 改 search ranking / Live Search 策略 / 角色匹配 / `search_cases` 调用率（Task 2 范围）。
- 删除或弱化现有 guards（`stolenVoice` / `ownLine` / `parroted` / `guardTurnReply` / `cleanOneLine`）、fallback 层级或现有测试（编码了旧行为的那一条断言按新不变量更新，不许整段删测试文件）。
- 大规模文件重组、为「更漂亮」改名/搬文件。

## Evaluator（谁检查、怎么检查）

`npm run typecheck` + `npm test` 全绿；以下为可证伪断言：

1. **transcript 对称压缩**（session.ts `transcriptBlock`）：
   - recent 10 条逐字格式不变（`对方：`/`你：` 前缀）。
   - 窗口外新增「更早你说过的」块，逐条 `- 你（更早）：` 前缀 + `EARLIER_CLIP` 截断；原有「更早对方说过的」块（`- 对方（更早）：`）保持。
   - 新测试：≥24 条 transcript，Echo 早期唯一事实（含专有名词「小夏」）明确落在窗口外，`buildTurnContext` 产出的 user prompt 包含该句且归属 Echo（「更早你说过的」块内）；同时包含窗口外的早期玩家句。断言的是 speaker-preserving semantic continuity，不是字符串长度。
   - 更新 session.test.ts 中编码旧行为的断言（`早期回声的一句` 现在必须保留）。
2. **no-key 静默 turn 回归**（chains.ts `runTurnChain` 兜底链尾）：
   - 新测试复现真实条件：删除全部 API key、`days = []`、`recall` 仅一条 echo 句且等于 `echo.greeting`、`echo.replies = []`、玩家发一条新的正常消息。断言：`fetch` 调用次数 = 0；`res.spoken.trim().length > 0`；`res.spoken !== echo.greeting`；`res.meter.via === "archive"`；turn 正常返回（不 throw、不 seal）；且 `nightLine(res.spoken, lastEcho, 空book)` 放行（store 侧可 append）。
   - 兜底句必须经 `parroted(lastEcho)` / `stolenVoice(archival)` / `isInstruction` 过滤，复用 `lineForLayer` 按层取句，不得使用 `echo.returnLetter`。
3. **TokenMeter 保留**（chains.ts `runTurnChain`）：
   - 新测试：scripted fake stream 两个 assistant 消息各带 usage input=10 output=4，断言 `res.meter.prompt === 20`、`res.meter.completion === 8`、`res.meter.total === 28`、`res.meter.via === "live"`、`res.meter.node === "turn"`。
   - Agent reply 被 guard 拒掉走 archive 兜底时，已消耗的 agent usage 不得归零（usage 保留，via/模型按实际路径诚实标注）。
   - store 接收 `res.meter` 不再清零（store.ts 现为直传 `meter: res.meter`，保持；Runtime C 用真实模型取 store 级证据）。
4. **文案**：README.md 与 JudgePanel.tsx 的「单工具 LLM 步」描述更新，不改动其它 UI/视觉。

## Evidence（必须产出）

- targeted tests（session.test.ts 等）、`npm run typecheck`、`npm test`、`git diff --check` 的真实输出。
- Runtime A：长历史连续性 probe（构造 >24 条，打印最终 user prompt 中小夏句的归属块），证据含归属块原文。
- Runtime B：无 key 浏览器级 smoke（真实首次 Encounter + 空 daybook），证据含：Echo 气泡出现、waitingEcho 复位、无 LLM 网络调用、未 seal。
- Runtime C：真实 key 下真实 turn，store 状态 `meter.total > 0`。
- 独立 validator（未参与实现）按本契约逐条 PASS/FAIL + 对抗性 review 结论。
- 最终 diff 无 Task 2 / 无关重构；只 commit 分支 `fix/encounter-agent-session` 并 push，不建新 PR，不 merge。
