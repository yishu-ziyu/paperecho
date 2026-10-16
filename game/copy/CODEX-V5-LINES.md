# Paper Echo v5 新内容台词审查（按 VOICE.md v2）
读的是 repro/play/game.js（04:26 版）和它 import 的 nightProgress.js。只写了这个文件，没动别的，也没 commit。
显示时长按 game.js:295 的 toastDur 算：中文 0.18 秒/字，带省略号再加 1.2 秒，最少 3.5 秒。

## 代码里找到的 v5 台词
| 行号 | 什么时候出现 | ZH | EN |
|---|---|---|---|
| 223 | 第 2 天井边区域解锁（topPop，约 2.2 秒） | 井边那片，绳子撤了 | The rope by the well is down |
| 187/188 [0] | 第 2 晚第一次送老周（recipientLine：老周不敲门的时候固定用第 0 句） | 终于来了，我等这封信等了整整一个冬天。……啊，是电费单。那也行，谢谢你。 | Finally. I've waited all winter for this. …Ah. The electric bill. Still, thank you. |
| 278/285 seed | 第 2 晚老周回完话之后再弹一句（451） | 老周：「明晚路过的话，敲两下门就行。……信有没有，不要紧。」 | Old Zhou: "Passing by tomorrow night? Just knock twice. …Letter or not, doesn't matter." |
| 187/188 [2] | 第 3 晚敲门 | 今晚不用给我信了，我就想有人敲敲门。……不过你要是有，也可以给我。 | No letter tonight, I just wanted a knock. …But if you've got one, I'll take it. |
| 278/285 knock | 敲门标签 | 敲门 | Knock |（全文搜不到引用，看起来没用上）
| 266 | 第 3 晚结束 | 第三晚的信送完了。<br>……窗台上的东西，明天再数。 | The third night's letters are out.<br>…I'll count the sills tomorrow. |
| 227 / nightProgress.js:15 | 老周的窗台纪念物 | 「泡了两杯，……另一杯是给信的。」 | "Made two cups. …One's for the letter." |
| 187/188 [1] | **永远不会出现**：老周只用第 0 和第 2 句 | 这次的信封是手写的……是我自己写的，上个月寄丢了。 | — |

## 问题和改法
### 1. 【最重要】敲门那句和前一晚的 seed 说的是同一个包袱（187 [2] 和 278）
seed 已经说过「信有没有，不要紧」，第二天敲门时又说「不用给我信……不过你要是有，也可以给我」，等于同一个反转连讲两晚。而且这一晚玩家确实是空手去敲门的，「你要是有也可以给我」跟画面对不上。
- 建议 ZH：`「你真敲了两下。……我在门后数着呢，你差点敲成三下。」`（23 字左右，算下来约 5.3 秒）
- 建议 EN：`"You actually knocked twice. …I was counting behind the door. You almost made it three."`
- 备选 ZH：`「门一响我就知道是你。……这条街就你敲门不用脚。」` / EN：`"I knew it was you the moment it knocked. …You're the only one here who doesn't use your foot."`
- 两版都不碰「两杯/信」（纪念物）和「电费单」。

### 2. seed 句没有反转，口吻也像在交代任务（278/285）
「敲两下门就行」读起来像派任务。后半句「信有没有，不要紧」只是补充，不是反转。另外前面已经有一句老周的话，seed 又带着「老周：」弹出来，像是两条消息。
- 建议 ZH：`老周：「明晚路过，敲两下门。……一下我以为是风，三下我以为是收电费的。」`（约 30 字，约 6.6 秒）
- 建议 EN：`Old Zhou: "Passing by tomorrow night? Knock twice. …Once is the wind. Three times is the electric company."`
- 这样能接上第 0 句的电费单，也给第 3 晚敲门那句埋了伏笔（「数着」「差点三下」）。

### 3. 第 3 晚结束那句是系统腔，而且邮差多开口了（266）
「第三晚的信送完了」是「完成任务」那种口气；英文「count the sills」意思有点歪（中文说的是数窗台上的东西）。
- 建议 ZH：`包空了。……窗台上多了几样东西，明天再数。`
- 建议 EN：`Bag's empty. …Something new on the sills. I'll count tomorrow.`
- 另外：451 行在 M>=3 时还会再弹一句「包空了。……明天的信，明天再说。」。第 3 晚两句都会出现的话，要合并成一句。英文「can wait for tomorrow」也比中文长，建议改成 `…Tomorrow's letters, tomorrow.`

### 4. 井边解锁提示：邮差在报系统事件（223）
「绳子撤了」是旁白式的通知；显示约 2.2 秒，9 个字读得完，但不像这个游戏的口吻。v2 说解锁这种事交给画面（彩带爆开已经有了）。
- 建议：删掉；要是怕玩家没注意，改成邮差的一句嘀咕：ZH `井边那根绳子……谁收走的？` / EN `The rope by the well… who took it down?`

### 5. 中英文 / 显示长度的小问题
- 188 [0] 英文 `Still, thank you.` 比中文「那也行，谢谢你」生硬，建议 `Fine. Thanks anyway.`
- 187 [1]（手写信，是自己寄丢的那封）现在不会出现，内容挺好，可以放到第 2 晚（第 0 句的电费单留给第 1 次出场，但老周第 1 晚并不出场）。建议第 2 晚直接用 [1] 或 [0] 二选一，没用上的那句删掉，免得以后有人误以为它在游戏里。
- 278 的 `knock:'敲门'` 没有被引用；如果打算拿它当门口标签，用「敲两下」/「Knock twice」，和 seed 呼应。
- 长度：所有句子都不超过 toastDur。最长的 [0] 句约 33 字，约 7.1 秒，读得完。
