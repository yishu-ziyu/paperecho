# v5.2 篱笆回信节拍（KNOWN #3，Grok Bot，~05:33–05:42）

## 改了什么（`repro/play/game.js`，无 commit）
送完当晚配额后不再只弹催睡，而是：
1. **`beginFenceBeat`**：在阿汀家篱笆前生成发光回信信封；HUD「去篱笆看看」；箭头「回信 · Nm」；引导三角指向信封。
2. 走到 2.6m 内 **`completeFenceBeat`**：捡信 → 推镜看窗台信物（àṣẹ `nightProgress` / `pendingKeep`）→ 收信人回信台词（埋明天：井边绳子 / 敲两下 / 窗台三样）→ 再交给 sun 的 **`startNightDone`**（`daynight.js` `lightsOut` 逐盏灭，邮差往起点走）。
3. 自动驾驶：先去篱笆；**修好**了「回信台词还没播完就按 N、跳过 lights-out」的竞态——现在只有 `nightDone` 阶段才自动按 N；另有 16s 兜底调用 `startNightDone`。

文案：`fenceHint` + `FENCE_REPLY[3]`（中英）。合进了当时已有的 `holdNight` / `nightDone` / `lightsOut` 接口，没有改 `playable-ase/nightProgress.js` 本体（仍用 import 的 attach/onDelivered）。

## 证据图（`playtest/morning-stills/`）
| 文件 | 用途 |
|---|---|
| `fence-beat.png` | 送完了 +「去篱笆看看」+「回信 · 9m」+ 留下的 1 |
| `fence-done.png` | 窗台信物台词「借你家窗台晾一晚。」— 阿汀；HUD 回到「（N）睡觉」 |
| `tod-day/dusk/night.png` | 日/黄昏/夜仍帧（早报包） |
| `lang-zh.png` / `lang-en.png` | L 切换中↔英 |
| `night-done-lightsout.png` | fence→nightDone 修竞态后必达（f294，PH=2.2） |

日志：`fence-quick-log.json`（FENCE f119 → DONE f162，keepsakes 1，lampLevel→1）。`fence-nd.py`：**COMPLETE** FENCE f119 → DONE f162 → NIGHTDONE f294 → next morning；PAGEERROR 0。

## 验收条目（本拍）
| # | 状态 | 说明 |
|---|---|---|
| 2 邮差/镜头 | **基本过** | 第三人称跟拍清楚；KNOWN #1 贴墙贴脸仍在 |
| 3 空窗 | **改善，待默认 cycle=240 长拍成片** | 短拍已证 fence→keepsake→nightDone；v61 长拍中已出现 `postBeat=fence` |
| 4 黄昏灯/夜里窗灯 | **部分过** | 黄昏/夜里窗与路灯亮；**白天仍有窗在亮**（tod-day），未完全达到「夜里才最亮」 |
| 6 按 L | **过** | zh「信/送了/第1天」↔ en「Letters/Sent/Day 1」可来回切 |
