# Paper Echo 文案审查（按 VOICE.md v2）
范围：repro/play/game.js（读的是 03:16 的快照，sun 还在改，行号可能有偏移）、nightProgress.js、daynight.js（没有玩家可见文字）、index.html、copy/recipients-draft.md。所有文件都没动。

## P0：前 10 条
| 位置 | 当前 ZH | 当前 EN | 建议 ZH | 建议 EN | 原因 |
|---|---|---|---|---|---|
| game.js:366 | 今晚的信送完了。……按 N 明晚再来。 | Tonight's letters are done. …Press N: come back tomorrow night. | 包空了。……（N）睡觉去 | Bag's empty. …(N) bedtime | 系统腔（「送完了」≈完成任务，「按 N」像操作说明）；「……」后面没有反转，浪费了这个格式；和 nightEnd 的 'end' 是同一个意思，等于说两遍。操作键放进括号里当小提示就行 |
| game.js:202/239 | ★ 今晚送了 N/3 | ★ Delivered tonight N/3 | ★ 送了 N/3 | ★ Sent N/3 | 白天也显示「今晚」，跟时间对不上；后面已经有「第 N 晚」，不用再写 |
| game.js:204 (dusk) | 天黑得好快，路灯一盏一盏亮起来了。 | It got dark so fast. The street lamps are coming on, one by one. | （删掉，靠画面）或：天黑了。 | （删掉）或：Dark already. | v2 规定邮差只在开场、迷路、一晚结束三处开口；路灯亮起本身就是画面 |
| game.js:204 (night2) | 昨天那户的窗台上……好像多了点什么。 | Yesterday's house… something new on the sill? | 删掉，由 keepsake toast 负责 | 删掉 | 跟 nightProgress 的 keepsake 文案重复，而且是邮差额外开口 |
| nightProgress.js:10-13 | 桌上多了一只纸船……看着有点眼熟。 等 | A paper boat on the table 等 | 改成收信人留的话，例：船：「借你家窗台晾一晚。」（阿汀）；花：「它叫春生。……也可能叫秋生。」；杯：「泡了两杯，……另一杯是给信的。」（老周）；星：「第三百一十二颗。」（小满） | "Drying it on your sill tonight." / "This is Spring. …Or Autumn." / "Made two cups. …One's for the letter." / "Number 312." | 现在是邮差旁白，违反 v2；EN 只是物品清单，没有口吻，长度也只有 ZH 的一半；跟收信人的执念接上，回头看就有回报 |
| game.js:233-234 CRANE_LINES | 5 句邮差独白 | 同 | 减到 2 句：第 1 只「……谁把纸鹤夹树上了。」，第 5 只「尾巴上写着我的名字。……啊？」；其余只出现 ✦ n/5 的 pop | 只留 "…who put a crane in a tree?" / "My name's on its tail. …Huh?" | 邮差话太多；第 5 只是个钩子，留着 |
| game.js:205-207 recv 池 | 「谢谢你跑这一趟。……其实我就在窗口看着你绕了三圈。」 | "Thanks for coming all this way…" | 「信你放门口就行。……我刚才看你绕了三圈。」 | "Just leave it by the door. …I watched you circle three times." | 「谢谢你跑这一趟」是 v1 示范原句，又跟老周第 1 晚的「谢谢你」重复，几户人听起来像同一个人 |
| game.js:207 recv | 「你看，邮戳是十年前的。……邮局也挺能睡的。」 | "…The post office really likes to nap." | 保留，但别在老周那户出（老周的执念就是等信） | "…The post office overslept." | 跟老周撞题材；EN 改短 |
| game.js:228 豆豆 n1 | 「亲爱的」后面要空两格吗？ | Two spaces after "Dear"? | 不变 | My first letter ever. Comma after "Dear"? …I'll leave it blank till I know who. | 「空两格」是中文排版习惯，英文读者没这个概念；EN 太长 |
| recipients-draft.md:27/34/35 vs game.js:224/226 | 阿汀 n3、米婆婆 n2/n3 | 稿子和游戏里的 EN 对不上（稿子里米婆婆 n2 EN 写的是 Zhou/邻居家的狗，跟 ZH 不一致） | 以 game.js 为准，改回稿子 | 阿汀 n3 EN 补上前半句：Did that upside-down one really float to you? I'm keeping this one. …Mostly 'cause it's raining. | 不同步的话后面一定会错；阿汀 n3 EN 漏了 ZH 前半句 |

## P1
| 位置 | 当前 ZH | 当前 EN | 建议 ZH | 建议 EN | 原因 |
|---|---|---|---|---|---|
| game.js:237 toast | 3.2 秒 | 同 | 按字数算：1.5s + 0.12s×字（ZH）/ 0.05s×字符（EN） | 同 | 收信人台词 35-45 字，3.2 秒只够读前半句，读不到反转 |
| game.js:196 finale | 第 N 晚结束了。送了 X 封信，找到 x/5 只纸鹤。<br>……明天的信，明天再说。 | … | 包空了，纸鹤 x/5。<br>……明天的信，明天再说。 | Bag's empty. Cranes x/5.<br>…Tomorrow's letters, tomorrow. | 前半句像结算报表；后半句不错，保留 |
| game.js:208 full/none | 包满了…… / ……手上没信。 | Bag full… / …no letter on me. | 不变 | Bag's full… / …no letters on me. | EN 语法小修 |
| game.js:209 carry | 包里的信 | Letters | 不变 | In bag | 与 ZH 对齐，长度相近 |
| game.js:220 小满 n2 | …… | Found last night's missing three, behind a cloud. | 不变 | Found last night's missing three behind a cloud. …Thicker cloud tonight. Oh well. | 去掉多余逗号，EN 收短 |
| game.js:222 老周 n3(3b) | 今晚不用给我信了…… | 同 | 不变 | No letter tonight, I just wanted a knock. …But if you've got one, I'll take it. | EN 比 ZH 长不少，超出长度预算 |
| game.js:226 米婆婆 n3 EN | …that one I'll remember. | | | …It's called Postman. Just named it. That one I'll remember. | 读起来更顺 |
| game.js:205 recv | 「又是账单吗……哦，是情书。那还是账单吧。」 | I'd rather have the bill. | 不变 | Another bill… oh, a love letter. Make it the bill. | EN 更利落 |
| index.html:7 #toast | max-width:70% | | 加上 line-height:1.4 | | 两行 ZH 挤在一起；EN 在 1280 宽下约折 2-3 行，能放下 |
| game.js:309 标签 | 送这儿？ · 12m / 她家 | Here? / her house | 不变 | Here? / Her place | 首字母大写；white-space:nowrap 下 EN 长度没问题 |

## 第一次玩的感受
我最先失去兴趣的地方是**第 1 晚送完第 3 封信后的「今晚的信送完了。……按 N 明晚再来。」**（game.js:366）。在这之前，每户人家的反转都让我想接着看下一户。到这一句，语气一下变成系统通知，「……」后面也没有包袱，紧接着又出一句「包空了」，说的是同一件事，节奏就散了。另外，台词 3.2 秒就消失，前几户的反转我经常没读完，这是第二个流失点。
