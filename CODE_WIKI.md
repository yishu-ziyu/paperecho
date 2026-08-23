# 「纸上的回声」(paper-echo) — Code Wiki

> 全栈情感轻游戏。玩家写一封信，折成纸飞机，把它掷向世界的某个角落；由一个 AI「回声」(Echo) 人格——窗边的那个人——捡起并回应。
>
> 本文档基于对仓库 `paper-echo/` 全量源码的静态分析整理，覆盖：整体架构、模块职责、关键类与函数、数据模型、依赖关系与运行方式。
>
> ⚠️ **更正声明**：§7 曾将 `pi-echo.ts` 误写为生产运行时。当前唯一生产运行时为 **`chains.ts`（echoChain，Prompt Chaining）**，旧实验实现（pi-echo 单体、graph.ts LangGraph 版）已删除。本文档 §7 及涉及行已随代码更新；技术细节以 `src/game/agent/` 与 `agent.md` 为准。

---

## 目录

1. [项目概览](#1-项目概览)
2. [技术栈与核心依赖](#2-技术栈与核心依赖)
3. [整体架构](#3-整体架构)
4. [目录结构](#4-目录结构)
5. [模块职责总览](#5-模块职责总览)
6. [游戏核心（src/game）](#6-游戏核心srcgame)
7. [Agent 系统（src/game/agent）](#7-agent-系统srcgameagent)
8. [基础设施（src/lib）](#8-基础设施srclib)
9. [路由层与服务端中间件](#9-路由层与服务端中间件)
10. [脚本与构建工具（scripts/）](#10-脚本与构建工具scripts)
11. [数据库与迁移（migrations/）](#11-数据库与迁移migrations)
12. [关键类、接口与函数速查](#12-关键类接口与函数速查)
13. [数据流与关键流程](#13-数据流与关键流程)
14. [依赖关系明细](#14-依赖关系明细)
15. [运行方式](#15-运行方式)
16. [平台集成亮点](#16-平台集成亮点)
17. [架构决策记录（ADR 摘要）](#17-架构决策记录adr-摘要)

---

## 1. 项目概览

| 维度 | 说明 |
|---|---|
| 项目名 | `app-builder-workspace`（应用本体名：「纸上的回声」/ paper-echo） |
| 类型 | 单页全栈 Web 应用（SSR + Server Functions） |
| 定位 | 情绪体验型游戏：10 阶段纸飞机叙事流 + AI 人格对话 |
| AI 能力 | 默认 MiniMax CN（Anthropic Messages / MiniMax-M3）驱动 Pi-Style Agent；备选 AI PING。无 API Key 时回退到本地故事库生成的「离线回声」 |
| 存储 | localStorage（旅程/记忆）+ 可选 Neon Postgres（缺省为嵌入式 PGLite） |
| 平台 | 自有全栈模板（PWA、预览宿主桥、OG 卡片、Better Auth 三方模式） |

核心体验闭环：**挑选世界角落 → 把心事写成信 → 折纸飞机掷出 → 飞行掠过城市 → 「回声」捡起并回信**。

---

## 2. 技术栈与核心依赖

### 运行时依赖（dependencies）

| 分组 | 包 | 用途 |
|---|---|---|
| 框架 | `react@19.2` / `react-dom` | UI 渲染 |
| 元框架 | `@tanstack/react-start@^1.168` | SSR、路由、**Server Functions**（`createServerFn`） |
| 路由 | `@tanstack/react-router@^1.170` + `@tanstack/router-plugin` | 文件路由与代码生成 |
| 状态 | `zustand@^5` | 全局游戏状态机、UI 状态 |
| AI 运行时 | `@earendil-works/pi-agent-core` / `@earendil-works/pi-ai`（^0.84.2） | Pi-Style Agent 循环（prompt → tool → observe） |
| 手势/动效 | `@use-gesture/react`、`motion@^13`、`cobe@^2` | 拖拽、弹簧动画、3D 地球 |
| 样式 | `tailwindcss@^4`、`@tailwindcss/vite`、`tw-animate-css` | 原子 CSS v4 + 动效工具 |
| UI 组件 | Radix UI 全家桶、`cmdk`、`sonner`、`vaul`、`lucide-react`、`recharts`、`react-resizable-panels`、`react-hook-form` + `@hookform/resolvers`、`date-fns`、`react-day-picker` | 无头组件、命令面板、Toast、抽屉、图标、图表、表单 |
| 工具函数 | `clsx`、`tailwind-merge`、`class-variance-authority` | `cn()` 组合与变体 |
| 数据库 | `@electric-sql/pglite@^0.5.4`（嵌入式 WASM Postgres）、`pg@^8`（Neon）、`kysely`（PGLite 方言查询构建） | 双后端 SQL 访问 |
| 认证 | `better-auth@~1.6.30`、`jose`（JWT/JWKS） | Better Auth + Gate Identity |
| 校验 | `zod@^4` | 模式校验（工具入参、表单） |

### 开发依赖（devDependencies，要点）

`vite@^8`、`@vitejs/plugin-react`、`typescript@^5.7`、`eslint@9` + prettier、`lightningcss`、`nitro@3.0.260610-beta`（Vercel preset，`serverDir: ./server`）、`playwright@^1.62`（脚本 QA）。

---

## 3. 整体架构

### 3.1 分层视图

```text
┌────────────────────────────────────────────────────────────────────┐
│  浏览器（客户端）                                                    │
│                                                                    │
│  GameShell  ←  routes/index.tsx（唯一业务页面）                       │
│     │                                                              │
│  phases/（10 个阶段组件）                                           │
│     │ 手势：continuum.tsx（PullCommit /useWellDrag）+ motion 弹簧    │
│     ▼                                                              │
│  Zustand Store（src/game/store.ts）  ←———  游戏状态机（10 阶段）      │
│     │  launch() / reply() / seal / saveReturn()                    │
│     ▼                                                              │
│  createServerFn →  TanStack Server Functions（POST /_server/...）   │
└──────────────┬─────────────────────────────────────────────────────┘
               │ HTTP + JSON（会话 JSON 字符串）
┌──────────────▼─────────────────────────────────────────────────────┐
│  服务端（Vite SSR / Nitro / Vercel Function）                        │
│                                                                    │
│  src/game/agent/server.ts                                           │
│     │ runMatch / runTurn / runSeal                                  │
│     ▼                                                              │
│  chains.ts  echoChain.match/turn/seal    ←—  唯一生产运行时          │
│     ├── tools.ts    search_cases / search_archive / remember        │
│     ├── memory.ts   paper-echo-memory-v2 档案库检索 + 真实性守卫     │
│     ├── llm.ts      hasApiKey() / meter 计量                        │
│     └── config.ts   MiniMax 主 / AI PING 备选                        │
│                                                                    │
│  旁路基础设施（不阻塞游戏主流程）                                      │
│     ├─ lib/auth/*         Better Auth 三模式 + Gate Identity JWT     │
│     ├─ lib/db.ts          Neon ⇄ PGLite 双后端 + migrations 自动应用 │
│     ├─ lib/multiplayer/*  WebRTC P2P 房间 + /api/rtc 轮询信令         │
│     └─ server/middleware/grok-pwa.ts   PWA/OG head 流式注入          │
└────────────────────────────────────────────────────────────────────┘
```

### 3.2 分层职责

| 层 | 位置 | 职责 |
|---|---|---|
| 表示层 | `src/routes`、`src/game/phases`、`src/game/components` | 页面骨架、10 阶段交互、视觉组件 |
| 交互层 | `src/game/continuum.tsx`、`motion.ts`、`follow.ts` | 手势识别、弹簧动画、幽灵跟随 |
| 状态层 | `src/game/store.ts` | 全局游戏状态机 + 对 Server Functions 的唯一客户端调用点 |
| Agent 层 | `src/game/agent/*` | AI 人格生成、工具调用、记忆检索、回退策略 |
| 服务平台层 | `src/lib/*`、`server/*` | 数据库、认证、P2P、PWA/OG、预览宿主桥 |

---

## 4. 目录结构

```text
paper-echo/
├── public/                          # 静态资源（og 卡片、favicon、视频等）
├── src/
│   ├── game/                        # 游戏核心
│   │   ├── agent/                   # AI 代理层（下文详述）
│   │   │   ├── config.ts            # LLM 配置：MiniMax 主 / AI PING 备选
│   │   │   ├── server.ts            # runMatch/runTurn/runSeal Server Functions
│   │   │   ├── chains.ts            # ★ echoChain 生产运行时（match/turn/seal 三链）
│   │   │   ├── tools.ts             # 确定性工具执行器（search_cases/search_archive/remember）
│   │   │   ├── memory.ts            # 信柜记忆（localStorage paper-echo-memory-v2）
│   │   │   ├── llm.ts               # hasApiKey 门控 + token meter
│   │   │   └── types.ts             # NightInput/NightResult/RecallItem/LlmConfig
│   │   ├── components/              # Scene/Hud/JudgePanel/Globe/Plane/Blob/Guide/Starfield/Btn
│   │   ├── phases/                  # 10 个阶段组件（Title→Archive）
│   │   ├── store.ts                 # ★ Zustand 状态机
│   │   ├── types.ts                 # 领域类型 + 常量
│   │   ├── stories.ts               # 6 区域 + 12 故事库
│   │   ├── emotions.ts              # 8 情绪词库
│   │   ├── kernel.ts                # 离线回音：letterFromChips/fallbackEcho/buildJourney
│   │   ├── save.ts                  # 旅程存档（localStorage paper-echo-v1）
│   │   ├── audio.ts                 # WebAudio 合成音效
│   │   ├── motion.ts                # 弹簧动画常量
│   │   ├── follow.ts                # DOM 幽灵跟随
│   │   └── continuum.tsx            # Apple Dynamic-Island 风格手势原语
│   ├── lib/                         # 基础设施
│   │   ├── auth/                    # Better Auth（server/client/gates/provider…）+ gate identity
│   │   ├── multiplayer/             # p2p.ts + index.ts（WebRTC 全矩阵房间）
│   │   ├── app-data/                # 平台数据连接器网关（types/login/client.server/server-only）
│   │   ├── og/site.json             # Open Graph 站点配置
│   │   ├── db.ts                    # ★ Neon/PGLite 双后端
│   │   ├── preview-host-bridge.ts   # 预览宿主 postMessage 桥（纯逻辑）
│   │   ├── utils.ts                 # cn()
│   │   ├── error-component.tsx      # 错误展示组件
│   │   └── verify.server.ts 等       # 服务端辅助
│   ├── components/
│   │   └── preview-host-bridge.tsx  # 宿主桥挂载组件（安全路径校验）
│   ├── routes/
│   │   ├── __root.tsx               # 根布局（AuthProvider + PreviewHostBridge + Head）
│   │   └── index.tsx                # 唯一业务页面 → <GameShell />
│   ├── router.tsx                   # 路由实例
│   └── routeTree.gen.ts             # TanStack 生成的路由树
├── server/
│   └── middleware/grok-pwa.ts       # Nitro 中间件（部署态 PWA/OG）
├── scripts/                         # 构建/开发/测试/QA 脚本（见 §10）
├── migrations/
│   └── auth/0001_auth.sql           # Better Auth 表结构（user/session/account/verification）
├── .grok/app-env.json               # 可选的 VITE_ 构建标记载体
├── vite.config.ts                   # 插件链
├── tsconfig.json
├── package.json
├── startup.sh                       # 一键启动脚本
├── .env.example                     # MINIMAX_CN_API_KEY= / 备选 AI_PING_API_KEY=
└── README.md                        # 中文玩法说明（9 步流程）
```

---

## 5. 模块职责总览

| 模块 | 职责 | 关键出口 |
|---|---|---|
| `src/game/store.ts` | 全局状态机：阶段推进、所有 server fn 调用、存档、UI 状态 | `useGame`（并挂到 `window.__echoGame`） |
| `src/game/agent/server.ts` | Server Functions 边界：序列化/包会话、超时传播 | `runMatch/runTurn/runSeal` |
| `src/game/agent/chains.ts` | Echo 人格生成主运行时：三条 Prompt Chain（match/turn/seal） | `echoChain` |
| `src/game/agent/memory.ts` | 档案库记忆：存储、检索、真实性格守卫 | `searchArchival/factsOf/perceptionOf` 等 |
| `src/game/agent/tools.ts` | Agent 工具的确定性执行 | `runAgentTool` |
| `src/game/kernel.ts` | 零 AI 依赖的本地回音生成（离线兜底） | `fallbackEcho/letterFromChips/buildJourney` |
| `src/lib/db.ts` | 双后端（Neon/PGLite）SQL 抽象 + 迁移自动应用 | `getSql/ensureDbReady` |
| `src/lib/auth/*` | 三方模式认证、Gate Identity、SSR 会话注入 | `auth/authClient/SignedIn…` |
| `src/lib/multiplayer/p2p.ts` | WebRTC 全矩阵房间（完美协商 + 粘滞对恢复） | `P2PRoom` |
| `src/lib/preview-host-bridge.ts` + `src/components/preview-host-bridge.tsx` | 嵌入 Grok 预览宿主时同步路由/历史 | `PreviewHostBridge` |
| `server/middleware/grok-pwa.ts` | 部署态 PWA 清单/安装页/OG head 注入 | Nitro 中间件 |
| `scripts/*` | 开发包装、迁移、构建标记注入、浏览器 QA | 见 §10 |

---

## 6. 游戏核心（src/game）

### 6.1 状态机（store.ts）

Zustand v5 单 store。游戏流程被定义为一个 **10 阶段线性状态机**：

```text
title → orbit → mirror → compose → fold → throw → flight → encounter → return → archive
入场    选角    读故事   写信     折纸    掷出    飞行     对话      收信     归档
```

| 阶段 | 触发动作 | 说明 |
|---|---|---|
| `title` | — | 首页（含历史旅程归档抽屉） |
| `orbit` | `commitOrbit()` | 玩家拖拽星球 token 选中世界角落；中心 blob 达到 ≥41 颗已拥有星时锁定 |
| `mirror` | `pickMirror()` | 把选中角落的故事卡片放入「井」中；触发 `matchStories` 匹配 |
| `compose` | 手写动作 | 情绪 chips 拼成信（`letterFromChips`）；上拉 → 折叠 |
| `fold` | 手势 | 两次折叠手势完成 |
| `throw` | 弹弓手势 | 0.22 释放阈值；力度 → 速度 → 蓄力映射到发射功率 |
| `flight` | `launch(power)` | 轨道飞行 + 进度寻找；降落后进入对话 |
| `encounter` | `reply()` / `seal()` | 与 Echo 对话（建议式卡片，非 chips）；回合达上限时封印 |
| `return` | — | 信封/信纸拉取 + 抽屉 |
| `archive` | `saveReturn()` | 旅程归档 + 档案库记忆「记忆列车」 |

关键动作与网络调用：

- `launch(power)` — 调 `runMatch`，**22 秒超时**；成功 → 播放 `sfxMatch` 并进入 encounter；失败/离线 → 回退到本地房间生成的 Echo（`fallbackEcho`）。
- `reply()`（encounter 常规回合）— 调 `runTurn`，**12 秒超时**。
- `seal()`（第 3 轮对话收尾）— 调 `runSeal`，**14 秒超时**。
- `saveReturn()` — 调 `buildJourney` 写入 localStorage（`paper-echo-v1`，最多 24 段），并把玩家新事实写回档案库记忆（`keepPlayerFacts/applyFacts`）。

辅助：`agentPayload()` 把所有相关状态打包成 Agent 输入；`CAN_BACK` 定义各阶段允许回退的映射。

### 6.2 领域类型（types.ts）

| 类型/常量 | 说明 |
|---|---|
| `Phases` | 阶段 tuple（10 个阶段） |
| `JOURNEY` | 9 步旅程定义 |
| `CAN_BACK` | 阶段回退映射 |
| `Emotion` | 情绪类型（与 emotions.ts 对齐） |
| `CoreMemory` | 核心记忆（人格基线） |
| `MemoryRecord` | 记忆记录（含 emotion/region/recency） |
| `EchoPerson` | 生成的 Echo 人格对象 |
| `Journey` | 一次完整旅程 |
| `Fingerprint` | 指纹/身份信息 |
| `TokenMeter` | token 计量（用于 JudgePanel 展示与成本侧写） |
| `CENTER = {x:50,y:48}` / `MIN_RADIUS=26` / `MAX_RADIUS=44` | 轨道布局常量 |

### 6.3 故事与情绪数据

- `stories.ts` — **6 个世界角落 + 12 个故事**；`matchStories()` 依据区域/情绪匹配候选故事。
- `emotions.ts` — **8 个情绪常量** + 对应的 chips 与回复短语池。

### 6.4 离线内核（kernel.ts）

零网络依赖的回声生成，保证无 API Key / 网络失败时游戏仍可完成：

- `letterFromChips(chips)` — 把情绪词片拼装成信。
- `fallbackEcho(...)` — 基于故事库 + 情绪的本地人格回应。
- `buildJourney(...)` — 依据中间产物组装完整 `Journey` 记录。

### 6.5 阶段组件（phases/）

| 组件 | 交互要点 |
|---|---|
| `TitlePage` | 入场动画 + 归档抽屉入口 |
| `OrbitPhase` | token 拖拽选择角落 |
| `MirrorPhase` | 故事卡片放入 well（`useWellDrag`） |
| `ComposePhase` | chips → 信，上拉触发折叠 |
| `FoldPhase` | 双层折叠手势 |
| `ThrowPhase` | 弹弓：0.22 释放阈值，力度→速度→功率 |
| `FlightPhase` | 夜里自动巡航等 match；找到后用 searchNote 下拉落地。无跟飞、无躲障 |
| `EncounterPhase` | 建议卡片回复（非 chips），回合限制 |
| `ReturnPhase` | 信封/信纸拉取 + 归档抽屉 |
| `ArchivePhase` | 历史旅程 + 档案库记忆「列车」可视化 |

### 6.6 视觉/音频组件（components/）

- `Scene` — 场景选择：`STILL/VIDEO` 映射（含 `room/echo/night/flight.mp4` 等）。
- `Hud` — 顶部 HUD：J 面板开关、回退指示、静音、归档入口。
- `JudgePanel` — 技术面板：token meter、session 路径、core/recall/archival/hits 统计。
- `Globe`（cobe）、`Plane`、`Blob`、`Guide`、`Starfield`、`Btn` — 视觉组件。

### 6.7 交互原语

- `continuum.tsx` — `CRAFT_ID="echo-craft"`；Apple Dynamic-Island 风格 **PullCommit 手势** + `useWellDrag`；基于 `layoutId` 的 craft 缩放（类似于 Dynamic-Island 的流体形变）。
- `motion.ts` — 弹簧常量（spring stiffness/damping 等）。
- `follow.ts` — `rafThrottled` DOM 幽灵跟随。
- `audio.ts` — WebAudio 合成音效（`sfxMatch` 等，无音源文件）。

---

## 7. Agent 系统（src/game/agent）

生产运行时唯一：**`chains.ts`（`echoChain`）**，由 `server.ts` 的三个 Server Functions 调用。旧实验实现（`pi-echo.ts` 单体 Pi harness、`graph.ts` LangGraph 版、`llm.ts` 的 `chatAgent/chatJson`、`AGENT_TOOLS`）已在架构收敛时删除，仓库只保留一套实现。

### 7.1 三条 Prompt Chain（chains.ts）

| 链 | 步骤 | 产出 |
|---|---|---|
| match | research（确定性：search_cases + search_archive）→ match-persona（LLM：仅 arrive 工具）→ match-greeting（LLM：零工具，≤28 字）→ validate（确定性） | echo + greeting + suggestions + hits + core |
| turn | research → turn-remember（LLM：仅 remember 工具）→ turn-reply（LLM：仅 arrive 工具）→ validate | spoken + suggestions |
| seal | research → seal-remember（LLM：仅 remember 工具）→ seal-write（LLM：零工具，≤48 字）→ validate | returnLetter + facts |

- 每步 = 一个**短命 Pi Agent**（`@earendil-works/pi-agent-core`），初始态只暴露该步允许的工具；`shouldStopAfterTurn`：本步无工具调用即止，最多 maxTurns 轮。
- 模型：默认 `MiniMax-M3`（MiniMax CN Anthropic Messages）；`PAPER_ECHO_LLM=aiping` 切 `DeepSeek-V4-Flash-0731`。`thinkingLevel: "off"`。
- 确定性工具（tools.ts `runAgentTool`）：`search_cases`（12 故事世界档案）、`search_archive`（玩家信柜）、`remember`（写玩家事实）。`arrive` 是 chains.ts 内部的结构化工单（name/city/felt/lines 写入 draft，身份已锁时禁改名）。
- 校验闸门（memory.ts）：`ownLine`（禁重复/禁越界）、`stolenVoice`（禁把玩家旧事改成「我……」）、`foreignPlace`（禁串城）。
- 人格铁律（RULES 常量）：「你是深夜还没睡的一个普通人。只说你自己今晚的具体事，像微信，一两句。不安慰。禁止：看见、接住、值得、不是一个人、加油。」——硬编码进每条链的 system prompt。

### 7.2 无 Key / 超时回退

`hasApiKey()`（llm.ts，检测 MiniMax / AI PING key）为 false → 直接 `fallbackFor`（本地故事卡 `fallbackEcho` + `chipPool`）。链内单步超时/失败 → 步级空输出，validate 回落本地句子。游戏层另有 store 级 `Promise.race` 超时（match 22s / turn 12s / seal 14s）。

### 7.3 Server Functions（server.ts）

```text
createServerFn({ method: "POST" }) × 3
  ├─ runMatch(payload) → MatchResult
  ├─ runTurn(payload)  → TurnResult
  └─ runSeal(payload)  → SealResult
```

- 入参 `AgentPayload`（对应 `NightInput`）；会话以 JSON 字符串打包/解包（`packSession/unpackSession`），内容为链运行标记账本。
- handler 内动态 `import("./chains")` 调用 `echoChain`，保持 fn 边界轻量。

### 7.4 LLM 配置与门控

| 文件 | 内容 |
|---|---|
| `config.ts` | `LLM_CONFIG`：默认 MiniMax CN `https://api.minimaxi.com/anthropic` / `MiniMax-M3`；备选 AI PING；`llmProvider()` |
| `llm.ts` | `hasApiKey()`（探测 API Key 存在性）、`emptyMeter`/`addMeter`（token 计量） |

### 7.5 信柜记忆（memory.ts）

- 存储键：`localStorage["paper-echo-memory-v2"]`，容量上限 **CAP 48** 条；旅程存档 `paper-echo-v1`（≤24 局，save.ts）。
- 切词：`tokensOf` 做 **unigram + bigram**（中文连续字 + 拉丁词）混合切分。
- 检索：`jaccard` 相似度 + `emotion/region/recency` 多因子打分（`searchArchival`）。
- 真实性守卫：`stolenVoice`（玩家原话）、`ownLine`（自说自话）、`foreignPlace`（地点错位）——防止 Echo 把玩家的词句/事实/地点“偷走”复用。
- 事实管线：存档时以玩家原话为事实来源——`keepPlayerFacts`（从信/碎片/玩家台词提取）→ `applyFacts`（Jaccard 0.48 去重写回）→ `factsOf`（供下局引用）→ `renderBlocks/perceptionOf`（感知渲染）。链内 `remember` 提取的事实仅用于当轮上下文与展示。
- 记忆三层对齐 Letta/MemGPT 的设计：core（本轮 persona/human 常驻块）/ recall（当晚对话）/ archival（跨夜信柜）。

---

## 8. 基础设施（src/lib）

### 8.1 数据库（db.ts）

- `DbSource` 枚举后端来源；`Sql` 是统一查询接口。
- `createNeonSql`（`DATABASE_URL` 存在时）——连接池 + `pg`。
- `createPgliteSql` —— 嵌入式 PGLite（**WASM Postgres**，无需外部服务）。
- **OID 归一化**：PGLite 与 pg 在 `int8/date/interval` 等返回类型上有差异，由 `Sql` 层把结果统一为 JS 原生类型（BigInt/Date/string）。
- 迁移：`import.meta.glob("/migrations/*.sql")` 在 PGLite 启动时**自动按文件名排序应用**，写入 `_migrations` 表去重；`getPglite()/ensureDbReady()` 负责单例与就绪。
- HMR 安全：globalThis 上缓存 promise，避免开发热更重复初始化。

### 8.2 认证（src/lib/auth/*）

Better Auth 自托管于 `/api/auth/*`，**三模式切换**：

| 模式 | 触发条件 | 表现 |
|---|---|---|
| deployed | `GROK_AUTH_*` 环境变量 | 完整 Grok OAuth 联合登录 |
| live-preview | `PREVIEW_CLIENT_ID/SECRET`（内置于构建）+ 动态 baseURL | 预览态登录 |
| off | `VITE_AUTH_ENABLED=false` | `dev-user` 直通（`DEV_USER`），不弹登录 |

关键件：

- `server.ts` — `betterAuth({...plugins:[gateIdentitySessions(), grokOAuthPlugin?, bearer(), tanstackStartCookies()]})`；`SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token"`；`authConfigured` 开关。
- `gate-identity.server.ts` — 用 **JWKS（Ed25519）** 校验 `x-grok-identity` JWT。
- `gate-session.server.ts` — `/get-session` 的 Before hook：把 gate JWT 转换为真实会话，并显式 `emitSessionCookie`（TanStack `setCookie` + responseHeaders）。
- `isolation.server.ts` — `assertSameSiteRequest()`：fetch-metadata 守卫（`Sec-Fetch-Site` = same-origin/none，或顶层 GET 导航）。
- `middleware.ts` — `authMiddleware` SSR 会话注入；`verify.server.ts` — `requireUserId`；`providers.ts` — `GROK_PROVIDERS`。
- `client.ts` — `authClient` 的 `onRequest` 附加 `Authorization: Bearer`；`signIn` 在 `inLivePreview()` 时走 `/auth/popup` + `postMessage`，否则整页 OAuth。
- `pglite-dialect.ts` — Kysely 的 PGLite 方言；`email-password.ts` — 密码登录被禁用。
- `gates.tsx` — `SignedIn/SignedOut/UserButton` 组件；`provider.tsx` — 透传 Provider。

### 8.3 多人/实时（src/lib/multiplayer/p2p.ts）

- `P2PRoom`：**全矩阵（full-mesh）WebRTC** 房间。
- 信令：通过 `/api/rtc` 轮询（快 400ms / 空闲 2s），非 WebSocket。
- 协商：**perfect negotiation**；glare 冲突时**字典序较小的 peerId 为 polite** 方让路。
- 通道：`state`（不可靠，高频位置/姿态）+ `reliable`（可靠，有序消息）双 DataChannel。
- 可靠性：2 秒 ping 的 RTT 探活 + watchdog，粘滞 pair 自动恢复。

### 8.4 预览宿主桥

- `src/lib/preview-host-bridge.ts`（逻辑）+ `src/components/preview-host-bridge.tsx`（挂载）：当应用嵌入 **allowlist 白名单内的 Grok 父页面**时，通过 `postMessage` 桥（channel `grok-preview-bridge`）把 `navigate/history/location` 同步给宿主；`collectRoutePathsFromTree` 收集路由路径供宿主校验。

### 8.5 app-data 连接器

`src/lib/app-data/*`（`types` / `login` / `client.server` / `server-only`）——把外部数据源封装为统一 `callTool` 网关，供 Agent 或页面按需调用。

### 8.6 其他

`utils.ts`（`cn` 组合 clsx + tailwind-merge）、`og/site.json`（OG 站点配置）、`error-component.tsx`。

---

## 9. 路由层与服务端中间件

- `routes/__root.tsx` — 根布局：挂载 `PreviewHostBridge` + `AuthProvider`、TanStack `HeadContent/Scripts`、Google Fonts、manifest。
- `routes/index.tsx` — 唯一业务页面：`<GameShell />`。
- `router.tsx` + `routeTree.gen.ts` — TanStack Router 实例与生成路由树。
- `server/middleware/grok-pwa.ts` — **Nitro 中间件**（部署态）：`/__grok/manifest.webmanifest`、`?install=1&platform=ios` 的安装教程页、`</head>` 流式注入（`createHeadInjector`，只缓冲到 `</head>` 标记，不阻塞流式 SSR）、OG 身份（`virtual:grok-og-identity` 快照注入）。

---

## 10. 脚本与构建工具（scripts/）

### 10.1 开发/构建管线

| 脚本 | 作用 |
|---|---|
| `with-app-env.mjs` | **统一入口包装**：dev/build/preview 都先读 `.grok/app-env.json`，仅合并 `VITE_` 前缀键到环境（`process.env` 优先），保证三个模式的 `VITE_AUTH_ENABLED` 一致；信号转发（SIGINT/TERM/HUP）与 `128+signo` 退出码处理 |
| `app-env-plugin.mjs` | dev-only `/__app-env` 端点，暴露 Vite 解析后的 env JSON（供 `check-auth-invariant` 比对） |
| `migrate.mjs` | 部署期迁移器：`DATABASE_URL` 存在时在构建中执行 `migrations/*.sql`（逐个事务 + `_migrations` 记账）；无 URL 时跳过（交给 PGLite 运行时自迁移） |
| `migration-plan.mjs` | 迁移计划共用逻辑：`pendingMigrations`（按**basename**去重、`.sql` 过滤、字典序应用）——同一文件无论从哪个目录 glob 到都只执行一次 |

### 10.2 PWA/平台

- `grok-pwa-plugin.mjs` — Vite 侧 PWA 半段：manifest 路由、`?install=1` 教程页、`</head>` 注入（包装 `res.write/end` 流式注入，跳过已 content-encoding 的响应）；`configurePreviewServer` 在压缩中间件之后包裹。
- `grok-pwa-shared.mjs` — 平台 head chrome 的**单一事实来源**：`injectGrokPwaHead`（PWA tags + OG tags + `x:creator`，不注入 App Builder 角标）、`createHeadInjector`（流式注入器）、`snapshotOgIdentity`、`renderWebManifest`、`appNameFromHost` 等。Vite 插件与 Nitro 中间件共用。
- `install-page.html` — iOS 安装教程模板（`{{APP_NAME}}` / `{{APP_URL}}` 占位）。

### 10.3 QA / 探针 / 杂项

`browser-smoke.mjs`、`playtest-5.mjs`、`qa-continuum.mjs`、`qa-loop.mjs`、`qa-throw.mjs`、`agent-play.mjs`、`probe-night.mts`、`probe-pi.mts`、`debug-mirror.mjs`、`play-gestures.mjs`、`preview-thumbnail.mjs`、`brand-check.mjs`、`check-auth-invariant.mjs`、`sign-out-plan.mjs`、`browser-guard.mjs` —— 基于 Playwright 或 node 的玩法/手势/连续性冒烟与回归；`*.test.mjs` 为 `node --test` 单元测试（`with-app-env`、`migration-plan`、`grok-pwa-plugin`、`brand-check`、`check-auth-invariant`、`sign-out-plan`、`browser-smoke-verdict`）。

---

## 11. 数据库与迁移（migrations/）

```
migrations/
└── auth/
    └── 0001_auth.sql      # Better Auth 官方 Schema（camelCase 双引号列）
```

`0001_auth.sql` 建四张表：

| 表 | 用途 |
|---|---|
| `"user"` | 用户（id/name/email/emailVerified/image/时间戳） |
| `"session"` | 会话（token、expiresAt、userAgent、userId FK） |
| `"account"` | OAuth 账户（providerId、accessToken/refreshToken/idToken、scope、password） |
| `"verification"` | 验证码（identifier/value/expiresAt） |

要点：

- **应用级 schema** 应放在新的 `0002_*.sql…` 中（snake_case，`user_id TEXT NOT NULL` 约定，preview 的 dev-user id 是字符串 `'dev-user'`）。
- 两条应用路径共用同一套迁移：**部署时**由 `scripts/migrate.mjs`（Neon，`npm run build`）应用；**本地/预览**由 `src/lib/db.ts`（PGLite 启动时）应用。`_migrations` 按 basename 记账，两路径互不重复执行。
- 非递归读取：`migrations/auth/` 不自动应用，需复制到顶层才会生效。

---

## 12. 关键类、接口与函数速查

### 12.1 核心函数

| 函数 | 位置 | 签名/说明 |
|---|---|---|
| `echoChain.match/turn/seal` | [chains.ts](src/game/agent/chains.ts) | 三条 Prompt Chain 入口；intent 即链名 |
| `runMatch/runTurn/runSeal` | [server.ts](src/game/agent/server.ts) | TanStack Server Functions 出口 |
| `launch(power)/reply()/seal()/saveReturn()/commitOrbit()/pickMirror()` | [store.ts](src/game/store.ts) | 状态机动作 |
| `matchStories()` | [stories.ts](src/game/stories.ts) | 区域/情绪匹配故事 |
| `letterFromChips/fallbackEcho/buildJourney` | [kernel.ts](src/game/kernel.ts) | 离线回音内核 |
| `searchArchival/perceptionOf/factsOf/keepPlayerFacts/applyFacts` | [memory.ts](src/game/agent/memory.ts) | 记忆检索与事实管线 |
| `runAgentTool(name, args)` | [tools.ts](src/game/agent/tools.ts) | 工具确定性执行 |
| `hasApiKey()/emptyMeter` | [llm.ts](src/game/agent/llm.ts) | API Key 门控与 token 计量 |
| `getSql/getPglite/ensureDbReady` | [db.ts](src/lib/db.ts) | 双后端 SQL 访问 |
| `auth/bearer/signIn/signOut` | [auth/*](src/lib/auth/) | 认证 | 
| `P2PRoom(join/close/broadcast/send)` | [p2p.ts](src/lib/multiplayer/p2p.ts) | WebRTC 房间 |
| `injectGrokPwaHead/createHeadInjector` | [grok-pwa-shared.mjs](scripts/grok-pwa-shared.mjs) | head 注入 |
| `pendingMigrations/migrationName` | [migration-plan.mjs](scripts/migration-plan.mjs) | 迁移计划 |

### 12.2 关键类型

`Phases`、`Journey`、`EchoPerson`、`MemoryRecord`、`CoreMemory`、`Emotion`、`TokenMeter`、`Fingerprint`（`src/game/types.ts`）；`AgentPayload`/`NightInput`/`NightResult`/`MatchResult`/`TurnResult`/`SealResult`（`src/game/agent/*`）；`Sql`/`DbSource`（`src/lib/db.ts`）；`P2PRoom`（`src/lib/multiplayer/p2p.ts`）；`JourneyPath`/`CallToolResult`（`src/lib/app-data/*`）。

### 12.3 常量速查

| 常量 | 值 | 含义 |
|---|---|---|
| `CRAFT_ID` | `echo-craft` | craft 布局 id（Dynamic-Island 式形变动画锚点） |
| `CENTER` | `{x:50, y:48}` | 轨道中心（百分比） |
| `MIN/MAX_RADIUS` | `26 / 44` | 轨道半径区间 |
| localStorage 存档键 | `paper-echo-v1`（≤24 条） | 旅程存档 |
| localStorage 记忆键 | `paper-echo-memory-v2`（CAP 48） | 信柜记忆 |
| 信令轮询 | 400ms 快 / 2000ms 空闲 | `/api/rtc` |
| 弹弓释放阈值 | `0.22` | ThrowPhase |
| 超时 | match 22s / turn 12s / seal 14s（链内各步另有 7–15s 上限） | 客户端与服务端 |

---

## 13. 数据流与关键流程

### 13.1 一次完整旅程（正常路径）

```text
玩家          Orbit   ──挑角落──▶   commitOrbit()
              Mirror  ──读故事──▶   pickMirror() + matchStories()
              Compose ──chips──▶   letterFromChips() + 折叠手势
              Throw   ──弹弓──▶    0.22 释放 → power
              Flight  ──落地──▶   launch(power)  ──▶  ✓ runMatch
                                                        │
                                   enter encounter ◀────┘
              Encounter ──对话──▶  reply()  ──▶ runTurn（12s）
                                   第 3 轮：seal() ──▶ runSeal（14s）
              Return  ──收信──▶   Echo 回信展示
              Archive ──归档──▶   saveReturn() → buildJourney → localStorage
                                  + keepPlayerFacts/applyFacts → 记忆 v2
```

### 13.2 离线/降级路径

```text
launch() 失败 / 无 MiniMax 或 AI PING key / store race 超时
          │
          ▼
   fallbackEcho（本地故事库 + 情绪 + RULES 风格）
          │
          ▼
   archiveFallback() ──▶ 仍产出完整旅程并归档
```

### 13.3 Agent 单回合数据流

```text
store.agentPayload() ─► runTurn (server fn)
        ─► 动态 import("./chains") ─► echoChain.turn
              ├─ researchStep：search_archive 确定性检索
              ├─ turn-remember（仅 remember 工具）→ turn-reply（仅 arrive 工具）
              ├─ 各步超时/失败 = 步级空输出，validate 回落本地句子
              └─ validate：ownLine/stolenVoice/foreignPlace
        ─► TurnResult ─► store 更新 UI（新一句 + 建议卡片）
```

---

## 14. 依赖关系明细

### 14.1 模块依赖图（核心链）

```text
routes/index.tsx ─► GameShell
                        │
src/game/components/* ◄─┴─ src/game/phases/*
                                   │
                                   ▼
src/game/continuum.tsx ◄─ motion.ts / follow.ts
                                   │
src/game/store.ts ◄────────────────┘    （唯一客户端调用方）
      │  agentPayload()
      ▼
src/game/agent/server.ts ──createServerFn──► (POST)
      │
      ▼ dynamic import
src/game/agent/chains.ts
      ├── tools.ts ──► stories.ts / memory.ts
      ├── memory.ts ──► localStorage
      ├── kernel.ts（fallback）
      └── llm.ts ──► config.ts ──► MiniMax CN（备选 AI PING）
```

### 14.2 数据/Object 依赖

| 依赖方 | 被依赖方 | 契约 |
|---|---|---|
| store | agent/server | `AgentPayload` JSON；`Match|Turn|SealResult` |
| agent tools | memory/stories | 检索排名；mem 写入 |
| chains | llm/config | provider + LLM_CONFIG + hasApiKey |
| db.ts | scripts/migration-plan | `pendingMigrations`（按 basename 去重） |
| auth server | db.ts + migrations/auth | PGLite/Neon + 0001_auth.sql |
| grok-pwa | scripts/grok-pwa-shared | 共享 head 注入逻辑 |
| __root | preview-host-bridge / auth provider | 挂载桥与认证上下文 |

### 14.3 外部服务

| 服务 | 用途 | 必需？ |
|---|---|---|
| MiniMax CN（`https://api.minimaxi.com/anthropic`） | LLM（MiniMax-M3，默认） | 否（无 Key 走本地回退） |
| AI PING（`https://aiping.cn/api/v1`） | LLM 备选（`PAPER_ECHO_LLM=aiping`） | 否 |
| Neon Postgres（`DATABASE_URL`） | 生产库 | 否（缺省 PGLite） |
| Grok 预览宿主（allowlist） | 嵌入/路由同步 | 预览时 |
| `og.grok.me` | OG 占位卡片 | 共享卡片 |

---

## 15. 运行方式

### 15.1 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `MINIMAX_CN_API_KEY` | MiniMax CN 密钥（默认主路径）；存在→live AI，缺失→看备选 / 本地回退 | 无 |
| `AI_PING_API_KEY` | 备选密钥；`PAPER_ECHO_LLM=aiping` 强制切备选；MiniMax 无 key 时也会自动落到这里 | 无 |
| `DATABASE_URL` | Neon Postgres 连接串；设置→Neon，否则嵌入式 PGLite | 无 |
| `VITE_AUTH_ENABLED` | 认证开关；`false` → dev-user 直通 | true |
| `VITE_PUBLIC_HOSTNAME` | 已发布应用的公共域名（OG 卡片 URL） | — |
| `VITE_PROJECT_ID` / `X_CREATOR` / `X_CREATOR_ID` | 平台注入（extensions/OG） | — |
| `.grok/app-env.json` | 仅 `VITE_` 前缀键的构建标记载体（`process.env` 优先） | 无 |

### 15.2 命令

```bash
npm install            # 安装依赖

npm run dev            # 开发：vite dev --host 0.0.0.0 --port 8080（经 with-app-env 包装）
npm run build          # 构建：vite build && npm run db:migrate（部署时自动应用 SQL 迁移）
npm run build:dev      # 以 development 模式构建
npm run preview        # 预览构建产物（也经 with-app-env）
npm run typecheck      # tsc --noEmit
npm run lint           # eslint .
npm run format         # prettier --write .
npm run test           # node --test scripts/**/*.test.mjs + TS strip 测试（app-data/gate-identity）
npm run check:auth     # 校验 dev 服务器与下一构建的 VITE_AUTH_ENABLED 一致
```

访问开发服务器：`http://localhost:8080`。

### 15.3 数据库

- **无 `DATABASE_URL`**：PGLite 在启动时自动创建/应用 `migrations/*.sql`。
- **有 `DATABASE_URL`**：`npm run build` 阶段由 `scripts/migrate.mjs` 应用迁移；新表请按 `0002_*.sql…` 递增命名。

### 15.4 玩法跑通（README 九步流程）

1. 读开场 → 2. 在轨道上选角落 → 3. 从镜中读故事 → 4. 用情绪词片写信 → 5. 折叠 → 6. 弹弓掷出 → 7. 飞行 → 8. 与窗边的人对话（约 3 回合封回信）→ 9. 收信并归档。

---

## 16. 平台集成亮点

1. **PWA**：Vite 插件与 Nitro 中间件双端共用 `grok-pwa-shared`；`createHeadInjector` 只缓冲到 `</head>`，兼容流式 SSR；manifest/安装页/OG 全套。
2. **OG 卡片**：`site.json` + `public/og.jpg` 优先，否则回退 `og.grok.me` 占位服务；`?install=1&platform=ios` 专属教程页。
3. **预览宿主桥**：嵌入父页面时双向同步路由与历史，严格 allowlist + 路径白名单。
4. **认证三模式**：deployed / live-preview / off，含 bearer token、gate identity（JWKS Ed25519）与会话 cookie 显式下发、同源请求守卫。
5. **双后端 DB 无痛切换**：一个 `Sql` 接口覆盖 PGLite/Neon，OID 类型差异在层内消化。
6. **工具型 Agent 面板**（JudgePanel）：实时展示 token 计量与 core/recall/archival/hits，便于玩法调参。

---

## 17. 架构决策记录（ADR 摘要）

| # | 决策 | 理由/权衡 |
|---|---|---|
| 1 | Server Functions 作为唯一 AI 入口 | 客户端绝不直接持 LLM 密钥；SSR 端统一超时/回退 |
| 2 | Pi-Style harness（非裸 LLM） | 工具循环保证「先检索再回复」，人格约束（RULES）内联于 prompt |
| 3 | Prompt Chaining 三链单实现（chains.ts） | 每步短命 Pi Agent 单工具、输出经确定性校验；历史上的 pi-echo/graph 实验版已删除收敛 |
| 4 | 无 Key 亦能完整游戏 | `hasApiKey` 门控 + `fallbackEcho` 保证体验闭环与演示可用性 |
| 5 | localStorage 作为唯一持久层（旅程+记忆） | 0 基础设施就能玩；Neon 仅作为平台模板的可选深度 |
| 6 | 双后端 SQL（Neon ⇄ PGLite） | 本地零配置、线上可扩展；`_migrations` 按 basename 记账避免两路径重复 |
| 7 | WebRTC 全矩阵 + 轮询信令 | 免托管信令服务器；400ms/2s 节流平衡延迟与开销 |
| 8 | `with-app-env` 统一 dev/build/preview | 从源头杜绝 `VITE_AUTH_ENABLED` 三端不一致 |
| 9 | MiniMax-M3 主、AI PING 备选 | Anthropic Messages 默认；OpenAI 兼容作备选；密钥仅存服务端环境 |

---

> 维护提示：本文档基于 2026-08-22 的系统性源码阅读生成。若 agent 编排（`server.ts` 的导入面）或阶段流程有调整，请同步更新 §7 与 §6。