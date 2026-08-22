# 「纸上的回声」社媒→故事 内容流水线设计报告

> 前置上下文：`types.ts`（Story 字段）、`stories.ts`（12 条手写 Story）、`agent/tools.ts`（search_cases 确定性排序）、`agent/chains.ts`（RULES + validate 闸门）、`agent/memory.ts`（jaccard/ownLine/stolenVoice/foreignPlace）、`config.ts`（LLM = AI PING，DeepSeek-V4-Flash-0731）。
> 采集只在 P0 预采集阶段联网；运行时安全垫 = 固化本地文件，现场零网络。

## A. 平台选型

| 平台 | 采集合法性/ToS | 反爬 | 情感浓度 | 综合 |
|---|---|---|---|---|
| 豆瓣日记/小事 | 无官方 API；ToS 禁自动化 | 中 | 极高（深夜长自述） | ★5/5 主 pick |
| X/Twitter | 官方 API 付费 | 高 | 中 | 补充（合法但费钱） |
| Reddit | API 付费；历史 dump 公开 | 高 | 中高（英文） | 补充 |
| 即刻 | 无 API；需逆向 | 高 | 中高 | 不优先 |
| 知乎 | 无 API；需登录 | 高 | 中（回答腔） | 次级 |
| 微博 | 无 API；签名强 | 极高 | 高 | 次级 |
| 小红书 | 无 API；风控业界顶配 | 极高 | 极高 | **弃**（性价比倒挂） |
| Lofter/简书 | 无 API | 低 | 中高 | 兜底池 |

**Pick**：豆瓣为 P0 主源（情感浓度最高 + 反爬中弱 + 中文零损耗 + 长自述给改写最大自由）；X/Reddit 官方付费 API 作「合法但费钱」备选；微博次级；**小红书明确放弃**。

## B. 流水线架构（确定性夹住 LLM）

```
crawl.ts（采集，只存 URL+正文，不存账号）
  → dedupe.ts（jaccard ≥0.55 去重）
  → clean.ts（去标签/去联系方式/30~400 字长窗/情绪词典预筛）
  → rewrite.ts（唯一 LLM 环节：匿名化改写）
  → validate.ts（确定性 QA，见 C）
  → ingest 生成 playwright 编译进 src/game/collect.ts（运行时零网络零 IO）
```

切分原则：采集/去重/清洗/QA/入库全部确定性代码（可测可回放可审计）；**LLM 只做「人格化匿名改写」这一件需要创造力的活**，复刻 chains.ts「确定性夹住 LLM」哲学。

P1 常驻化 = 上述管线包成 daemon 循环 + LLM 日配额 + JSONL 断点恢复。

## C. 匿名化改写 Prompt + 去识别 QA

System = 游戏 RULES 风格铁律（夜深普通人口吻/不安慰/禁词表/像微信/不说教）＋「吸收原帖情绪氛围、彻底改写、不得保留长句」。

User = 一段原文 → 输出 Story JSON（name/city/region/feels/opening/lines/returnLetter），匿名铁律：不含原帖任何真名/城市/账号/公司全称/街道/手机号/@/链接；不得连续复用原文 8 字以上片段。

去识别 QA（确定性闸门，任一失败即丢弃）：
1. jaccard(改写稿, 原帖) ≥ 0.55 → 改写不够 → 弃
2. 原文 8 字以上子串残留 → 弃
3. 原帖人名/昵称/@ 残留 → 弃
4. 原帖城市/公司/地名残留 → 弃
5. 手机号/邮箱/链接正则命中 → 弃
6. 与 12 手写 Story parroted 撞车 → 弃
7. 与采集池已有条目 jaccard ≥ 0.48 → 弃

> 完整 prompt 草稿见子代理原始报告（已返回父代理）。

## D. 接口对接

- 新增 `src/game/collect.ts` 导出 `COLLECTED: Story[]`，与 STORIES 同构；Story 增加可选 `source` 字段（向后兼容）。
- `matchStories`：核心池优先必达，扩展池补位（质量锚 = 12 手写）。
- `search_cases`：采集池加权重衰减（×0.9 或文本命中 +0.5），防低质稿刷权。
- 入库格式：生成期 JSONL → 编译进 `collect.ts` → 运行时零网络零 IO；localStorage 保持玩家 MemoryRecord 专用，不混。

## E. Pre-warm 计划

- 目标：60~120 条合格 Story；约 100 条采集池即可覆盖 8 情绪 × 6 区域。
- 成本：~1.2k token/条改写 × 500 次候选 ≈ 0.6M token，DeepSeek 价尘埃级。
- 工期：一轮全量 20~60 分钟（4~8 并发）；建议跨 2~3 天（跑一轮 → 看筛出率 → 调阈值重跑 → 人工抽查反泄露）。
- 上演示机断言：≥60 条合格 + 24h 前人工验 3~5 条反泄露。

## F. 风险预案

| 风险 | 预案 |
|---|---|
| 平台封禁 | 只抓公开页 + 限速（随机 sleep 5~15s）+ 单 IP 节流；封了换源；采集与运行时完全分离 |
| 改写失败率高 | 失败样本 dump 进 corpus/rejected.jsonl 人眼复盘；调 prompt 不调运行时 |
| 质量失控 | 核心池必达 100%；采集稿只借情绪与场景；5% 人工抽检；宁缺毋滥 |
| 评委追问「素材哪来的」 | 口径三连：①只抓公开内容；②原文绝不入库不进游戏；③改写 = 真语义改写 + 去识别门可现场展示拦截样例 |
| 现场断网 | 扩展池已编译进构建产物，零网络完整可跑 |

## G. 路线图

| 阶段 | 目标 | 最小可交付 |
|---|---|---|
| P0 演示安全垫 | 赛前 60~120 条合格 Story 编译进运行时 | scripts/collect/ 一条命令（抓→洗→改写→QA→生成 collect.ts）+ search_cases 衰减 |
| P1 常驻采集器 | 后台守护循环合入合格稿 | daemon + 日配额 + 断点恢复 + 拦截监控 |
| P2 玩家 UGC | 玩家授权内容脱敏入池 | 复用 P0 全套 QA 闸门 + 可回滚 |

## 待赛前 web_search 复核的实时事实

- X/Twitter API 价格与免费层、v2 授权口径
- Reddit API 价格、免费层、公开 dump 现状
- 豆瓣/微博/小红书最新采集封禁口径与判例