# Paper Echo · 小星球信使（整合版原型）
运行：
  cd /workspace/game-messenger/repro && python3 -m http.server 8792
  打开 http://localhost:8792/play/index.html
操作：WASD / 方向键 走路，L 切换中/英。
URL 参数：
  m=1|2|3   里程碑（1 只走路；2 捡信送信；3 加日夜轮换 + 夜晚推进，默认 3）
  palette=day|dusk|night  固定时段（不轮换）
  glow=1.2  窗灯辉光强度（Ìtùtù 方法 B）
  cycle=120 一整轮昼夜的秒数
  lang=zh|en；nosave 不读写存档；reset 清空夜晚进度
  capture   录屏模式（不跑 rAF，由脚本调用 tick(dt)）
录屏：VW=960 VH=600 python3 ../playcap.py "m=3&cycle=70&nosave" play/final.mp4 150 auto 8797
模块：nightProgress.js 来自 àṣẹ（playable-ase/），挂在“她家”；日夜过渡逻辑移植自 Ìtùtù art/palette-test/main.js 的 setTod；
字体：霞鹜漫黑 LXGW Marker Gothic（OFL，fonts/ 里是按用到的字做的子集）。
钩子：window.PaperEcho.onNightEnd.push(fn) —— 每晚结束时调用 fn({night, delivered, houses})。
