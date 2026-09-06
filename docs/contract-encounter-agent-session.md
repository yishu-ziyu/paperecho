# 验收契约 — Encounter Agent Session 连续性重构

## Change（用户必须能观察到什么）

找到一个人之后，玩家可以和同一个逻辑 Agent 持续对话：它每轮都能看到此前完整对话（含早期轮次）、自己的身份/日子本、当晚的初始信，以及相关旧记忆；记忆在普通聊天里形成闭环（remember → archival → 下一轮可检索引用）；对话只由玩家显式触发"折回去"才结束。三层故事（发生的事/当时的感觉/后来改了什么）继续作为故事揭示深度的内部信号，但不再控制 Encounter 生命周期。

## Not this（不可接受的替代品）

- 用 `round >= N` 或任何其它自动条件替代 `shouldSealNow(exchange.unlocked >= 3)` 自动封信——自动终止一律禁止。
- transcript 只取"玩家当前一句 + Echo 上一句"进 prompt，早期轮次仍然丢失。
- 检索结果只进 `hits` / debug / JudgePanel，不进模型上下文。
- `remember` 被调用但 facts 没有经过 `applyFacts` → `persistArchival` 落盘。
- 为"持续对话"引入长期驻留的服务器内存 Agent 实例、向量数据库或大型新框架。
- 改动搜索排序算法、搜索策略（Task 2 范围）。
- 删除 `StoryDepth` 三层故事本身，或改动其判定机制（`advanceExchange` / `isNewPersonalDetail` 保留）。
- 破坏：无 key 完整可玩、超时/失败 fallback、journeys/daybook/archival 数据、再找同一个人（name/city/awayThing 连续性）、现有质量 guard（`stolenVoice` / `ownLine` / `cleanOneLine` / `acceptLive` 等）。
- UI 视觉重设计（只需最小可用"结束今晚"入口 + 修正把三层进度说成对话寿命的文案）。

## Evaluator（谁检查、怎么检查）

`npm run typecheck` + `npm test` 全绿；以下逐条为可证伪断言（新增/修改测试必须真实覆盖，源码正则断言只作为 store/UI 这类无法单测层的补充证据）：

1. **连续 6+ 个玩家 turn 不自动进入 return**：`advanceExchange` 在 6 轮混合输入（含已到 depth 3）后不产生任何 seal 信号；`store.reply` 正常路径无 `shouldSealNow` 调用、无 silentUnlock→seal 分支；`resumeOf` 不再因 `exchange` 自动把 encounter 判进 return。
2. **depth 3 后仍正常生成回复**：exchange 状态在 unlocked=3 时继续推进（speak=3），turn 链正常产出回复。
3. **只有显式结束动作触发 runSeal**：store 中 `runSeal` 仅由新增的显式 `sealTonight` 动作（UI 按钮 → store action）触达；EncounterPhase 存在该入口（最小两步确认或单按钮，无视觉重设计）。
4. **第 5 轮能看到第 1–2 轮上下文**：turn 上下文构建函数（纯函数可单测）输入含第 1–2 轮玩家句的 5 轮 transcript 时，产出的 prompt 包含那些早期句子（至少：最近 N 条逐字 + 更早玩家句保留）。
5. **search_archive 命中进入回复上下文**：turn 上下文包含 archival 命中 memory 的原文（预检索块或 tool result 二者之一，实现取"预检索块 + 工具"双路）。
6. **普通 turn 中 remember → applyFacts → archival 闭环**：turn agent 的 remember 工具写入 `ctx.remembered`，chain 结果 `facts` 非空，store 对 `res.facts` 走 `applyFacts` + `persistArchival`（已有代码保持）。
7. **玩家记忆不被偷成 Echo 经历**：turn 回复经过 `stolenVoice` guard（含 archival 时不许把玩家 memory 说成"我……"）；remember 工具只收玩家来源事实（已有 `playerTexts` 校验保持）。
8. **fallback / no-key 完整可玩**：无 key 时 turn 链跳过 LLM 直接走现有 fallback（daybook `nightLine` / store 侧 `speakTurn`），seal 链 `hasApiKey()` 短路返回 fallback；Encounter → Return 全流程不悬挂。
9. **回访旧 Echo**：`lockedEchoForMatch` / daybook / journey 行为不变（companion 既有测试保持全绿）；新 encounter 不再 3 轮封顶。

## Evidence（必须产出什么）

- 修改文件清单 + 新旧执行链说明（最终报告 10 项，见任务书第十一节）。
- 新增/修改测试：至少覆盖上面 1–8 条（9 由既有 companion 测试 + 1 共同保证），`npm test` 输出贴出。
- 明确结论：当前是否满足"找到一个人后，可以持续和同一个逻辑 Agent 对话；它看得到此前对话，能够在相关时调用旧记忆，并由玩家自己决定什么时候结束"。不满足则列具体原因。
- 遗留给 Task 2 的搜索问题清单。
