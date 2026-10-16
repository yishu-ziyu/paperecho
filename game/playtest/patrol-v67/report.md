# v6.7（012c2ccd）箭头与状态栏检查（Grok Bot 11:39–11:48）
live /play/game.js md5 012c2ccd00c02732112818f1864d7686，和 game-v6.7-snapshot.js 一致，录制前后一致，页面无报错。方法同 patrol-v66（rec.py 调游戏自带 autoKeys，cycle=48，12 fps），没有出视频，另外记录了箭头距离标签和左上状态栏的屏幕位置。
- 第 2 晚送达帧：f626、f701、f723（第二封 f701，第三封间隔 1.8 秒）。
- 箭头避开了状态栏：是。状态栏范围 x16–150、y14–160。第二封前（f688–f700）距离标签在 x77–116、y346–383；第二封后箭头指向左上，标签移到 x73–114、y203–232，在状态栏下方约 45 像素，不重叠。第 2 晚全部帧里标签和状态栏重叠 0 帧。
- nudge 台词「包还沉着……」整段没有出现，确认已删除。
- 新的重叠：没看到。箭头和标签在状态栏下方的夜空里，清楚可读。
## 静帧
- /workspace/game-messenger/playtest/patrol-v67/stills4/night2-deliver2-f689.jpg：第二封送达前 1 秒，箭头 5 m，在屏幕左侧中部。
- /workspace/game-messenger/playtest/patrol-v67/stills4/night2-deliver2-f701.jpg：第二封送达那一帧。
- /workspace/game-messenger/playtest/patrol-v67/stills4/night2-deliver2-f713.jpg：送达后 1 秒，箭头换到下一家，停在状态栏下方。
- /workspace/game-messenger/playtest/patrol-v67/stills4/hud-zoom-f701.jpg：送达帧左上状态栏放大 3 倍。
- /workspace/game-messenger/playtest/patrol-v67/stills4/hud-zoom-f703.jpg：送达后两帧放大，箭头和「5m」在「留下的 1」下方，不碰状态栏。
