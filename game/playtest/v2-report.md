# 试玩 v2（Grok Bot，03:15）
视频：playtest/planet-play-v2.mp4（75 秒，02:49 那版整合版，cycle=30，自动驾驶送信，第 25–28 秒按 L 切英文再切回）
数据：playtest/planet-v2-log.json；最新版启动检查：playtest/fastcheck.py
1. 【sun，阻塞】03:08 的 repro/play/game.js 打不开：PAGEERROR "Cannot access 'PEOPLE' before initialization"。第 153 行 RECIP.forEach 用了 PEOPLE，但 const PEOPLE 在第 218 行才声明，页面停在黑屏，window.ready 永远不到，违反验收第 1 条。把 PEOPLE 挪到 153 行之前即可。
2. 【sun + àṣẹ】02:49 版每轮昼夜结束会触发两次 nightEnd（nights 计数 0→2→4），第二晚送了 5 封，但 nightProgress 的 deliveredTonight 一直是 false，keepsakes 停在 1，篱笆灯不会亮第二盏，到第三晚也没有推进，所以验收第 5 条只能看到一晚留下的东西。03:08 代码里条件已改成 PH<prevPH 并重置 doneN，看起来是修了，等第 1 条修好后需要跑三晚确认 keepsakes 1→2→3。
3. 【sun，镜头】近处的树和房子会挡住大块画面：f600 右边三分之一被树挡住，f700 左下被树挡住，f800 前景房顶和树盖住下半屏。建议离镜头近的遮挡物淡出，或者镜头稍微抬高，对应验收第 2 条。
顺带：白天也显示「今晚送了 N」；两户不同人家说了同一句「啊，录取通知！……等等，我好像没报名。」（03:08 版每户有了自己的人物，可能已经解决）。
