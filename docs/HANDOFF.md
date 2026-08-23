# Paper Echo · 会话交接文档（HANDOFF）

> 写给下一个 AI 会话：本文件是一切上下文的地基。**先读这一份，再看 `docs/game-logic-preview.md`（当前主循环与板块预览）、`agent.md`（Agent 设计）与 `docs/reports/social-story-pipeline.md`（社媒流水线设计）。**
> 协作铁律：先结构后代码，simple first；用项目内安装的 agent-skills（`/Users/mahaoxuan/Desktop/黑客松/AI PING/.dsh/agent-skills`）与用户沟通，当前在用 `interview-me`（一次一个问题、每题附 GUESS）与 `idea-refine`（三步：听懂→压实→一页纸）。用户是产品思维，怕术语轰炸；**任何涉及产品口味的事必须先确认再动手。**

---

## 0. 用户身份与参赛信息

- 比赛：游戏开发赛道。用户明确说「token 效率(20分)不用在意」，其余四维都要：可玩性与完成度(25)、玩法创意与乐趣(25)、命题融合度(15)、AI原生机制与技术实现(15，含安全与异常边界、输出稳定与可控、架构与工作流)。
- **命题原文（用户已给出）**：「情感 / 情绪搜救——捕捉那些没被说出口、也没被接住的情绪，用 AI 识别、回应，并推动一次更好的沟通。」
- 演示形态：评委可能真玩一局 + 按 J 看「回声系统」技术面板 + 读代码。

## 1. 项目真相（口径，已与代码对齐）

- 项目在 `/Users/mahaoxuan/Desktop/黑客松/AI PING/paper-echo`。运行：`npm run dev`（with-app-env → vite :8080）；`npm run typecheck`；`npm run lint`。
- env：`.env` 的 `AI_PING_API_KEY`；`.grok/app-env.json` 的 `VITE_AUTH_ENABLED=false`。LLM = AI PING（aiping.cn/api/v1）DeepSeek-V4-Flash-0731。
- **Agent 只有一套实现：`src/game/agent/chains.ts`**。`server.ts` 三个 Server Function（runMatch/runTurn/runSeal）→ echoChain.match/turn/seal，每链 = 确定性 research → 单工具短命 Pi Agent 步 → 确定性 validate。match 的 research 读 `pipeline/`：库优先占满 5 条，live 短超时只填空位。记忆 = localStorage（journeys `paper-echo-v1` ≤24 局；memory `paper-echo-memory-v2` ≤48 条）+ Jaccard 多因子检索。
- 超时：store 层 race match 22s / turn 12s / seal 14s；链内各步 7~15s。无 key/失败/超时三层兜底（fallbackEcho 本地故事卡）。
- 数据：12 个手写 Story + `src/game/collect.ts` 的 `COLLECTED`（预采集改写稿）。玩家不点选故事卡。**Mirror 是手写**：玩家自己写下今晚那句；`echo` 起飞后由 match 链定名定城。现场可爬公开页（短预算约 4s，失败不影响开口）；**库占满 5 条素材**，live 只填空位；爬完改写过闸写入 `COLLECTED`。扩库也可用 `npm run collect`。
- 已知体验缺陷清单（按优先级）见 §5。

## 2. 本会话已完成的工作

### 2.1 死代码清理（用户选「全部删除 + 文档对齐」）
- 已删除：`graph.ts`（LangGraph 版，曾无人引用）、`pi-echo.ts` 的 runNight 单体循环、`src/game/ai.ts`、`llm.ts` 的 chatAgent/chatJson、`tools.ts` 的 AGENT_TOOLS、`memory.ts` 的 heuristicFacts/buildCoreHuman、`types.ts` 的 AgentRequest/ChainContext/ChainResult/StepLog、依赖 `@langchain/core`+`@langchain/langgraph`（lockfile 已同步）。
- `NightInput/NightResult/RecallItem` 已迁入 `src/game/agent/types.ts` 成为唯一契约；`scripts/probe-night.mts` 已改为直连 echoChain。
- 注：probe-night 不能纯 node 跑（import 无扩展名），用 `npx -y tsx scripts/probe-night.mts`。

### 2.2 叙事口径统一
- `JudgePanel.tsx`：撤「LangGraph·Letta·Mem0」，改「Prompt Chain · match/turn/seal · 确定性检索→单工具 LLM 步→校验闸门」；「实时图」→「实时链」。
- `CODE_WIKI.md`：顶部更正声明 + §7 整章重写（旧文把 pi-echo 写成生产运行时，完全写反）+ 全篇 16 处修正（12→18 故事、记忆键名等）。
- `agent.md` / `README.md` / `src/game/types.ts` 注释同步。

### 2.3 Agent 人设措辞（用户明确指令）
- **「窗边那个人」已从 RULES 删除**。用户原话：窗边只是给玩家看的场景，不是让 Agent 念的台词。场景层（Fold「送到窗边」、Throw「在窗边等」、故事卡）保留；Agent prompt 内场景剧场腔清零（含 match 步「你是纸飞机对面的人」）。
- 现 RULES 首句：`你是深夜还没睡的一个普通人。只说你自己今晚的具体事，像微信，一两句。`（身份锚仍在：每步注入 # Persona「你是{名}，在{城}」+ 行为锚 + 禁词表）。

### 2.4 零散修复
- store.launch 失败文案：「改从本地故事里取一封相近的信」（原说「取旧信」不符）。
- startNew() 补 `meter: emptyMeter()`（防跨局残留）。
- 全部经 typecheck ✓、lint ✓（0 error，3 条 pre-existing warning 不动）。

### 2.5 社媒流水线设计（子代理产出，已归档）
- 完整报告在 `docs/reports/social-story-pipeline.md`。要点：P0 主源豆瓣（弃小红书）、LLM 只做匿名化改写、确定性去识别 QA 三闸（8 字残留/Jaccard 0.55/人名地名账号）、扩展池编译进 `collect.ts`（运行时零网络）、pre-warm 2~3 天 60~120 条。
- **赛前需 web_search 复核报告 F 节的实时事实**（X/Reddit API 价格、平台 ToS 变化）。

## 3. 用户已拍板的产品决策（不要重复问）

1. 死代码：全删 + 文档对齐（已执行）。
2. **流水线方向**：「演示=离线预采集安全垫」∔「产品北星=活信息流，不能被硬编码限定」；匿名化改写必须用 prompt 做；爬虫是内容生产工具不是运行时主角。
3. 优先级：**并行推进**（体验修复 + 流水线工程两边走）。
4. Agent 身份表述：真实普通人感，不要场景剧场腔。
5. 沟通方式：用项目内 agent-skills（interview-me/idea-refine 流程），一次一个问题、每题附 GUESS。

## 4. 悬而未决的决策（下一步会话的第一件事）

- ⚠️ **【最高优先】turn 链记忆模式未确认**：现状 = 对方每轮只能看到玩家刚说的那句 + 旧档案，看不到当晚前几轮对话 → 会「前言不搭后语」。方案 A 全记得（近 6 句，易咨询化）/ **B 半记得（推荐：注入最近 2 条 recall + 防矛盾，最合「窗边感」）** / C 保持失忆。**未获用户点头前不要实现。**
- ⚠️ **【次优先】北星组合包未获最终确认**：「A 活档案为主 + C 玩家入池为增长 + B 精选源并入 A」（ASSESS 已给 GUESS=对，等用户明确 yes）。确认后两件事：① 写 `docs/ideas/` 意图文档 + 一页纸方案（idea-refine Phase 3 收尾）；② 实现记忆模式 B。
- 命题融合审计（todo #12）：题眼「识别×回应×推动沟通」与 RULES「不安慰、只说自己」存在天然张力；已拟叙事解药——「回应=被看见」+「玩家为接住对方学会送出自己的一句」+「世界档案越长越大：被接住的人变成接住别人的人」。**尚未与用户过这一版叙事。**

## 5. 待办清单（本会话 todo 的镜像）

已完成(5)：死代码盘点 / 口径核对 / 死代码清理 / JudgePanel / 文档对齐。
进行中(2)：#6 turn 链记忆（等 B 确认）；#11 hasXai 改名 + session 减重 + avoidNames 死参数（顺手项）。
待办(14)：#7 match 链 AI 产出上 UI（现在大半被 store 丢弃，AI 必要性议题）；#8 facts 管线取舍（turn/seal 的 remember 结果现被丢弃，用则接线、弃则删步省 token）；#9 meter 补记 remember 步；#10 step() 失败短路 + 日志；#12 命题审计；#13 镜子「选句+选人」捆绑；#14 Throw 区域选择意义弱；#15 12 故事×24 局重玩多样性验证；#16 server fn 鉴权/限流（AI key 裸奔）；#17 A1 崩溃安全存档（return 阶段关页即丢整局）；#18 A2 文案（已顺手完成）；#19 A3 meter 重置（已顺手完成）；#20 回归验证（typecheck/lint/build + 真 key 全流程一局 + J 面板数据）；#21 演示材料终审（README 九步 vs 实际 phase、评委讲解稿）。

## 6. 建议的下一步顺序（供新会话开场用）

1. 拿记忆模式 B 的确认（interview-me 方式：一个 Q + GUESS）。
2. 拿组合包确认 → 落 `docs/ideas/world-archive-north-star.md`（意图 + 一页纸，含 Problem/Direction/Assumptions/MVP/Not Doing）。
3. 实现记忆模式 B（改动点：`runTurnChain` user prompt 注入最近 2 条 recall + RULES 补一句「最多轻轻点一下刚说过的那件事」）。
4. 并行轨道 A：P0 采集流水线 `scripts/collect/`（先 web_search 复核平台事实再动手）；轨道 B：todo #7/#8/#9/#10 一路清完 → 回归验证 → 演示材料。

## 7. 关键文件地图（改动过的文件）

- 删除：`src/game/agent/{graph,pi-echo}.ts`、`src/game/ai.ts`
- Agent 本体：`src/game/agent/{chains,server,types,config,llm,tools,memory}.ts` + `pipeline/`（match research 读手写+COLLECTED，live 短预算补空）
- 预采集：`scripts/collect/` → 生成 `src/game/collect.ts`；原文 JSONL 在 gitignored 的 `corpus/`
- 改动过的其他：`src/game/store.ts`、`src/game/components/JudgePanel.tsx`、`src/game/types.ts`、`scripts/probe-night.mts`、`package.json`、根目录三文档（README/agent.md/CODE_WIKI.md）
- 新增：`docs/reports/social-story-pipeline.md`、本文件
- 技能仓库（项目内，勿全局安装）：`/Users/mahaoxuan/Desktop/黑客松/AI PING/.dsh/agent-skills`