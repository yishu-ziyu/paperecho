# 群进度（sun → 群；SendToAgent 在我这边不可用，所以写在这里，由 lead 转发）
## 02:55 里程碑 1（走路）
视频：repro/play/m1_walk.mp4（65s，脚本按键：绕星球一圈、左右转、倒退）
行家会挑：①转向是瞬时的、没有加减速 ②镜头死跟、转身时晕 ③靠近房子时镜头钻进屋顶
已修：加减速和转向平滑、转弯时身体微倾、走路上下起伏；镜头偏航滞后、跟着前瞻、靠近房子自动抬高；去掉镜头滚转（horizon 不再歪）
## 03:00 里程碑 2（捡信送信）进行中
playtest 3 条已修：①世界气泡挡脸 → 改成屏幕边缘箭头 + 距离，2m 内隐藏 ②送达时停 0.6s 挥手、窗户闪亮、镜头轻推，然后才出收信人台词 ③HUD 用 Ìtùtù 样式（#f6efe2 字，#373f42 70% 底板，1px 描边）
参考 refs-x：03（目标光圈随靠近放大）→ 加了地面光圈；07（地面箭头）→ 邮差脚前的引导三角；08（数字弹跳）→ +1 弹出带回弹、彩色纸屑
## 03:30 黑屏已修
- 'Cannot access PEOPLE/visits before initialization' 已修（声明前移），页面无报错加载（只剩 occlusion.js 还没到的 404，已 try/catch 兜底）
- 夜数 +2 已修（只在 PH 回绕时触发 nightEnd）
- 接入：daynight.js（每帧在 step 后调用，自己的调色只在没有 daynight.js 时兜底）、nightProgress.js（阿汀家，正面墙开了真窗洞）、收信人 5×3（老周 n3 用 3b）、CODEX P0 文案、台词按字数停留 + 「……」后 1.2s 抖包袱、☾ 换成 SVG
- 镜头：照 FIX-CAMERA 改成相机相对移动，走路时相机朝向冻结，停下 0.6s 再回到身后；抬高约 7°；交互半径 2.5m；地面光圈改成柔和的光点圈

## 04:00 — integration pass (play/game.js)
- Occlusion: hook guarded (try/catch, no-op if missing/throws); courier tagged userData.noOcclude. Interim: camera +~8° pitch & pulled back (height 3.0→3.75, back 4.4→4.8).
- Night lighting (Ìtùtù numbers): windows emissive ×1.8, lamp heads ×1.6 (own kind), bloom threshold soft 0.85, strength 1.2; 6-light pool of warm PointLights (#ffcf6a, 1.3, d5, decay2) on nearest lit windows; additive ground ring per lit house (opacity 0.09, soft radial). Walls dim at night to ~45% toward sky blue (houses only). Night clouds ×0.5. Delivery flash = window only (no house pulse/scale).
- Keepsake moment: 2.6 s camera push-in to 阿汀's window with the "— 阿汀" note, then return (verified framing in still).
- HUD (CODEX-HUD-REVIEW): 信 N (svg envelope), ★ 送了 n/3 capped → '★ 送完了 ✓' + '（N）睡觉'; '第 N 晚' / '第 N 天'; '纸鹤 x/5' with icon on its own line; '留下的 N' hidden at 0; hint fades after 5 s; end line '包空了。……明天的信，明天再说。'. ✉ ✦ ✓ aren't in Marker Gothic → replaced with SVG; font re-subset, all used CJK glyphs covered.
- Measured: night wall/window luma before wall dim 146/240.

## 04:20 — 3-night test PASS + v4
- Autopilot, cycle=25, 640 ticks: nights 0→1→2→3 (+1 per cycle), np.keepsakes 1→2→3, delivered 3/6/9, cranes 5/5, no console errors (only a 404, favicon-type).
- Swapped in àṣẹ's new nightProgress.js; silhouettes use flat unlit toon (kind 7, #373f42), warm back panel restored (opaque, toggled by its fade).
- v4: streetlight beside every house (18 + 10 random), lamp heads ×1.6 → warm focus along the route at night.
- Recording play/v4_final.mp4 (150 s, m=3, cycle=50, autopilot) — in progress.

## àṣẹ — occlusion.js v2 (circular cutout; see OCCLUSION.md)
- `import { updateOcclusion } from './occlusion.js';`
- `updateOcclusion(camera, hero, scene);` — every frame, after the camera update, before `render()`

## 05:35 — v6 game.js (Grok Bot, sole owner of game.js) — md5 1b9b814280c41036decb87f824a2230a
- Progression: night 1 = 小满/阿汀/米婆婆; day 2 opens the roped-off well district + new recipient 老周 (first on the route); night 3 = 老周's knock (seeded by his night-2 follow-up line, CODEX-V5-LINES) + 豆豆 for the first time + 3 regulars. Commissions open only at night (todT ≥ 1.5); the night holds at PH 2.2 while commissions/end-sequence remain. Cranes 3 → 6 → 10 (cap by day).
- **nightDone interface (for daynight.js, Ìtùtù):** after the last delivery (+6.5 s), each frame during the phase:
  - `scene.userData.nightDone = true`, `scene.userData.nightDoneT` = seconds
  - `scene.userData.lightsOut = { k, keep }`: k = elapsed/20 (0..1), keep = [house Groups that got letters tonight]
  - `scene.userData.deliveredTonight` = the same array
  - Any key: k = 1 for one frame, then skip to dawn. At 20 s: k = 1, then dawn. At dawn (nightEnd) `lightsOut` is deleted and `nightDone` is false.
  - The line 「灯一盏一盏关了。……还亮着的那几扇，今晚有我的信。」 shows at 14 s (≈k 0.7) for ≥4 s, not shown if skipped. On night 3 it's 「包空了。……窗台上多了几样东西，明天再数。」 instead.
- Courier walks back toward the start by himself during the phase.
- Keepsakes come only from nightProgress.js (outer sill); game.js scales them 1.5 → 1.8 after attach.
