# PaperEcho 发布回归门禁（Release Regression Gate）

本文档给没参与开发的人看：改完代码后跑什么、发布前跑什么、哪些是自动的、
哪些要人工拿真实模型确认、失败了去哪里找证据。

英文术语首次出现时附中文解释。命令都在仓库根目录执行。

---

## 一句话

- 日常开发：`npm test`（不够时加 `npm run qa:release:fast`）。
- 改了交互（手势、动效 Motion、UI、Phase 流转）后：`npm run qa:release:browser`。
- 发布前：`npm run qa:release`（fast + browser + signal 中断清理验证）+ 一节真实模型人工检查。

## 三层检查

| 层 | 命令 | 自动 | 要密钥 | 进 CI（持续集成） |
|---|---|---|---|---|
| A. Fast gate（快速检查） | `npm run qa:release:fast` | 是 | 否 | 是（已在 `.github/workflows/ci.yml`） |
| B. Deterministic browser gate（确定性浏览器检查） | `npm run qa:release:browser` | 是 | 否（no-key，无模型密钥） | 否（稳定性证明中，见第六节） |
| B+. Signal cleanup probe（中断清理验证） | `npm run qa:release:signal` | 是 | 否 | 否（同 B，见下） |
| C. Real-model manual gate（真实模型人工检查） | 本文档第七节清单，人工执行 | 否 | 是 | 永不进入 |

## A 层：fast gate

顺序执行（任一步失败即停，退出码非 0）：

```
npm run typecheck && npm run lint && npm test && npm run check:deps && npm run build
```

与 CI 的 guard job 完全一致。先跑它：便宜、快速失败（fail fast）。

## B 层：确定性浏览器检查

脚本：`scripts/e2e/game-release-smoke.mjs`（Playwright，浏览器自动化框架；
Chromium headless，无头 Chromium）。

前置要求：`npx playwright install chromium`（只需装一次；CI 见第六节）。

### 它实际执行的 UI 操作（全部是真实玩家操作，没有捷径）

Title 矩阵（次数可调，见下）分两类行为、两条路径，结果分别计为
`freshNavigation` 与 `persistedStateReload`：
fresh 为真实首次文档加载（当前 origin 清 localStorage → about:blank →
再进应用，不 reload）；reload 为 seed 旧 journey 后 reload。
另有 reload 后 Enter / Space 各进 Orbit。
每次断言：最终 phase 为 orbit、30 秒内 hydration mismatch（服务端 HTML
与客户端首次渲染不一致）为 0、pageerror 为 0、无 double commit（一次手势
只提交一次：phase 稳定且 journeys 数量不变）。

完整 no-key（无模型密钥）旅程，一局走完八个 Phase（游戏阶段）：

1. Title：真实下拉 → Orbit。
2. Orbit：拖两个情绪块到判近（fingerprint closeness ≥ 0.42）、原生 input
   事件填信、点「开始聆听」（`[data-listen-go]`）→ Fold。
3. Fold：两次对角折叠、上推穿窗（`[data-pull="window"]`）→ Throw。
4. Throw：点地球仪选地区、等「拉满再放」、拉弹弓释放（最多 3 次）→ Flight。
5. Flight：等本地匹配完成（echo 非空、searching 为 false）、风暴转向、
   落地拉杆（`[data-pull="flight"]`，最多 3 次）→ Encounter。
6. Encounter：读开场白、发 3 轮（每轮等 waitingEcho（等待回声）先 true
   后 false、round 递增、收到新的非空回复）→ 点「把今晚折回去」→
   点「再点一次，把今晚折回去」（主动结束，显式 seal）→ Return。
7. Return：两次下拉 → Archive，断言 journey 可见（journeys ≥ 1）。
8. Archive：等 `paper-echo-v1` 写下 journey id → reload（重载）→
   按产品设计回到 title（已完成的旅程不 resume，`persistSnapshotNow`
   会清掉 title/archive 快照）→ 同一 journey id 还在 store 和
   localStorage 里 → 下拉进新一轮 Orbit，上一轮仍在，
   且新一轮没有继承 searching / waiting 状态。

全程允许**读** `window.__echoGame` 做等待和断言，禁止用
`store.setState` 跳阶段（复位只用真实导航 goto / reload）。

重试政策（已证明的无害动画/环境时序边界才允许，且有上限）：
turn-1 输入框允许 1 次刷新重进（诊断：正常 entrance <1s 收敛；
机器负载下 bloom+入场 timers 可能滞后；刷新是受支持的用户路径，
in-flight encounter 会带 recall 恢复；真坏则两次都失败）。
`reload` 导航本身允许 20s 超时 + 1 次重试（dev-server/HMR 抖动类，
reload 后状态断言不变，真坏照样失败）。
其余断言（turn-2/3、seal、计数、via、泄漏、外部请求）一律单次有界等待，
不重试；手势动作本身（dragToken、弹弓、flight/return 拉杆）允许最多 3 次
重新做出同一真实手势，最终状态断言不变（validator 结论：不削弱门禁）。

### 状态断言（节选，完整版见脚本）

- 每个玩家 turn 都有非空新回复；`meter.via` 全程为 `archive`（本地路径）。
- `runMatch` 恰 1 次、`runTurn` 与玩家轮数一致（3 次）、`runSeal` 恰 1 次
  （按 server-fn（服务端函数）URL 内 base64 的 export 名精确计数）。
- `runVoice`（问候/兜底/告别语音线）只计数不 pin：它是辅助产品流量，
  走哪条 fallback（兜底）路径取决于本地内容，不适合定死数量。
- 外部请求：浏览器外部动态请求（`browserExternalRequests`）必须为 0；
  服务端实时搜索靠 `PAPER_ECHO_LIVE=0` + 凭证移除在构造上关闭
  （`serverLiveSearchForcedOff`，见 no-key 一节）。
- 内部术语：所有玩家可见回复（开场白、3 轮回复、回信）用与产品
  `hasMetaLeak()` 逐字一致的镜像正则检查（`scripts/e2e/` 内
  `META_LEAK`，随产品规则联动，有单测 pin 住命中与放行）：
  世界档案 / 工具调用 / 检索结果 / 检索到 / tool call /
  search_cases / search_archive / remember / prompt，以及
  「在|从|去…素材库…看到|查到|搜到|翻到|找到」
  「素材库…里|内…有一条|一个人」这类来源自述。
  该镜像的真值来源是产品单测，不是随机模型。

### no-key（无密钥）是怎么保证的（四层）

1. 运行前把仓库 `.env` 原子改名移开（同目录 rename），统一幂等的
   `cleanup()` 在正常完成、测试失败、SIGINT、SIGTERM 下无条件移回；
   signal handler 只做 `shutdown(exitCode)`，从不直接 `process.exit`；
   signal 接管后 main 让出退出权（已验证过的竞态：cleanup 关浏览器期间
   主流程若先走完会抢先 `exit(1)` 覆盖信号退出码，必须 park 等待）。
   恢复后校验 sha256，不一致则大声失败。
   上次崩溃的残留备份会在下次启动时自动恢复（仅当 `.env` 本身缺失；
   两者并存则拒绝运行，等人工看）。
   `results.json` 里记录 `.env` 前后 stat + hash，可审计。
   中断清理有独立的 subprocess 验证（`scripts/e2e/signal-cleanup.probe.mjs`，
   复用生产 cleanup 实现）：发 SIGTERM 后断言进程退出、`.env` hash 不变、
   无 bak 残留、端口关闭、scratch 删除、无 Chromium 残留。
2. `buildGateServerEnv()` 构造子进程环境（纯函数，返回新对象，不改输入，
   不输出任何凭证值）：删除模型凭证（MINIMAX_*、ANTHROPIC_*、AI_PING_*、
   PAPER_ECHO_LLM）、实时搜索凭证（FIRECRAWL_API_KEY、ANYSEARCH_API_KEY）、
   代理变量；并**强制** `PAPER_ECHO_LIVE=0`（不是只删除——显式 0 让
   `liveEnabled()` 直接返回 false，即使未来遗漏某个搜索凭证也不会出网），
   强制 `VITE_AUTH_ENABLED=false`（宿主 export 盖不掉仓库测试配置）。
   `results.json` 记录 `scrubbedCredentialNames`（只记变量名，不记值）。
3. 浏览器层：非 loopback（本地回环）请求凡不是已知静态资源一律
   route-abort（路由拦截）+ 记录；出现一条即失败。
4. 已知静态资源（`fonts.googleapis.com`、`fonts.gstatic.com` 的确定性
   CDN 字体）正常加载、单独计数 `externalStatic`、不计入失败：
   字体不可能是模型/搜索流量；拦截它们反而会降低渲染保真度并制造
   harness 自身的 `ERR_BLOCKED_BY_CLIENT` 噪声。

证据口径（不要混淆）：`browserExternalRequests` 为 0 只证明**浏览器**
零外部动态请求；**服务端**零实时搜索靠构造证明
（`serverLiveSearchForcedOff: true`，即 LIVE=0 + 凭证移除）——
Playwright 的 route 层看不到 Node 服务端的 fetch，不宣称它看到了。

### 就绪条件（readiness gate）

不用 React 私有 fiber 字段，不靠固定 sleep：等新 document +
`window.__echoGame` 存在 + `[data-pull="title"]` 可见 + phase 符合预期 +
waiting/searching 为 false。动画边界允许短等待，但推进一律看状态。

### 增加 Title 重复次数

```
node scripts/e2e/game-release-smoke.mjs --title-fresh 10 --title-reload 20 --enter 5 --space 5
```

另有 `--port 8123`（被占用自动上浮）、`--out <results.json 路径>`。
单次全量约 2～3 分钟（no-key 本地匹配约 20～40 秒是产品行为，不是测试慢）。

### 输出与失败产物

- 成功：`artifacts/release-smoke/results.json`（`artifacts/` 已在
  `.gitignore`，不进仓库），不保留截图。
- 失败：同目录 `fail-<timestamp>.png`（当前截图）+ JSON 里的
  `failurePhase`（当前 phase）、`failureStore`（store 摘要：phase /
  round / journeys 数量 / echo 名城 / meter，不含信件正文与对话文本）、
  console / network 摘要。完整 localStorage、API Key、用户隐私不写入。
- JSON 字段：gitHead（代码版本）、startedAt / finishedAt、browser、
  viewport、phaseResults（含每步 ok/ms/detail）、requestCounts、
  browserExternalRequests、externalStatic、serverLiveSearchForcedOff、
  scrubbedCredentialNames（变量名，无值）、consoleErrors、pageErrors、
  failedRequests、persistenceChecks、pass、failureReason。

### 被允许的 warning（以及为什么）

`ALLOWLISTED_WARNINGS` 当前为空：只有亲眼见过、证明无害、按原文逐字匹配
的警告才允许进名单，宽正则一律不接受。WebGL（网页图形库）单帧警告若出现，
按此次实际文本逐字加入并注明原因与日期——在那之前，任何 console.error
都是阻断失败。

## 第七节对应的 C 层清单（人工，真实模型）

发布前开一局真实模型（需要 Key，绝不进自动测试与 Actions）：

- 完整旅程走完八个 Phase。
- Encounter 至少 5 轮对话，逐轮有非空连贯回复。
- memory（记忆）写入与读取可见（隔轮复述玩家事实）。
- TokenMeter（token 计量）在 UI 正常累加。
- 主动结束 → Return → Archive → New Journey。
- 对话连贯，无串人名/串城市。
- 玩家可见文本无内部实现词（同 B 层词表，人工读一遍）。

## 日常 / 交互 / 发布对照表

- 日常开发：`npm test`；改前改后想更稳：`npm run qa:release:fast`。
- 修改交互（手势/Motion/UI/Phase）：`npm run qa:release:browser`，
  通过后再提 PR。
- 发布前：`npm run qa:release` 全绿 + 上面 C 层人工清单打勾。

`qa:release:signal`（`scripts/e2e/signal-cleanup.probe.mjs`）故意不叫
`*.test.mjs`：它会启动完整门禁再发 SIGTERM，需要浏览器 + Vite，不能进
`npm test` 的默认 glob，否则 CI 的 `npm test` 会被拖进浏览器依赖——
这正是本 PR 承诺不做的事（见第六节）。它只在发布门禁 lane 里跑。

## 第六节：CI（持续集成的未来）

本 PR 不加强制浏览器 workflow（工作流）：先证明 gate 跨机器稳定。
CI 仍是 typecheck / lint / test / check:deps / build。

未来加入 GitHub Actions 时的形状（Ubuntu runner）：

```yaml
- uses: actions/setup-node@v4
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npm run qa:release:browser
```

真实模型检查永远不进无密钥 CI：外部服务波动、延迟、成本、输出随机性
都不适合做门禁。

## 复用与一次性脚本说明（给后来人）

- 复用：`scripts/play-gestures.mjs`（pull/dragToken 动词）、
  `scripts/qa-full-journey.mjs`（各 Phase 的 UI 路径编排）、
  `runtime-acceptance/title-reload/acceptance-loop.mjs`（就绪判定与
  hydration 抓取思路）、`runtime-acceptance/run-nokey-smoke.mjs`
  （seal 两步按钮文案与 fetch 计数思路）。
- 一次性诊断脚本（repro-driver、各 runtime-*/probe、collect、preview-*、
  qa-loop/qa-throw 等）不进仓库；`runtime-acceptance/` 整体（含截图、
  profile、结果 json）不提交——它含机器路径与历史产物。
- 已有 `scripts/browser-smoke.mjs` 只查落地页渲染（标题/canvas/溢出/
  截图），不碰任何玩法；本 gate 与它是互补关系。

## 回答

以后修改 PaperEcho 的界面或交互后，能否用一条命令判断核心游戏流程
有没有被破坏？能：`npm run qa:release`（fast 全绿 + 确定性浏览器整局
+ 中断清理验证通过，退出码 0 即通过，非 0 即失败）。
