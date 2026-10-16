# 试玩 v6 长拍（中断，05:14–05:38）

原计划：`rec_v6.py 52 2600` → `planet-play-v6.mp4`。进程在约 948 帧时被同目录清理/重启打断（`v6_frames` 被 `rmtree`），**没有产出完整 mp4**。残日志 `planet6.out` 只到 f240（重启后那次也未跑完）。

后续：另一路 `rec_v61.py 36 2500`（pid 仍活）在写 `v61_frames/`，等它结束后再补时长 / PAGEERROR / 送达 3/4/5 核对。

本回合 Grok 侧重点改到 KNOWN #3 篱笆回信节拍（见 `v52-fence-report.md`），不杀 v61。

更新 05:47：`rec_v61` 仍在跑（~720+ 帧），日志已出现 `postBeat: fence`（夜2 送完 4/4 后），说明 live 篱笆节拍进了长拍。
