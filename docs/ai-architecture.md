# Paper Echo · AI Agent 层架构

> 四段流水线（完整闭环）：**倾听 → 搜索 → 整合 → 回应**。本文档描述 `src/game/agent/pipeline/` 下的最小可运行骨架，
> 它与现有 `chains.ts` 提示词链**并行存在**，不改变任何现有运行时；目标是先跑通一套
> 结构优良、数据源可插拔、方便后续评测/调优的 Agent 底座。

## 1. 四段流水线（闭环）

```
玩家轨迹（拖拽情绪 / 故事表单 / 趣味题）
        │
        ▼
┌─────────────────────────────────────────┐
│ ① 倾听层  Profile（profile.ts）          │
│    Fingerprint[] ──► PlayerProfile        │
│    emotions: EmotionId[]                  │
│    story / persona: 占位字段（接 UI）     │
└─────────────────────────────────────────┘
        │ PlayerProfile
        ▼
┌─────────────────────────────────────────┐
│ ② 搜索层  PostSource（source.ts）        │
│    search(profile) ──► Post[]            │
│    LocalPosts / CrawlPosts / LiveSearch   │
└─────────────────────────────────────────┘
        │ Post[]
        ▼
┌─────────────────────────────────────────┐
│ ③ 整合层  Persona（persona.ts）          │
│    synthesize(posts, profile)            │
│    ──► EchoShadow（合成影子）             │
└─────────────────────────────────────────┘
        │ EchoShadow
        ▼
┌─────────────────────────────────────────┐
│ ④ 回应层  Respond（respond.ts）          │
│    respond(ctx) ──► TurnOutput.reply     │
│    从素材库取细节 + voice，开口回应       │
└─────────────────────────────────────────┘
        │ reply
        ▼
  现有 chains.ts / server.ts（运行时，不改动）
```

一句话：**Profile 合成画像 → PostSource 找一批帖子 → synthesize 整合成合成影子 → respond 开口回应**。
合成影子代表「跟你同频的那群人」，不绑定任何真人，名字抽象、声音融合、带素材库；对话时从其素材库取细节生成回应。

## 2. 数据契约

所有类型复用现有 `src/game/types.ts`，**不重复定义**。`EmotionId` 是 8 情绪联合类型，
`Fingerprint = { id: EmotionId; closeness: number }`。

### 2.1 PlayerProfile（倾听层，`pipeline/profile.ts`）

```ts
interface PlayerProfile {
  emotions: EmotionId[]; // 由 Fingerprint[] 提取，最稳定的结构化信号
  story: string;         // 故事表单产出（占位，来源 TODO）
  persona: string;       // 人格趣味题产出（占位，来源 TODO）
}
```

- `emotionsOf(fp: Fingerprint[])` 与 `tools.ts` / `kernel.ts` 同口径：`ownedOf(fp, 0.3)` 取贴近圆心的情绪。
- `story` / `persona` 本阶段只留字段与注释，UI 与 store 接入见「待办」。

### 2.2 Post / PostSource（搜索层，`pipeline/source.ts`）

```ts
interface Post {
  platform: string;      // 来源平台：archive / xiaohongshu / douban …
  content: string;       // 帖子正文
  emotion: EmotionId[];  // 情绪标签
  situation: string;     // 一句话情境摘要
}

interface PostSource {
  id: string;
  search(profile: PlayerProfile): Promise<Post[]>;
}
```

搜索层不再「挑一条」：`PostSource.search` 产出的是**一批同频帖子**，直接交给整合层 `synthesize`
整合成合成影子（见 2.3）。

### 2.3 EchoShadow（整合层，`pipeline/persona.ts`）

```ts
interface EchoShadow {
  handle: string;      // 抽象化名，不指向任何真人（从情绪派生的代称）
  voice: string;       // 统一的说话方式描述（从一批帖子的语言风格提炼）
  materials: Post[];   // 素材库：去重后的一批帖子细节，供对话生成时取用
}
```

`synthesize(posts, profile)` 把**一批帖子整合成一个合成影子**，代表「跟你同频的那群人」，
**不绑定任何具体真人**——名字抽象、身份合成：

| EchoShadow 字段 | 来源 |
| --- | --- |
| `handle` | `deriveHandle(profile.emotions)`——由情绪标签派生「跟你一样 XX 的人」类代称，**不用 `Story.name` 或城市当身份** |
| `voice` | `deriveVoice(posts)`——启发式提炼语言共性（第一人称、短句、具体物件、不说教），TODO：未来用 LLM 融合 |
| `materials` | `selectMaterials(posts, profile)`——按 `Post.emotion` 与 `profile.emotions` 重叠数降序、去重、取 top 5（不足全取） |

空帖子时返回明确的「空影子」占位：`handle` 仍有、`materials` 为空、`voice` 为占位说明。
`EchoPerson`（`types.ts`）仍由现有 `chains.ts` 运行时使用，本流水线不再产出它。

### 2.4 TurnContext / TurnOutput（回应层，`pipeline/respond.ts`）

```ts
interface TurnContext {
  shadow: EchoShadow;                 // 整合层产出的合成影子（含素材库与 voice）
  userLine: string;                   // 玩家这句话
  history?: { who: "you" | "echo"; text: string }[]; // 对话历史（骨架阶段可选）
}

interface TurnOutput {
  reply: string;                      // 回应文本
}
```

`respond(ctx)` 是对话循环的最小入口：从 `shadow.materials` 挑一条与 `userLine` 最相关的素材
（情绪重叠 + 关键词命中，取不到就取第一条），结合 `shadow.voice`，拼一句「我也有过类似的 + 素材具体细节」；
`materials` 为空则给占位回应。当前是确定性/人肉启发式，未来换成 LLM 生成（见「待办」）。

`runPipeline` 的返回也相应扩展为 `PipelineResult = { shadow: EchoShadow; reply: TurnOutput }`，
把「倾听 → 搜索 → 整合 → 回应」串成完整闭环。

## 3. PostSource 可插拔

三个源都实现同一个 `PostSource` 接口，换语料只换源，不动 Profile / Persona：

| 源 | 文件 | 状态 | 说明 |
| --- | --- | --- | --- |
| `localPosts` | `sources/local.ts` | ✅ 可跑 | 12 张 Story 卡转 Post，确定性兜底，先跑通它 |
| `crawlPosts` | `sources/crawl.ts` | 🚧 占位 | 读 MediaCrawler 预爬 JSONL，调用抛 `not implemented` |
| `liveSearchSource` | `sources/live.ts` | 🚧 占位 | AnySearch / Firecrawl 现搜，返回 `[]` |

切换方式：

```ts
import {
  runPipeline, makeProfile, emotionsOf,
  localPosts, crawlPosts, liveSearchSource, sourceFor,
} from "@/game/agent/pipeline";

const profile = makeProfile(emotionsOf(fp));

// 默认：LocalPosts 兜底，四段闭环（含回应）
const { shadow, reply } = await runPipeline(profile);

// 显式组合：多个源并联，单个源失败不阻断
const result = await runPipeline(profile, [crawlPosts, liveSearchSource, localPosts]);

// 按字符串 id 取源（供评测/配置）
const src = sourceFor("local");
```

`runPipeline` 已做容错：占位的 `crawlPosts` 抛错会被捕获并跳过，最终由 `localPosts` 兜底。

## 4. 与现有 chains.ts 的关系与迁移路径

- **现在（并行）**：`chains.ts` 仍是游戏唯一运行时，`pipeline/` 是独立的、被游戏代码**零引用**的新底座。
  两者共用 `EmotionId / Story / EchoPerson / Fingerprint` 与 `emotions.ts / stories.ts` 里的纯函数，
  互不侵入。
- **映射关系**：现有 `match` 链里的 `fallbackEcho(fp, region)`（`storyToEcho(matchStory(...))`）≈
  新流水线的 `runPipeline(makeProfile(emotionsOf(fp)))`（`localPosts → synthesize → EchoShadow`）。
  前者已可产 `EchoPerson`；后者把「选故事」抽象成「整合一批帖子为合成影子」，为真实语料留出接口。
- **未来（逐步替换）**：
  1. 搜索层先切：`search_cases` 工具目前直接排 `STORIES`，可改为读 `pipeline` 的 `PostSource`，
     `CrawlPosts` / `LiveSearch` 一旦接入即生效。
  2. 倾听层再切：`makeRuntime` 里 `perceptionOf(...)` 的输入可换成 `PlayerProfile`，story/persona 补上后
     画像更完整。
  3. 回应层最后切：`synthesize` 产出 `EchoShadow`、`respond` 从 `materials` 素材库取细节生成回应，
     作为 `runMatchChain` 的 `input.echo` 起点。
  4. 记忆层（`memory.ts`）保持不变，仍由现有 `remember` / `search_archive` 使用。

## 5. Penguin 回声 Agent 映射

| 四段流水线 | Penguin 回声 Agent 职责 | 对应现有实现 |
| --- | --- | --- |
| 倾听 Profile | 把玩家结构化痕迹合成画像 | `perceptionOf` + `ownedOf`（memory.ts / emotions.ts） |
| 搜索 Source | 从世界语料里找「相似的人」 | `search_cases` / `search_archive`（tools.ts） |
| 整合 Persona | 把一批帖子整合成「合成影子」 | `arrive` + greeting 生成（chains.ts） |
| 回应 Respond | 从素材库取细节、遵守 voice，开口回应 | `runMatchChain` 的 `input.echo` 起点（chains.ts） |
| 记忆 Memory | 跨夜记住玩家的事 | `memory.ts`（本阶段不动） |

## 6. MediaCrawler 语料库接入步骤

> ⚠️ 合规提醒：**仅限学习研究使用**；只采集**公开内容**，输出前**脱敏**
> （去除姓名、头像、账号 ID、联系方式、可定位的地理细节）。不用于商业分发，不采集私密/受限内容。

1. 用 MediaCrawler 预爬目标平台（小红书 / 豆瓣 / 微博等），导出 **JSONL**（一行一条），
   每行符合 `CrawlCorpusRecord`：
   ```json
   {"platform":"xiaohongshu","content":"我改了十七稿方案，群里只回了一句收到。","emotion":["unseen","tired"],"situation":"深夜加班，被已读不回"}
   ```
2. 文件放到约定目录（如 `paper-echo/corpus/posts.jsonl`）。
3. 在 `crawlPostsFromPath(path)` 的 `search` 里实现：读文件 → 按 `profile.emotions` 粗筛
   （标签命中 / Jaccard 文本相似）→ 映射成 `Post[]`；文件较大时加进程内缓存。
4. 把源加入流水线：`runPipeline(profile, [crawlPosts, localPosts])`。
5. 评测：用固定 `profile` 跑 `synthesize` 的结果做离线打分，比较 LocalPosts / CrawlPosts 的素材库质量。

## 7. 对话质量规范（回应层 prompt 规范）

未来 LLM 生成 `respond` 时的 prompt 规范，与 `pipeline/respond.ts` 头部注释保持一致：

**声音**
1. 写「事」，不写「状态」——有具体的时间/地点/动作/物件，不堆情绪形容词。
2. 不碎——一两句自然流动，不逐条崩成短标签。
3. 零剧场腔——不写诗、不写金句。

**质量**
1. 说一件自己的具体事，别贴情绪标签。
2. 先接住，再用平行的事回，不替对方下结论。
3. 共情落在「我也有过」，不是「你好可怜」。
4. 像聊天，不总结、不说完，留个口子。
5. 不端咨询腔、不金句、不 AI 万能句。

**软引导**
- S1 先听懂底层情绪（内部步骤，标签不出口）。
- S2 用平行经历接。
- S5 留钩子（钩子长在自己身上，不问对方）。

> 注明：已删除「只说自己 / 不安慰」这条铁律，允许适度共情，但守住上面 5 条质量线。

## 8. 待办 / 优化清单

- [ ] 接 store：情绪拖拽完成后由 store 调 `fingerprintOf` → `emotionsOf` 填 `PlayerProfile.emotions`。
- [ ] 故事表单（`PlayerProfile.story`）与人格趣味题（`PlayerProfile.persona`）的 UI 与取值。
- [ ] 实现 `crawlPostsFromPath` 的文件读取、缓存与过滤。
- [ ] 实现 `liveSearch` 的 AnySearch / Firecrawl 检索与情绪标注。
- [ ] **LLM 融合 `synthesize`（现在是人肉启发式）**：用 LLM 把一批帖子的语言风格融合成统一的 `voice`。
- [ ] **LLM 生成 `respond`（现在是人肉启发式）**：遵守 `voice` 与对话质量规范，从素材库取具体细节生成回应；回应层骨架已落地（`respond` / `TurnContext` / `TurnOutput`）。
- [ ] 把 `search_cases` 工具切换到 `PostSource`，接入真实语料。
- [ ] 离线评测：固定 profile 集 + 标注帖集，量化三个源的素材库质量与可复现性。
- [ ] 记忆层与流水线的衔接（当前沿用 `memory.ts`，暂不改动）。

## 附：文件清单

| 文件 | 职责 |
| --- | --- |
| `pipeline/profile.ts` | `PlayerProfile` 类型 + `emotionsOf` 提取入口 |
| `pipeline/source.ts` | `Post` / `PostSource` 契约 |
| `pipeline/sources/local.ts` | LocalPosts 默认兜底源 |
| `pipeline/sources/crawl.ts` | CrawlPosts 占位源（JSONL schema + 接入 TODO） |
| `pipeline/sources/live.ts` | LiveSearch 占位源（签名 + TODO） |
| `pipeline/persona.ts` | `EchoShadow` + `synthesize`（一批帖子→合成影子） |
| `pipeline/respond.ts` | `TurnContext`/`TurnOutput` + `respond`（从素材库取细节开口回应） |
| `pipeline/index.ts` | 统一导出 + `runPipeline`（四段闭环）/ `sourceFor` |
