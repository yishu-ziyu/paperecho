# 夜晚对白节奏调研：Paper Echo 第二夜（KNOWN-ISSUES #40）

日期：2026-10-16

## 1. 问题

第二夜约 13 秒内出现约 6 行字幕。字幕之间没有安静走路的时间。试玩者感到疲劳。
队友提出规则：行间至少 3 秒；老周每夜最多说一次；收信人回信优先；提示行被丢弃。

## 2. 来源与事实（均已打开原文核对）

| # | 来源 | URL | 该来源支持的具体说法 |
|---|---|---|---|
| S1 | Elan Ruskin（Valve），GDC 2012 讲稿 PDF | https://cdn.akamai.steamstatic.com/apps/valve/2012/GDC2012_Ruskin_Elan_DynamicDialog.pdf | 每个角色"每隔几秒"检查一次自己是否有闲聊台词要说（TalkIdle）。规则命中后写入"本句已说过"和"Nick 正在说话"两个事实；第二个事实带过期时间（示例为 now + 3.088 秒），用来阻止同一段梗的两句播得太近。危险出现时，后续回复的条件不再成立，对话自动终止。长独白应切成短句，便于中途退出。 |
| S2 | Chris Remo（Campo Santo），GDC 讲座 "Interactive Story Without Challenge Mechanics: The Design of Firewatch"（字幕稿） | https://gameindustrylibrary.com/documents/interactive-story-without-challenge-mechanics-the-design-of-firewatch | 团队把长对话放在任务点之间的赶路时间里。若玩家 54 秒能走到补给箱，主线必需部分的对话就控制在 54 秒以内，以减少重叠和原地等待。团队常为此重写对话。 |
| S3 | Armstrong & Ewing，GDC "Do You Copy? Dialog System and Tools in Firewatch" 简介 | https://www.gdcvault.com/play/1024000/Do-You-Copy-Dialog-System | 系统起初是"大量打断的 bark 系统"，最后发布的是"较长、可重新开始的对话"。玩家可以随时打断。 |
| S4 | Sean Krankel（Night School），GDC 2017 Oxenfree 讲座报道 | https://www.thumbsticks.com/gdc-17-creating-narrative-gameplay-oxenfree/ | 主角 Alex 只在玩家选择时说话；玩家不说话时 NPC 接着说。对话气泡放在角色旁边，目的是让玩家不必移开视线去看底部字幕。 |
| S5 | Netflix 简体中文字幕规范 | https://partnerhelp.netflixstudios.com/hc/en-us/articles/215986007-Chinese-Simplified-Timed-Text-Style-Guide | 成人内容阅读速度上限 9 字/秒，儿童 7 字/秒；特殊情况可放宽到 11 字/秒和 9 字/秒。每行上限 16 字（可放宽到 18 字）。 |
| S6 | Netflix 帮助中心：阅读速度的计算 | https://partnerhelp.netflixstudios.com/hc/en-us/articles/115001352212-How-is-reading-speed-measured-Do-punctuation-and-spaces-count | 标点计入字数；半角标点和拉丁字母按 0.5 字计。 |
| S7 | BBC 字幕规范（2026 年 3 月版） | https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/ | 两段话之间若有停顿，字幕之间可以留空白，空白至少 1 秒，最好 1.5 秒；更短的空白会显得跳动。画面信息多时，要给观众时间同时读字和看画面。笑点之后应留出无字幕的画面。 |
| S8 | Game Accessibility Guidelines："为所有重要语音提供字幕" | https://gameaccessibilityguidelines.com/provide-subtitles-for-all-important-speech/ | 重要语音（主角台词、指示、提示）必须有字幕。游戏玩家比其他媒体用户更依赖字幕。 |

说明：X 公开搜索（关键词 barks/dialogue/cooldown）返回 0 条结果。小红书没有可用的检索途径。所以本报告不含社区讨论。Journey、A Short Hike、Kentucky Route Zero、Edith Finch、The Last of Us 本次没有找到含具体数字的开发者原话，因此没有列入。

## 3. 关键数字汇总（事实）

- 阅读速度：中文成人 9 字/秒，上限 11 字/秒（S5）。
- 字幕之间的空白：至少 1 秒，建议 1.5 秒（S7）。
- 同一角色两句之间的冷却：Valve 示例约 3 秒，用带过期时间的事实实现（S1）。
- 对话总长不超过赶路时间：Firewatch 示例 54 秒（S2）。
- 中断规则：条件失效即终止，不需要专门的打断机制（S1）；玩家可随时打断（S3）。
- 没有找到任何来源给出"每分钟最多几行"的数字。

## 4. 推断（不是来源原话）

1. 13 秒 6 行，平均每行约 2.2 秒。若每行 10 字，阅读需要约 1.1 秒（按 9 字/秒）。所以单行可读，问题在于行与行之间没有空白，也没有"走路看景"的时间。BBC 的 1.5 秒是电视标准；玩家边走边读，要分心看路，空白应更长。
2. Valve 的 3 秒是"同一角色、同一段梗"的冷却，不是全局行间距。Firewatch 的做法是按空间（赶路时长）分配对话，而不是按条数。
3. 队友的规则修复了密度，但"提示行直接丢弃"有风险：S8 把指示和提示列为重要语音。提示应延后，不应删除。

## 5. 推荐规则（第二夜）

| 编号 | 规则 | 数值 | 依据 |
|---|---|---|---|
| R1 | 每行显示时长 = max(1.5 秒, 字数 ÷ 7 + 0.5 秒) | 例：12 字 → 约 2.2 秒 | S5 的 9 字/秒，扣除走路分心后取 7 字/秒（推断） |
| R2 | 同一段对话内，行与行之间留空白 | 至少 1.5 秒 | S7 |
| R3 | 一段对话结束后，下一段开始前留"安静段" | 至少 8 秒，或玩家走完一个地标（取较晚者） | S2 的"对话装进赶路时间"；8 秒是推断值，需试玩校准 |
| R4 | 优先级：收信人回信 > 必要提示 > 老周 > 环境闲话 | 高优先级可在空白期插入；不打断正在显示的行 | S1 的条件匹配与按情境终止 |
| R5 | 低优先级行被挤掉时：提示行排队延后，过期（离开相关地点）才丢弃；环境闲话可以直接丢弃 | 提示最长等待 20 秒 | S8；20 秒为推断值 |
| R6 | 老周每夜最多一次主动说话；同一角色两句冷却 | 冷却 ≥ 30 秒 | S1 的角色冷却思路；30 秒为推断值 |
| R7 | 每段对话最多 3 行；更长的内容切成多段，放在不同路段 | 3 行 | S1"长独白切短句"；S2 |

用这套规则重排第二夜：原来 6 行会分成 2 段（各 2–3 行），中间隔一段安静走路。总时长约 13 秒 → 约 25–30 秒，其中有约 8 秒无字幕。

### 与队友规则对比

| 项目 | 队友规则 | 推荐规则 | 差别原因 |
|---|---|---|---|
| 行间距 | 固定 3 秒 | 段内 1.5 秒，段间 ≥ 8 秒 | 一段对话内 3 秒会拖慢回信的节奏；疲劳主要来自段与段之间没有安静时间 |
| 老周 | 每夜最多一次 | 相同，另加 30 秒角色冷却 | 一致 |
| 优先级 | 回信优先 | 相同，并写明四级顺序 | 一致，更完整 |
| 提示行 | 丢弃 | 排队延后，过期才丢 | 提示属于重要信息（S8） |
| 每行时长 | 没有规定 | 按字数计算 | 防止长句读不完（S5） |

## 6. 给新手设计师的关键判断

1. 疲劳来自没有空白，不来自单行太长。先排"安静段"，再排台词。
2. 把对话按路程分配。先量出玩家走某段路要几秒，再决定这段路放几行（Firewatch 的 54 秒做法）。
3. 冷却与优先级要写进数据。给每个角色和每类台词设冷却时间和优先级，让系统决定播放还是延后；不要靠手工调时间点（Valve 的做法）。

## 7. 图片

- `valve-ruskin-gdc2012-slide69-expiration.png`：Valve GDC 2012 讲稿第 69 页。图中 `talking` 事实设为 now + 3.088 秒，用来阻止同一角色的两句台词播得太近。来源 S1。
