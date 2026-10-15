# PaperEcho 发布回归门禁

给没参与开发的人看：改完代码跑什么、发布前跑什么、哪些必须人工拿真实模型确认。命令都在仓库根目录执行。

## 什么时候跑什么

- 日常开发：`npm test`；想更稳加 `npm run qa:release:fast`（与 CI 同口径）。
- 改了交互（手势、动效、UI、Phase 流转）：`npm run qa:release:browser`，过了再提 PR。
- 发布前：`npm run qa:release` 全绿（退出码 0）+ 下面的真实模型人工清单逐条打勾。

浏览器门禁第一次跑前装一次 Chromium：`npx playwright install chromium`。
单次全量约 2～3 分钟，其中 no-key 本地匹配约 20～40 秒是产品行为，不是测试慢。

各层具体做什么、no-key 怎么保证、证据口径（浏览器 vs 服务端）、重试边界：见
`scripts/e2e/game-release-smoke.mjs` 与 `scripts/e2e/signal-cleanup.probe.mjs` 的文件头与注释。
失败证据（results.json + 失败截图）落在 gitignored 的 `artifacts/release-smoke/`。

## 人工清单：真实模型（需要 key）

发布前开一局真实模型：

- 完整旅程走完八个 Phase。
- Encounter 至少 5 轮，逐轮有非空、连贯的回复。
- 记忆可见：隔几轮后对方能复述你说过的事实。
- 非 Encounter 阶段按 J 开评审面板：token 数不为 0（为 0 说明这一步没走到模型）。
- 主动结束 → Return → Archive → 新的一晚。
- 不串人名、不串城市。
- 玩家可见文本里没有内部实现词，人工读一遍（词表以 `src/game/agent/exchange.ts` 的 `hasMetaLeak` 为准）。

## 为什么这样分

- 真实模型检查永远不进自动测试与 CI：外部服务波动、延迟、成本、输出随机性都不适合做门禁。所以自动层全部 no-key，模型那一侧只能靠人。
- 浏览器门禁暂不进 CI：先证明它跨机器稳定。将来进 GitHub Actions 时，先 `npx playwright install --with-deps chromium` 再跑 `npm run qa:release:browser`。
- `qa:release:signal` 故意不叫 `*.test.mjs`：它启动完整门禁再发 SIGTERM，需要浏览器 + Vite；落进 `npm test` 的 glob 会把浏览器依赖拖进 CI。它只在发布门禁里跑，归属判断的单测随 `npm test` 常驻。
- 改门禁时守住：只用真实手势推进，不用 `setState` 跳阶段；重试只给已证明无害的时序边界、有上限，最终状态断言从不放宽；失败证据只留诊断摘要，不写 key 值、完整 localStorage 和信件/对话全文。

## 异常现场

报 `.env.release-gate-bak exists alongside .env`：上次运行异常退出，两份 `.env` 并存。门禁不替你猜，人工确认留哪份、删掉另一份再跑。
