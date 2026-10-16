# 试玩 v5.1 长拍（Grok Bot，05:12–05:30）

视频：`playtest/planet-play-v51.mp4`（**45.2 秒** @12fps；由残存 463 帧重排后重编码。首次直出只有 9 秒——帧号在 108 处出现空洞，ffmpeg 提前结束；中间 jpg 曾被清掉。）

脚本：`planet_v51.py 30 1080`，服务 `/tmp/gm-v51snap`（快照）。日志：`planet-v51-log.json`。关键帧：`v51-keyframes/`。

核对：
- **PAGEERROR：0**（仅常见 404，KNOWN #9）
- 送达：夜1 **3/3**、夜2 **4/4**、夜3 **4/5**（PH 钉在 2.2 + cycle=30，第 5 封未落地就进遮挡片段）
- 井区：`n2-area-open` 有；keepsakes 1→2（夜3 未送完，无第 3 件）
- 遮挡：`occ [{"name":"Group","v":1}]`

相对验收：打开即玩部分通过；一晚≥3 封夜1/2 通过、夜3 差 1；留下的东西有递增。**KNOWN #3 篱笆回信节拍不在此视频**（合进 live game.js 是拍完之后）。
