# Paper Echo · Agent 系统设计（结构先行）

> 原则：**simple first**。
> 先定数据，再定函数，最后才写 prompt 和模型调用。
> 流程由代码决定，不让模型决定流程。

---

## 1. 总体结构：三层

```
┌─────────────────────────────────────────────────────┐
│ L1 游戏交互层：Game / Store / UI                      │
│   只产生用户动作：投掷、回复、封存                      │
│   不接触 prompt / 工具 / LLM                         │
├─────────────────────────────────────────────────────┤
│ L2 Agent 业务层：Prompt Chaining（本文件重点）          │
│   match 链 / turn 链 / seal 链                       │
│   每条链 = 固定小步骤，每步只做一件事                   │
├─────────────────────────────────────────────────────┤
│ L3 基座层：Pi Agent Harness + Tools + Memory + LLM    │
│   Pi Agent：一次有状态的工具循环                       │
│   Tools：纯数据函数                                   │
│   Memory：写入 / 检索 / 去重                          │
│   LLM：AI PING + DeepSeek-V4-Flash-0731             │
└─────────────────────────────────────────────────────┘
```

核心边界：

- 游戏层不读 LLM
- Agent 业务层不直接 fetch LLM
- 工具不写业务，只做数据查询/写入
- 模型只负责「说」，不负责「下一步干什么」

---

## 2. 数据层（先结构）

### 2.1 统一请求 `NightInput`

实现位置 `src/game/agent/types.ts`。链内部不读 store、不读 localStorage，只消费这个对象。`intent` 不作为字段传入——三条链对应三个 server fn（`runMatch/runTurn/runSeal`）。

```ts
interface NightInput {
  // 玩家今晚
  fingerprint: Fingerprint[]   // 情绪指纹
  letter: string               // 折进飞机的信
  mirror: string               // 认领过的句子
  region: RegionId             // 飞向的地区

  // 对话
  echo?: EchoPerson | null     // 已锁定的人；match 时身份锁定不改名换城
  playerLine?: string          // 玩家刚说的话
  recall?: RecallItem[]        // 今晚完整对话

  // 持久记忆
  archival: MemoryRecord[]
  coreHuman?: string
  corePersona?: string

  // 防重复 / 连续性
  avoidNames?: string[]
  session?: unknown[]          // 链运行标记账本（非 LLM 消息）
}
```

### 2.2 链工作台 `ChainRuntime`（chains.ts 内部）

`makeRuntime` 在每条链开头构造，链内各步都读写它，不碰 store、不碰 localStorage。

```ts
interface ChainRuntime {
  input: NightInput             // 请求快照
  local: EchoPerson             // 本地 echo（fallback 底座）
  perception: string            // 「今晚靠近…」感知块
  pool: string[]                // 本地建议池
  live: { persona: string; facts: string[] }  // 本轮 Persona / Human 块
  ctx: ToolCtx                  // 工具上下文（含 remembered）
  hits: string[]                // 检索命中
  draft: { name; city; felt; lines: string[] } // 正在成型的人格
}
```

### 2.3 统一结果 `NightResult`

游戏层只关心这个输出。

```ts
interface NightResult {
  echo: EchoPerson
  spoken: string
  suggestions: string[]
  facts: string[]
  hits: string[]
  session: unknown[]
  persona: string               // core · persona 块
  human: string                 // core · human 块
  meter: TokenMeter
}
```

### 2.4 持久记忆 `MemoryRecord`

```ts
interface MemoryRecord {
  id: string
  memory: string              // 玩家的原话 / 事实
  emotions: EmotionId[]
  region?: RegionId
  echoName?: string
  createdAt: number
}
```

### 2.5 模型配置 `LlmConfig`

```ts
interface LlmConfig {
  providerId: "ai-ping"
  baseUrl: "https://aiping.cn/api/v1"
  apiKeyEnv: "AI_PING_API_KEY"
  modelId: "DeepSeek-V4-Flash-0731"
  maxTokens: 1024
  temperature: 0.7
  timeoutMs: 15000
}
```

---

## 3. 函数层（后代码）

### 3.1 入口（Server Functions）

只做参数转发和结果装箱，不写业务。

```
runMatch(request) -> MatchResult
runTurn(request)  -> TurnResult
runSeal(request)  -> SealResult
```

### 3.2 三条业务链

```
match: context -> research -> decidePersona -> writeGreeting -> validate
turn:  context -> research -> remember  -> reply   -> validate
seal:  context -> research -> remember  -> writeReturnLetter -> validate
```

### 3.3 链内步骤函数

```
buildContext(request)            // 确定性：组装感知 + 记忆块 + fallback
researchCases(context)           // 确定性：检索世界档案
researchArchive(context)         // 确定性：检索玩家信柜
decidePersona(context)           // LLM 步：只给 arrive 工具
writeGreeting(context)           // LLM 步：零工具
writeReply(context)              // LLM 步：只给 arrive 工具
writeReturnLetter(context)       // LLM 步：零工具
rememberPlayerFacts(context)     // LLM 步：只给 remember 工具
validateSpoken(context, line)    // 确定性：防偷话 / 防串城 / 防重复 / 限长
```

每步 = 一个短命 Pi Agent，只暴露该步允许的工具。

### 3.4 工具（纯数据函数）

```
search_cases(query, ctx)    // 世界档案里找相似的人（tools.ts，确定性排序）
search_archive(query, ctx)  // 玩家信柜里找旧事（tools.ts）
remember(fact, ctx)         // 写入 remembered / live.facts，拒绝指令（tools.ts）
arrive(params, ctx)         // 写入 draft 身份，已有身份时锁定（chains.ts 内 makeArriveTool）
```

### 3.5 记忆函数（Memory）

```
loadArchival() -> MemoryRecord[]          // localStorage paper-echo-memory-v2（≤48）
persistArchival(records)
applyFacts(records, facts, meta)          // Jaccard 去重合并写入
searchArchival(records, query, ...)       // Jaccard + 情感 + 地区 + 时间
factsOf(records)                          // 事实 → 「玩家曾说…」行
renderBlocks(persona, facts)              // # Persona + # Human 块
```

---

## 4. Prompt Chaining 核心规则

每个步骤只做一件事：

| 步骤 | 给模型的工具 | 模型任务 |
|------|--------------|----------|
| research | 无（确定性代码跑） | 不生成 |
| decidePersona | arrive | 只决定「我是谁」 |
| writeGreeting | 无 | 只写第一句 |
| remember | remember | 只提取玩家事实 |
| writeReply | arrive | 只说一句自己的事 |
| writeReturnLetter | 无 | 只写回信 |

前一步的**数据**传给下一步，而不是把一切塞进一个 prompt。

---

## 5. 模型接入

- Base URL：`https://aiping.cn/api/v1`
- 模型 ID：`DeepSeek-V4-Flash-0731`
- 认证：`AI_PING_API_KEY` 环境变量（`.env`，gitignored）
- 运行时通过 `src/game/agent/config.ts` 统一注册 Provider

---

## 6. 文件地图

```
src/game/agent/
├── types.ts      # 数据结构（NightInput / NightResult / RecallItem / LlmConfig）
├── config.ts     # LLM Config + AI PING Provider + 模型定义
├── llm.ts        # hasXai 门控 + token meter
├── tools.ts      # 3 个纯数据工具（runAgentTool）
├── memory.ts     # 记忆写入 / 检索 / 校验
├── chains.ts     # match / turn / seal 三条 Prompt Chain（唯一生产实现）
└── server.ts     # Server Functions 入口
```

---

## 7. 落地顺序

1. 先写 `types.ts`（数据）
2. 再写 `config.ts`（模型接入）
3. 再搭三条链的骨架 + fallback（没 key 也能跑）
4. 逐步骤填 prompt，每步只给一个工具
5. 接回 `server.ts`
6. 测试：`npx tsc --noEmit` + `npx tsx` 探针

---

## 8. 验收标准

- 没有 AI_PING_API_KEY 时，自动走本地档案 fallback
- match 产出：echo + greeting + suggestions
- turn 产出：spoken + suggestions
- seal 产出：returnLetter + facts
- 每一步都有独立日志 / token 计量
- 模型不能改名、串城市、偷用玩家的记忆当作自己的经历