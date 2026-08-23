# Paper Echo（纸上的回声）· 产品需求文档（PRD）

> 版本：v1.0　|　面向：评委 + 开发者　|　状态：与代码对齐（`src/game/**` 实读）
> 项目：`/Users/mahaoxuan/Desktop/黑客松/AI PING/paper-echo`
> 技术栈：React 19 · TanStack Start · Vite · Tailwind v4 · Pi Agent（`@earendil-works/pi-agent-core` + `pi-ai`）· LLM = AI PING（`aiping.cn/api/v1`，DeepSeek-V4-Flash-0731）
> 本文件只描述产品与系统，不改代码；「待核实」处为未在代码/文档中 100% 确认的点。

---

## 0. 一句话定位与命题对齐

**一句话定位**：深夜，玩家把一句说不出口的话折成纸飞机，飞到世界上另一个「也说过类似话」的普通人那里——对方只说自己今晚的事，不安慰，不越界；一次投递换来一次「被看见」，也学会送出自己的一句。

**命题对齐（识别 × 回应 × 推动沟通）**——比赛命题「情感/情绪搜救：捕捉那些没被说出口、也没被接住的情绪，用 AI 识别、回应，并推动一次更好的沟通」的三个题眼在本品中的落地：

| 命题题眼 | 落地机制 | 代码/文档依据 |
|---|---|---|
| **识别**（捕捉没说出口的情绪） | 玩家在 Orbit 用 8 个情绪 token 拖拽摆放，系统按「离中心远近」计算 `Fingerprint`（情绪指纹），`ownedOf(fp, 0.42)` 判定「靠近/认领」；Agent 链内部还有一层 EFT 底层情绪识别（S1，标签不出口） | `src/game/emotions.ts` `closenessOf/fingerprintOf/ownedOf`；`docs/echo-skill-draft.md` §3 S1 |
| **回应**（被接住） | 对方（回声）只说自己今晚平行的具体的事，绝不安慰、绝不替玩家下结论——「回应 = 被看见」而非「被安慰」；用「平行经历接」（S2）替代「我懂你」 | `src/game/agent/chains.ts` `RULES`；`docs/echo-skill-draft.md` §2 H2、§3 S2 |
| **推动一次更好的沟通** | 玩家必须「先送出自己的一句」才能得到对方一句（chips/手写 → 折 → 投）；turn 链每轮都要求玩家先写/选一句，对方才回；结局的 `returnLetter`（回信）是对方「还留着什么」的开放结尾，留下下一次沟通的钩子（S5） | `src/game/store.ts` `reply()`、`saveReturn()`；`docs/echo-skill-draft.md` §3 S5 |

> 命题张力（已识别、未结算）：RULES「不安慰、只说自己」与题眼「回应/推动沟通」表面冲突。已拟叙事解药：「回应=被看见」+「玩家为接住对方而学会送出自己一句」+「世界档案越长越大，被接住的人变成接住别人的人」。详见 §9 与 `docs/HANDOFF.md` §4 命题融合审计。

---

## 1. 目标用户与使用场景

**目标用户**：
- 深夜有「说不出口的话」的普通人——社恐、内耗、怕被安慰也怕被分析的人。
- 需要「有人听，但不要被说教/安慰/追问」的情绪出口。
- 也包含愿意「只说自己的事，去平行接住陌生人」的人（即回声视角，玩家在结局被邀请成为档案的一部分）。

**核心场景（主循环）**：深夜独处 → 摆情绪 → 照见一句相似的话（镜子）→ 折纸飞机 → 掷向世界某处 → 收到一个陌生普通人「只说自己的事」的回音 → 两三句来回 → 收到一封「回信」 → 收进信柜。

**设计红线（全流程）**：**手是唯一的提交，点一下不算。**（`README.md`）所有关键动作都是手势（拖/折/拉/松开），不是按钮点击；`reduced-motion` 用户回退为 tap/Enter（`src/game/components/continuum.tsx`）。

**非目标（Not Doing）**：不是心理咨询、不是树洞机器人、不是交友匹配；无好友、无关注、无真实即时通信（p2p 基础设施遗留但未接入主流程）。

---

## 2. 核心体验与完整游玩循环（10 个 Phase）

`Phase` 定义于 `src/game/types.ts`，共 10 个：`title / orbit / mirror / compose / fold / throw / flight / encounter / return / archive`。`JOURNEY` = 9 步（不含 `title`/`archive`）；`CAN_BACK` = `["orbit","mirror","compose","fold","throw","archive"]`（可返回的节点）。

下面每阶段标注 **手势 → 触发 → 产出 → 状态变化**。手势阈值常量见 `src/game/motion.ts` 与 `src/game/components/continuum.tsx`。

### Phase 0 · title（标题）
- **手势**：下拉 `PullCommit`（阈值 56）「松开，进房间」。
- **触发**：`unlockAudio()` + `startPad()` + `startNew()`（`src/game/phases/TitlePhase.tsx`）。
- **产出**：进入 `orbit`；若 `journeys` 非空，显示「信柜 N」，下拉（阈值 42）→ `goArchive`。
- **状态变化**：重置全部状态（`startNew`），解锁音频。

### Phase 1 · orbit（情绪摆盘）
- **手势**：8 个情绪 token 拖拽（`useDrag` + `clampToRing` + `untangle`，`OrbitPhase.tsx`）；中心「你」Blob `PullCommit`（enabled = `owned>0`，阈值 56）「松开，带着走」。
- **触发**：`commitOrbit()`（`src/game/store.ts`）。
- **产出**：`fingerprintOf(tokens)` 得 `Fingerprint[]`；`ownedOf(fp, 0.42)` 得「靠近/认领」情绪 `feels`；`matchStories(feels, 3, avoid)` 得 3 张镜子候选；`chipPool(fp)` / `replyPool(fp)` 备好 chips/replies。
- **状态变化**：`phase → mirror`；`candidates/chips/replies` 就绪。
- **识别语义**：closeness = 离中心越近越高（`1-(d-MIN)/(MAX-MIN)`），`MIN_RADIUS=26`、`MAX_RADIUS=44`、`CENTER={x:50,y:48}`（`types.ts` 常量）。

### Phase 2 · mirror（镜子选句 = 选人）
- **手势**：3 张 story 卡 `useWellDrag` 拖到桌面 well（`floor:true`）。
- **触发**：`pickMirror(storyId)`。
- **产出**：选定 story → `selectedMirror = story.opening`；`region = story.region`；`echo = storyToEcho(story)`（`source:"archive"` 的 EchoPerson 先落地，match 链再决定是否换成 live 身份）；`chips/replies` 重置。
- **状态变化**：`phase → compose`。
- **关键语义**：**选句与选人绑定**（Mirror 阶段选的句子 = 绑定的人物，echo 永远非空）。这是已知未结算议题 B2/§9（`docs/HANDOFF.md`）。

### Phase 3 · compose（折信）
- **手势**：chips 拖到纸 well（`useWellDrag`）→ `addChip`（≤5 个，`store.ts`）；可手写 `extra`（≤42 字）；`PullCommit(sign=-1, threshold 52)`「松开，开始折」。
- **触发**：`startFold()`。
- **产出**：`letter = letterFromChips(letterChips, extraLine)`（`kernel.ts`，空则默认「今晚我想把一句说不出口的话折起来。」）。
- **状态变化**：`phase → fold`。

### Phase 4 · fold（折纸飞机）
- **手势**：两次折纸手势（对角拉，速度 `v > 0.42` 折住），第 3 次把飞机往上送到窗（`up > 40`）。
- **触发**：`goThrow()`。
- **产出**：飞机成形、送到窗边。
- **状态变化**：`phase → throw`。

### Phase 5 · throw（掷向世界）
- **手势**：Globe（`cobe`）转地球选区域；弹弓拉飞机（`power = FIRE_THRESHOLD 0.22` 释放，`FULL_THRESHOLD 0.86`，`MAX_PULL_PX 168`，橡皮筋 `rubberY`）。
- **触发**：`fire` → `launch(p)`（`store.ts`）。
- **产出**：`runMatch`（Promise.race 22s 超时）。成功 → `sfxMatch` + 更新 `echo`/`greeting`（经 `ownLine` 校验）+ `suggestions`（playerHand）+ `hits` + `meter` + `session` + `recall=[{who:"echo",text:greeting}]`；失败 → `fallbackEcho`（本地故事卡）+ `emptyMeter` + `searchNote「线路不稳，改从本地故事里取一封相近的信」`。
- **状态变化**：`phase → flight`，`searching=true`。

### Phase 6 · flight（飞行/搜寻）
- **手势**：`searching` 时飞机自动巡航 + 进度条，手不能跟飞、不能躲障；`found` 后 `PullCommit(threshold 48)`「松开，落到桌上」。
- **文案**：寻找中 / 找到后都用 `searchNote`。不演跟飞、躲障、窗光穿梭。
- **触发**：`arrive()`。
- **产出**：对方「读完了你的信」。
- **状态变化**：`phase → encounter`。

### Phase 7 · encounter（相遇对话）
- **手势**：对话气泡（recall）；建议卡片（`suggestions` 或 `playerHand`，3 条）`useWellDrag` 拖到桌 → `reply(text)`；可手写自己一句（≤28 字）。`waitingEcho` 时显示对方正在写的骨架。
- **触发**：`reply(text)`（`store.ts`，`waitingEcho` 防重入）。`round<3` → `runTurn`（12s 超时）；`round>=3` → `runSeal`（14s 超时）→ `phase return`。
- **产出**：turn 成功 → `spoken` 经 `ownLine` + `foreignPlace` 校验后 append 到 `echo.replies`；失败 → 用 `replies[round]` 或默认「我那晚也没睡。电脑还亮着。」。seal 成功 → `returnLetter`。
- **状态变化**：turn → `round+1`、`recall` 追加、`suggestions` 更新；seal → `phase return`。

### Phase 8 · return（回信）
- **手势**：回信下拉（`y>28` 拆开显示 `returnLetter`，`y>108` 归档）。
- **触发**：`saveReturn()`（`store.ts`）。
- **产出**：`buildJourney`（含 fingerprint/mirror/letter/chips/region/echo/transcript/returnLetter）→ `journeys slice(0,24)` + `persistJourneys`；`keepPlayerFacts` + `applyFacts` → `persistArchival`。
- **状态变化**：`phase → archive`。

### Phase 9 · archive（信柜）
- **手势**：`journeys` 列表（`openJourney` 读详情：letter + returnLetter）；`archival` 前 6 条「还记得的事」；`PullCommit(sign=-1, threshold 36)`「松开，抽出一张」。
- **触发**：`startNew()`（重置全部状态）。
- **产出**：开始新一局。
- **状态变化**：回到 `orbit`（或标题）。

> **手是唯一提交**：以上每个 `PullCommit`/`useWellDrag`/折纸/弹弓都是「拖动 + 松手提交」，没有「点一下确认」按钮。`reduced-motion` 回退为 tap/Enter（`continuum.tsx`）。

---

## 3. 情绪系统

**8 情绪**（`src/game/types.ts` `EmotionId`）：

| id | 中文 label | hint 方向 |
|---|---|---|
| `gloom` | 郁闷 | — |
| `wronged` | 委屈 | — |
| `anxious` | 焦虑 | — |
| `tired` | 疲惫 | — |
| `lonely` | 孤单 | — |
| `anger` | 愤怒 | — |
| `calm` | 平静 | — |
| `unseen` | 想被看见 | — |

每个 `Emotion` 结构：`{id, label, hint, color, ink, shape, mirrors:[2], chips[], replies[]}`（`types.ts`）——`mirrors` 是匹配镜子的情绪、`chips` 是可折进信的碎片、`replies` 是回音兜底句。

**指纹 Fingerprint**：`{id: EmotionId, closeness: number}`。计算链（`emotions.ts`）：
- `closenessOf`：离中心越近越高，`1-(d-MIN)/(MAX-MIN)`。
- `fingerprintOf(tokens)`：按 closeness 降序。
- `ownedOf(fp, min=0.42)`：closeness ≥ min 的情绪；无则取 top1。`commitOrbit` 用 0.42，`saveReturn`/`applyFacts` 用 0.3。

**mirror / chips / replies 各自作用**：
- **mirrors**：决定「镜子（相似句子）候选」的情绪匹配源；但 mirror 阶段实际显示的句子来自 `stories.ts` 的 `opening`（`matchStories` 按 feels 重叠排序），而非 `Emotion.mirrors` 文本（`mirrorLines` 见 §10 待清理）。
- **chips**：可折进信的「情绪碎片」——`chipPool(fp)` = `ownedOf(0.3)` top3 的 chips + 固定一条「我电脑里也有一堆没人看的」，去重 `slice(0,9)`；玩家在 compose 挑 ≤5 个拼成信。
- **replies**：回音兜底句库——`replyPool(fp)` = `ownedOf(0.3)` top3 的 replies 去重 `slice(0,6)`；turn 链失败/校验不过时回退到 `replies[round]`（`store.ts reply()`）。
- `playerHand(fp, chips, used)`：为玩家生成建议句（过滤「你」开头），在 encounter 作为兜底建议（`emotions.ts`）。

---

## 4. 回声与故事卡

**12 个 Story 卡**（`src/game/stories.ts` `STORIES`，实测 s1–s12；HANDOFF/CODE_WIKI 旧口径「18」为笔误，以代码为准）：

| id | 名字 | 城市 | 区域 |
|---|---|---|---|
| s1 | 林予 | 杭州 | east |
| s2 | Mara | Lisbon | europe |
| s3 | Jonah | Chicago | america |
| s4 | 阿宁 | 成都 | east |
| s5 | Sefu | Nairobi | africa |
| s6 | Hana | Auckland | oceania |
| s7 | Iris | Tromsø | polar |
| s8 | Diego | Valparaíso | america |
| s9 | 美咲 | 札幌 | east |
| s10 | Leila | Marrakesh | africa |
| s11 | Owen | Edinburgh | europe |
| s12 | Priya | Melbourne | oceania |

每个 `Story`：`{id, name, city, region, feels:[3], opening, lines:[2], returnLetter}`。`feels`（3 个情绪）用于匹配；`opening` 是「镜子」显示的相似句子；`lines[2]` 是回音兜底句；`returnLetter` 是结局回信兜底。

**6 区域**（`REGIONS`，`label/city/lat/lng`）：`east` 东亚·杭州、`america` 美洲·芝加哥、`europe` 欧洲·里斯本、`africa` 非洲·内罗毕、`oceania` 南半球·奥克兰、`polar` 极夜·特罗姆瑟。

**匹配逻辑**：
- `matchStories(feels, n, avoid)`：按情绪重叠排序 + 区域去重 + `avoid` 跳过；三级 fallback（先去重区域+跳过 avoid → 再忽略区域 → 再全忽略）。
- `matchStory(feels, region)`：`overlap*2 + (region 同 ? +1.4 : 0)`。
- `storyToEcho(story)` → `EchoPerson{source:"archive"}`。
- `foreignPlace(text, name, city)`：检测回音是否串了别的人名/城市名（校验闸门用）。

**EchoPerson**（`types.ts`）：`{name, city, felt, greeting, replies[], returnLetter, source:"live"|"archive"}`。`source` 区分「live（match 链 AI 产出）」与「archive（本地故事卡）」——`stay`/`live` 合并逻辑见 `store.ts launch()`。

**兜底回音**：`fallbackEcho(fp, region)` = `storyToEcho(matchStory(...))`（`kernel.ts`）——无 key/失败/超时时的本地回音。

---

## 5. 记忆系统

**存储**（`src/game/agent/memory.ts`）：
- `journeys`（整局记录）：localStorage 键 `paper-echo-v1`，≤24 局（`store.ts` `slice(0,24)`）。
- `archival`（世界档案 = 长期记忆）：localStorage 键 `paper-echo-memory-v2`，`VERSION 3`，`CAP 48` 条。存 `MemoryRecord{id, memory, emotions[], region?, echoName?, createdAt}`。

**检索（Jaccard）**：
- `tokensOf`：unigram + bigram（中文连续字 + 拉丁词）。
- `jaccard(a,b)`：集合相似度。
- `searchArchival`：`Jaccard*2 + emotion overlap*0.4 + regionBonus 0.35 + recency*0.3`，过滤 `n>0.06`，`topK 5`（用于 `search_archive` 工具与 `researchStep`）。

**去重 / 合并**：
- `applyFacts`：Jaccard ≥0.48 合并（取更长的），<0.88 新增，去重，`slice(0, CAP)`。
- `stolenVoice`：Jaccard ≥0.4 或 clip 命中且含「我」→ 判定偷玩家旧事（禁止回音复述玩家）。
- `parroted`：Jaccard ≥0.55（禁止复读）。

**校验**：
- `ownLine(spoken, fallbacks, archival, used?)`：接受 `spoken`，否则逐 fallback；禁 `isInstruction`/`stolenVoice`/`banned`/`parroted`；`first`（无 archival）禁「你上次/你留着/你那晚/你跟+说过」。
- `keepPlayerFacts(facts, playerTexts)`：从玩家原话提事实（Jaccard 0.22 匹配）`slice(0,8)`。

**给 Agent 的组装**：
- `perceptionOf`：「今晚靠近：{label} {closeness%}…。认领过一句…。他折进来的原话…。飞向…」。
- `factsOf`：「玩家曾说「{memory}」（那晚对过{echoName}）」，`slice(0,10)`。
- `renderBlocks(persona, facts)`：`# Persona` + `# Human` 块（`coreBlocks` 用）。

**会话内短期记忆**：`recall: {who:"you"|"echo", text}[]`（store 状态，不落盘），即「当晚这几句对话」——目前 turn 链只看到「玩家刚说的那句 + 旧档案」，看不到当晚前几轮（§9 记忆模式 B 待确认）。

---

## 6. Agent 系统（重点）

### 6.1 三层架构（L1 游戏 / L2 Agent 业务 / L3 基座）

`docs/agent.md` 定义的三层，与代码一一对应：

| 层 | 职责 | 代码位置 | 核心边界 |
|---|---|---|---|
| **L1 游戏层** | 手势、状态机、store、渲染；**不读 LLM** | `src/game/store.ts`、`phases/**`、`components/**` | 只调用 server fn，消费结构化结果 |
| **L2 Agent 业务层** | 三链编排、工具、记忆、校验闸门；**不直接 fetch** | `src/game/agent/chains.ts`（唯一生产运行时）、`server.ts`、`tools.ts`、`memory.ts`、`types.ts`、`config.ts`、`llm.ts` | 通过 `createServerFn` 暴露给客户端 |
| **L3 基座** | Pi Agent（短命 agent + streamSimple）、LLM（AI PING DeepSeek-V4-Flash-0731） | `chains.ts` 的 `step()`（`new Agent` + `streamSimple`）、`config.ts` | **工具只做数据查询/写入，模型只负责说** |

**LLM 配置**（`src/game/agent/config.ts`）：`baseUrl = aiping.cn/api/v1`、`apiKeyEnv = "AI_PING_API_KEY"`、`modelId = DeepSeek-V4-Flash-0731`、`contextWindow = 131072`、`maxTokens = 1024`、`temperature = 0.7`、`timeoutMs = 15000`。

### 6.2 三条 Prompt Chain（match / turn / seal）

`server.ts` 暴露 `runMatch/runTurn/runSeal` 三个 `createServerFn(POST)`（validator 传参，动态 `import("./chains")`，`packSession/unpackSession` JSON 序列化）。每条链 = **确定性 research → 单工具短命 Pi Agent 步 → 确定性 validate**（`chains.ts`）。

**`step()` 机制**：短命 Pi Agent（`new Agent` + `streamSimple`），`shouldStopAfterTurn` = 无工具调用或超 `maxTurns`；每步 `Promise.race` 超时；失败按空结果（`chains.ts`）。`cleanOneLine(text, maxLen=56)` 剥离工具调用行、取前 2 句、截断。

**match 链**（投纸飞机 → 找到对方）：
1. `researchStep`（确定性 `search_cases` + `search_archive`）
2. `match-persona`（LLM 仅 `arrive` 工具 → 锁定身份）
3. `match-greeting`（LLM 零工具，≤28 字）
4. `validate`（`ownLine` + `foreignPlace`）

**turn 链**（玩家回复 → 回一句）：
1. `research` → 2. `turn-remember`（仅 `remember`）→ 3. `turn-reply`（仅 `arrive`，≤28 字）→ 4. `validate`

**seal 链**（结束 → 写回信）：
1. `research` → 2. `seal-remember`（仅 `remember`）→ 3. `seal-write`（零工具，≤48 字）→ 4. `validate`

**RULES（人设铁律，`chains.ts` 常量）**：核心内容——「你是深夜还没睡的一个普通人。只说你自己今晚的具体事，像微信，一两句。不安慰。禁止：看见、接住、值得、不是一个人、加油。工具用协议调用… # Human 是玩家以前的事… arrive 落下名字城市三句新细节…」。每步 system prompt = `${RULES}\n\n${coreBlocks(rt)}` 开头（对应 `echo-skill-draft.md` §4 指出的注入点）。

### 6.3 四个工具

`src/game/agent/tools.ts` `runAgentTool` 定义 3 个 + `chains.ts` 内联 1 个（共 4）：

| 工具 | 位置 | 作用 | 约束 |
|---|---|---|---|
| `search_archive` | tools.ts | `searchArchival` 检索长期记忆 | 数据查询 |
| `search_cases` | tools.ts | `STORIES` 确定性排序（按 feels 重叠） | 数据查询 |
| `remember` | tools.ts | 记玩家原话/事 | ≥4 字、拒绝 `isInstruction`、`slice(0,24)` |
| `arrive` | chains.ts `makeArriveTool` | 落下名字/城市/三句新细节（锁定身份） | `lockIdentity`，不重复 Human、不重复刚说的 |

> 边界（`agent.md`）：工具只做数据查询/写入，模型只负责说；工具调用用协议，禁止把工具名写进句子。

### 6.4 fallback 三层（§8 详述）

无 key（`!hasXai()`）→ 链开头直接 `fallbackFor(...)`（本地 echo/greeting/pool）；LLM/工具失败 → 步级空结果短路；store 层超时（match 22s/turn 12s/seal 14s）→ `fallbackEcho` / `replies[round]` / 默认句。

### 6.5 回声的「声音 + 硬边界 + 软引导」（来自 `docs/echo-skill-draft.md`）

这是把 `chains.ts` 的 `RULES`（纯负向禁令）升级为「硬边界（红线，禁）+ 软引导（教它怎么做，引）」两层，并统一声音为「A 纯口语」的设计稿（讨论稿 v0，已认可 §1–§4）。**判据与注入位置如下**：

**声音底座（V1–V3，所有链常驻）**：
- **V1 写「事」不写「状态」**：有具体时间/地点/动作/物件，不堆情绪形容词。反例「我最近很低落」；正例「外卖凉透了」。
- **V2 不碎**：一两句自然流动，不蹦豆子。反例「嗯。我。今晚。没睡。」；正例「我那晚也没睡，把台灯拧到最暗改到三点。」。
- **V3 零剧场腔/意象腔**：不写诗、不写金句。反例「夜色像没拧紧的水龙头」；正例「楼下便利店还亮着灯，我下去买了包烟。」。

**硬边界 H1–H3（红线，违反即重写）**：
- **H1 只说自己**：每句主语/指代是「我」；不替对方说感受、下判断、改口吻。例外：最多点一下「你上次…」点到即止。反例「你改了十七稿，没人看见，一定很委屈。」。
- **H2 零安慰**：不出现安慰/定性/拥抱语。可机测词表：`看见 / 接住 / 值得 / 不是一个人 / 加油 / 我懂你 / 会好 / 抱抱 / 没事的 / 辛苦了 / 你已经很棒了`。反例「会有人看见的，加油。」。
- **H3 不越界**：不评判、不分析、不建议、不替对方下结论、不追问隐私。反例「你太在意别人的看法了。」「别想太多。」。

**软引导 S1–S5（引，教它怎么做）**：
- **S1 先听懂底层情绪**（EFT，内部步骤，标签不出口）：识别「要认可/怕被否定/想被连接/怕白费」，出口只能是平行自己的事。
- **S2 用平行经历接**（自我暴露，对等适度）：把「我懂你」翻译成「我也有过类似的」。
- **S3 写事不写状态**（= V1 正面动作）。
- **S4 不评判不评价**（NVC）：只说观察/事实，不贴标签。
- **S5 留钩子推进**（MI/反思性倾听）：钩子长在自己身上，不问对方。反例「你呢？」。

**注入位置（对应 `chains.ts` 每步 system prompt）**——`echo-skill-draft.md` §4：

| 链 / 步骤 | 注入 |
|---|---|
| match Step1 `decidePersona`（arrive） | 常驻层 + **S1** |
| match Step2 `greeting`（≤28 字） | 常驻层 + **S2 + S3 + S5** |
| turn Step1 `remember` | 常驻层（H1/H3 足够） |
| turn Step2 `reply`（arrive，≤28 字） | 常驻层 + **S1–S5 全量**（「接住」核心步） |
| seal Step1 `remember` | 常驻层（H1/H3） |
| seal Step2 `writeReturnLetter`（≤48 字） | 常驻层 + **S2 + S3 + S5**（保留「不问玩家留没留」） |

> 关键：**S1 是内部步骤**，不进任何输出示例，只作为「先在内部听懂」的指令，防模型把情绪标签说出口。常驻层 = 声音底座 + 硬边界（红线永远在）；软引导按步骤拆开（避免全量糊上去稀释语义聚焦）。

### 6.6 如何基于 Penguin Agent（回声 Agent State）搭建，便于评测/调优

回声本质上是一个**可独立评测、可调优的 Agent**。落地方式（对 `chains.ts` + `echo-skill-draft.md` 的映射，不引入新机制）：

**① 进 AGENTS.md（回声 Agent State 的常驻系统提示）**：
- **身份锚**：`# Persona「你是{名}，在{城}」` + 行为锚（`renderBlocks` / `coreBlocks`）——对应 `chains.ts` RULES 首句 + `# Persona` 块。
- **声音底座 + 硬边界**（V1–V3 + H1–H3）作为**常驻层**，永远注入每步——即 `RULES` 升级后的常驻部分。
- **软引导 S1–S5** 作为**步骤层**，按 6.5 表格拆到各步，而不是整段糊进 AGENTS.md。
- **工具协议 + arrive/remember 机制规则**原样保留（`echo-skill-draft.md` §6：机制规则不属于「声音」，不重写）。

**② 可观测（运行时，给评委按 J 看）**：
- `TokenMeter{node, via, model, total, prompt, completion}`（`llm.ts` `meterOf`/`emptyMeter`）——链上每步 token 与节点标记，`JudgePanel` 显示。
- `hits`（用了哪些检索命中）、`recall`（当晚对话）、`archival`（世界档案，显示「用了 N 条」）、`core.persona`（0/1）、`owned` 情绪百分比（`JudgePanel.tsx`）。
- `JudgePanel` 文案已统一为「Prompt Chain · match/turn/seal 三链…确定性检索→单工具 LLM 步→校验闸门」「无 API Key/超时自动回退本地故事卡」。

**③ 可打分（离线评测，`echo-skill-draft.md` §5 simple-first）**：
- **扁平 case 表**（每行一条测试输入）：字段 `id/chain/emotion/input/expect`；覆盖 GUESS = turn 8 情绪各 1 条 + match/seal 各 3 条 = **14 条**。
- **两层判分**：机械判（正则/词表，可复现）+ 语义判（LLM 裁判，引用 §2/§3 判据）。
- **配比**：H1/H2/H3 各 20（违反即 0）→ 60；S1–S5 各 5 → 25；V1–V3 各 5 → 15。红线全过保底 60。
- **跑分顺序**：建 case 表 → 跑一次现状 RULES 拿基线 → 落地 skill → 重跑对比 → 迭代。

### 6.7 ADP（Agent Design Patterns）对照

对照 `docs/.../adp/` 21 章，本项目**已用/可借鉴**如下（不强行加模式）：

| ADP 章节 | 状态 | 说明 |
|---|---|---|
| Ch1 Prompt Chaining | **已用（核心）** | 三链分而治之、每步单任务、步骤间插确定性逻辑（research→LLM→validate） |
| Ch2 Routing | 部分 | match/turn/seal 按 `round` 阈值路由到 turn 或 seal（`store.ts reply()`）；区域/情绪用确定性规则路由 |
| Ch4 Reflection | 未用（可借鉴，谨慎） | 生成器-评审者自我纠正；代价是延迟+成本，与 15s 超时/token 预算冲突，暂不引入 |
| Ch5 Tool Use | **已用（核心）** | 4 工具（search_cases/search_archive/remember/arrive），LLM 决策→执行→观察 |
| Ch6 Planning | 固定工作流 | 「方法已知」→ 固定工作流比动态规划更稳（三链即固定工作流） |
| Ch7 Multi-Agent | 未用（可借鉴） | 短命 Pi Agent 单步即弃；多 Agent 顺序交接暂不需要（单链足够） |
| Ch8 Memory | **已用（核心）** | 短期=recall/上下文窗口；长期=localStorage archival + Jaccard 检索（对应 ADK Session/Memory 两层） |
| Ch18 Guardrails | **已用（核心）** | 多层防御：输入 validate 闸门 + 输出 `ownLine`/`foreignPlace`/禁词表 + 工具限制 + 无 key/超时兜底 |
| Ch19 Evaluation | 部分 | `TokenMeter` + `JudgePanel` 可观测；echo-skill §5 case 表 + LLM-as-a-Judge 是待落地的评测闭环 |

> 结论：本项目是「Prompt Chaining + Tool Use + Memory + Guardrails」四模式的精简落地，刻意不引入 Reflection/Planning/Multi-Agent 的重机制（与 token/延迟预算、`simple first` 原则一致）。

---

## 7. 数据模型契约（types 及其关系）

`src/game/types.ts`（游戏态）+ `src/game/agent/types.ts`（Agent 契约）两处。关系图（文字版）：

```
Phase（10） → store.GameState
Emotion（8）→ tokens/fingerprint → Fingerprint[]
Fingerprint{id,closeness}
Story（12）→ matchStories → EchoPerson（storyToEcho）
EchoPerson{name,city,felt,greeting,replies[],returnLetter,source}
Journey{id,createdAt,fingerprint,mirror,letter,chips,region,echo,transcript,returnLetter}
MemoryRecord{id,memory,emotions[],region?,echoName?,createdAt}（archival ≤48）
CoreMemory{human,persona}
TokenMeter{prompt,completion,total,model,via,node}
NightInput → （runMatch/runTurn/runSeal） → NightResult
```

**游戏态（`src/game/types.ts`）**：
- `Phase`：`"title"|"orbit"|"mirror"|"compose"|"fold"|"throw"|"flight"|"encounter"|"return"|"archive"`。
- `EmotionId`：`gloom|wronged|anxious|tired|lonely|anger|calm|unseen`。
- `RegionId`：`east|america|europe|africa|oceania|polar`。
- `Emotion`：`{id, label, hint, color, ink, shape, mirrors:[2], chips[], replies[]}`。
- `Fingerprint`：`{id: EmotionId, closeness: number}`。
- `Story`：`{id, name, city, region, feels[], opening, lines:[2], returnLetter}`。
- `EchoPerson`：`{name, city, felt, greeting, replies[], returnLetter, source:"live"|"archive"}`。
- `Journey`：`{id, createdAt, fingerprint, mirror, letter, chips, region, echo, transcript:{who:"you"|"echo",text}[], returnLetter}`。
- `TokenMeter`：`{prompt, completion, total, model, via:"live"|"archive", node}`。
- `CoreMemory`：`{human, persona}`。
- `MemoryRecord`：`{id, memory, emotions[], region?, echoName?, createdAt}`。
- 常量：`CENTER={x:50,y:48}`、`MIN_RADIUS=26`、`MAX_RADIUS=44`、`JOURNEY`（9 步）、`CAN_BACK`（6 步）。

**Agent 契约（`src/game/agent/types.ts`）**：
- `NightInput`：`{fingerprint, letter, mirror, region, echo?, playerLine?, recall?, archival, coreHuman?, corePersona?, avoidNames?, session?}`。
- `NightResult`：`{echo, spoken, suggestions, facts, hits, session, persona, human, meter}`。
- `RecallItem`：`{who:"you"|"echo", text}`。
- `LlmConfig`：`{baseUrl, apiKeyEnv, modelId, contextWindow, maxTokens, temperature, timeoutMs}`。

**关键关系**：
- `EchoPerson` 是 `Story` 与 `Journey` 的桥梁：`storyToEcho(story)` 产出 `source:"archive"` 的 EchoPerson；match 链 `arrive` 产出 `source:"live"` 的 EchoPerson；`Journey.echo` 记录「那晚对的是谁」。
- `Journey.transcript` 与 `MemoryRecord` 分别是「整局记录」与「跨局长期记忆」：`saveReturn` 时 `keepPlayerFacts`+`applyFacts` 把事实写入 archival。
- `NightInput.archival`/`coreHuman`/`corePersona`/`recall`/`session` 由 `store.agentPayload()` 组装（`store.ts`）。

---

## 8. 边界与回退

**无 API Key**：`hasXai()`（`llm.ts`，检测 `AI_PING_API_KEY` 存在）为 false 时，三条链开头 `if (!hasXai()) return fallbackFor(...)`（`chains.ts`），走本地 echo/greeting/pool——**离线可完整走完一局**（本地故事卡 + chips/replies 兜底 + 手写）。

**超时**（`store.ts` 层 Promise.race）：match 22s / turn 12s / seal 14s；链内各步另有 7~15s（`config.timeoutMs=15000` + `step()` 内 race）。超时 → `fallbackEcho`（本地）或 `replies[round]` / 默认句「我那晚也没睡。电脑还亮着。」。

**失败/校验不过**：`ownLine(spoken, fallbacks, archival)` 逐 fallback；`foreignPlace` 拦截串词；turn/seal 失败用本地 `replies` 或 `returnLetter` 兜底。

**截断闸门**：`cleanOneLine(text, maxLen=56)` 剥离工具调用行、取前 2 句、截断（turn 28 字、seal 48 字分别再收紧）——保证输出「一两句」且前两句内完成 V2/S5。

**validate 闸门**：每条链末步确定性 `validate`（`ownLine` + `foreignPlace` + 禁词表），不通过则回退，不把不合格句子呈现给玩家。

**离线完整可走**：无 key + 失败 + 超时三层兜底下，玩家仍能从 title 走到 archive（本地 12 Story 卡 + 8 情绪 chips/replies + 手写 letter/returnLetter），核心体验不因 AI 不可用而中断。

**安全边界（已知裸奔，待办）**：server fn（`runMatch/runTurn/runSeal`）目前无鉴权/限流，AI key 经 server fn 调用（客户端不直接暴露 key，但服务端无鉴权），见 §9 todo #16。

---

## 9. 已知问题 + 悬而未决决策（源自 `docs/HANDOFF.md` §4/§5）

### 悬而未决（§4，下一步第一件事）
1. **【最高优先】turn 链记忆模式未确认**：现状 = 对方每轮只能看到「玩家刚说的那句 + 旧档案」，看不到当晚前几轮 → 会「前言不搭后语」。方案：
   - **A 全记得**（近 6 句，易咨询化）
   - **B 半记得**（**推荐**：注入最近 2 条 recall + 防矛盾，最合「窗边感」）
   - **C 保持失忆**
   - **未获用户点头前不实现**。
2. **【次优先】北星组合包未最终确认**：方向 =「A 活档案为主 + C 玩家入池为增长 + B 精选源并入 A」（ASSESS 已给 GUESS=对，等用户明确 yes）。确认后：① 写 `docs/ideas/` 意图文档 + 一页纸方案；② 实现记忆模式 B。
3. **命题融合审计（todo #12）**：题眼「识别×回应×推动沟通」与 RULES「不安慰、只说自己」的张力；已拟叙事解药（§0 表格末行）——「回应=被看见」+「玩家为接住对方学会送出自己一句」+「世界档案越长越大」。尚未与用户过这版叙事。

### 待办清单（§5，全列）
- **已完成(5)**：死代码盘点 / 口径核对 / 死代码清理 / JudgePanel / 文档对齐。
- **进行中(2)**：
  - **#6 turn 链记忆**（等 B 确认）
  - **#11 hasXai 改名 + session 减重 + avoidNames 死参数**（顺手项）
- **待办(14)**：
  - **#7** match 链 AI 产出上 UI（现在大半被 store 丢弃，AI 必要性议题）
  - **#8** facts 管线取舍（turn/seal 的 remember 结果现被丢弃，用则接线、弃则删步省 token）
  - **#9** meter 补记 remember 步
  - **#10** step() 失败短路 + 日志
  - **#12** 命题审计（见上）
  - **#13** 镜子「选句+选人」捆绑
  - **#14** Throw 区域选择意义弱
  - **#15** 18 故事×24 局重玩多样性验证（注：实际 12 故事，口径待更）
  - **#16** server fn 鉴权/限流（AI key 裸奔）
  - **#17** A1 崩溃安全存档（return 阶段关页即丢整局）
  - **#18** A2 文案（已顺手完成）
  - **#19** A3 meter 重置（已顺手完成）
  - **#20** 回归验证（typecheck/lint/build + 真 key 全流程一局 + J 面板数据）
  - **#21** 演示材料终审（README 九步 vs 实际 phase、评委讲解稿）

---

## 10. 待清理清单（dead code / 未接线项，逐条独立确认）

> 已通过 `grep -rn` 逐条核实（见每条「核实」标注）。「建议动作」分三档：**删**（确定死代码）/ **接线或删**（未消费）/ **待核实**（拿不准）。

| # | 文件 | 问题 | 建议动作 |
|---|---|---|---|
| 1 | `src/game/agent/llm.ts:28` `hasXai()` | 命名历史遗留（原 xAI 检测），现实际检测 `AI_PING_API_KEY` 存在；引用处 `chains.ts:22/286/373/443` | **改名** `hasApiKey` / `hasLiveModel`，同步 3 处调用 |
| 2 | `src/game/agent/types.ts:46` + `server.ts:23/83` + `store.ts:125` `avoidNames` | 死参数：store 组装传 `s.journeys.map(j=>j.echo.name).slice(0,8)`，server 传入 `NightInput`，但 `chains.ts` 内无任何步骤消费（已 grep 全 `src` 仅上述 4 处，chains.ts 零引用）。match 身份实际被 `arrive` 锁定 | **删除**，或接线（在 researchStep/match 时用于排除已出场人物） |
| 3 | `src/game/agent/types.ts:47` + `server.ts` `session` | 注释明写「链运行标记账本（非 LLM 消息）」；match/turn/seal 仅 push 一次 `{chain,steps}` 或透传，`packSession/unpackSession` JSON 序列化往返，但无任何消费价值（store 侧 `session` 只存不回读） | **减重或删除**（保留 `emptyMeter` 类似的最小透传即可，或彻底移除 pack/unpack） |
| 4 | `src/game/agent/llm.ts:17` `addMeter()` | 已核实：仅定义，全 `src` 无调用（`chains.ts` 用手动 `step1.meter + step2.meter` 累加，`meterOf`） | **删除** |
| 5 | `src/game/emotions.ts:236` `mirrorLines()` | 已核实：仅定义，全 `src` 无引用。mirror 阶段实际用 `stories.ts` 的 `opening`（`matchStories`）作镜子文本，`Emotion.mirrors` 数组本身也未被取文本 | **删除**（或明确 `Emotion.mirrors` 字段的用途后一并清理） |
| 6 | `src/game/agent/server.ts:32/41/48/98/113/126` `facts` + `chains.ts` 产出 `facts` | 未接线：三链产出 `facts`、server 返回 `MatchResult.facts/TurnResult.facts/SealResult.facts`，但 `store.ts` 消费侧只读 `res.hits/meter/session/core`，从不读 `res.facts`（已核实） | **接线或删**：对应 todo #8——用则把 `facts` 落到 store 供 JudgePanel/下一步注入；弃则删 `remember` 结果组装省 token |
| 7 | `src/game/store.ts:92/93/154` `cabinetCore()` 的 `core.human` | `cabinetCore()` 已用 `factsOf(loadArchival())` 算 `human`；match 成功用 `res.core` 覆盖，match 失败用 `human:""`。`core.human` 是否还有独立消费点需核实（JudgePanel 只用 `core.persona` 显示 0/1，不用 `human`） | **待核实**：确认 `core.human` 是否被 `agentPayload → NightInput.coreHuman → chains` 实际使用；若仅 match 时由 res.core 覆盖，cabinetCore 的 human 预算是冗余 |
| 8 | `src/game/phases/EncounterPhase.tsx:50` + `store.ts` `suggestions` | `options = suggestions.length ? suggestions : playerHand(...)`——match/turn 返回的 `suggestions` 直接 set，但 turn 链实际返回 `suggestions = rt.draft.lines`（非 echo 说的话），而 store 成功分支又用 `playerHand` 重新覆盖（`store.ts:265/352/360`），`res.suggestions` 几乎被丢弃 | **核实接线**：决定 suggestions 到底用「AI 产出的建议」还是「playerHand 本地」，避免 AI 产出白算 |
| 9 | `src/game/store.ts:92-95` `CoreMemory.persona` | `cabinetCore()` 初始化 `persona:""`；仅 match 失败路径设 `persona:"你是{name}在{city}"`（`store.ts:280`）；成功路径 `core = res.core` 覆盖。`persona` 在 turn/seal 链实际靠 `input.echo` 重新构造，`core.persona` 用处有限 | **待核实**：确认 `core.persona` 是否仅为 JudgePanel 的 0/1 展示；若仅是展示，可简化为布尔/枚举 |
| 10 | `src/lib/multiplayer`（p2p）、`src/lib/auth`、`src/lib/db`、`preview-host-bridge` 等 | 平台模板遗留基础设施，与游戏主流程无关（CODE_WIKI 有列出，HANDOFF 未提） | **待核实**：确认是否被 server fn / 启动链路引用；若纯遗留，可标注或移除（不影响主流程） |
| 11 | `src/game/components/Plane.tsx:5/9/14` `flying` prop | 已核实：`<Plane>` 在 6 处调用（Archive/Fold/Throw×2/Flight×2）只传 `charged`（ThrowPhase），`flying` 从未传入；`flying && "plane-fly"` 分支永不触发 | **删除** `flying` prop + `plane-fly` 样式，或找到真正的巡航动画接线点 |
| 12 | `src/game/components/Btn.tsx` `Btn` | 已核实：`Btn` 仅定义（`Btn.tsx:4`），全 `src` 无任何 import/使用（phase 用原生 button） | **删除**（死组件） |
| 13 | 文档口径（`docs/HANDOFF.md` §1「18 个手写 Story」、§5 todo #15「18 故事」、`CODE_WIKI.md` §6.3「18 个故事」） | 实际代码 `src/game/stories.ts` 为 **12 个 STORIES（s1–s12）** + 6 REGIONS（实测，grep 计数 18 = 12 story + 6 region）。「18」为旧口径笔误 | **更正**：全文档统一为「12 个故事卡」，与代码对齐 |

> 附：已确认**非**死代码（避免误删）——`sfxCharge/sfxSnap/sfxPaper` 等音效均已接线（Throw/Fold 等 phase 调用）；`RegionId` 的 `leftFrom/reading` 状态正常；`hasXai` 本身逻辑正确（仅命名问题，见 #1）。
