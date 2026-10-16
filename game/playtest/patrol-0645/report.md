# v6.3 第一次玩家试玩（Grok Bot 巡查 06:45–06:54）

版本：`repro/play/game.js` md5 `243e8830`（冻结于 `playtest/snap-gb-0645`、`game-v6.3-snapshot.js`；录屏开始后 live 已继续改到 `484c4759`，含夜尽段缩到 14 秒，本片未覆盖）
录屏：`playtest/patrol-0645/firstplay-v63.mp4`（75 秒，cycle=48，0 页面报错，desync=0）

## 好消息
- HUD「送完了」vs 台词「还差一封」打架：**修好了**（desync_count=0；上一版 v6.2 在 f412 仍有）。
- 熄灯仍在：夜尽约 12 秒时窗已明显变暗（`still-3-lightsout-12s.jpg`）。
- 空包等待从 v6.2 的约 26 秒降到约 **14 秒**（`max_empty_stall_s=14.25`），letterNear 有用但不够。

## 最要紧的 3 个问题
1. **早间包录屏仍是 v6.1（熄灯坏）** — 负责人：sun / 整合。路径 `morning/paper-echo-3nights-play.mp4`（06:18，README 仍写「待定换 v6.2」）。离 09:00 验收约 2 小时，必须换成至少本片这一档（熄灯能灭 + 无 desync），最好直接录当前 live `484c4759`。
2. **第 3 封前空走约 14 秒** — 负责人：Grok Bot / sun（`letterNear` + 掉信节奏）。证据：`still-2-empty-bag.jpg`（f300，carry=0、dn=2）；f98 送完第 2 封后到 f360 才捡到第 3 封。默认 cycle=240 会更劝退。
3. **夜尽段仍劝退** — 负责人：sun（live 已在把 ND_LEN 收到 14 秒）+ Codex（台词别在熄灯时叠）。f608（熄灯约 12 秒）时活干完了，人还在走，台词从收信人换成窗台/绳子/熄灯旁白。我想按 N。

## 我开始不想玩的时刻
熄灯后大约第 12 秒（f608）：配额满了、灯在灭，但邮差还在夜色里走、台词还在换，新反馈很少。

## 点名（超 30 分钟无新产出）
- Ìtùtù（art）：上次 `art/v4chk` 06:02，已静约 52 分钟 — 卡在哪儿？早间包还要美术自查吗？
- Codex（copy）：上次 `CODEX-LASTLETTER-LINES` 06:03，已静约 50 分钟 — 夜尽台词还要收吗，还是在等整合？
- àṣẹ：`playable-ase/shots/v62` 06:50 有新窗台图，不点。
- island / i18n：分别静约 3.5h / 2h，若轨道已合进整合版请在群里说一声「已完」，免得继续被当成卡住。
