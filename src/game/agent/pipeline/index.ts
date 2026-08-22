/**
 * Paper Echo — 流水线 · 入口
 *
 * 「倾听 → 搜索 → 整合 → 回应」四段的最小可运行闭环：
 *
 *   Profile（profile.ts）      —— 合成玩家画像
 *   PostSource（source.ts）    —— 可插拔数据源，产出 Post[]
 *   synthesize（persona.ts）   —— 把一批 Post 整合成 EchoShadow（合成影子）
 *   respond（respond.ts）      —— 对话循环：从素材库取细节开口回应
 *
 * 游戏运行时：match 的 research 经 `formatCaseHits` 读 LocalPosts
 *（手写 12 张 + COLLECTED 预采集改写稿）→ synthesize。crawl / live 仍占位。
 */
import { synthesize } from "./persona";
import type { EchoShadow } from "./persona";
import { emotionsOf, makeProfile, type PlayerProfile } from "./profile";
import { respond } from "./respond";
import type { TurnOutput } from "./respond";
import type { Post, PostSource } from "./source";
import { crawlPosts, crawlPostsFromPath, type CrawlCorpusRecord } from "./sources/crawl";
import { liveSearch, liveSearchSource, type LiveProvider } from "./sources/live";
import { archiveStories, localPosts, storyToPost, summarize } from "./sources/local";

// 类型契约
export type { PlayerProfile } from "./profile";
export type { Post, PostSource } from "./source";
export type { CrawlCorpusRecord } from "./sources/crawl";
export type { LiveProvider } from "./sources/live";
export type { EchoShadow } from "./persona";
export type { TurnContext, TurnOutput } from "./respond";

// 倾听层
export { emotionsOf, makeProfile };

// 搜索层
export { localPosts, storyToPost, summarize, archiveStories };
export { crawlPosts, crawlPostsFromPath };
export { liveSearch, liveSearchSource };

// 整合层（合成影子）
export { synthesize };

// 回应层（对话循环）
export { respond };

/** 默认数据源列表：先跑通 LocalPosts，其余按需插拔。 */
export const DEFAULT_SOURCES: PostSource[] = [localPosts];

/** 按 id 取源，便于评测/配置里用字符串切换。 */
export function sourceFor(id: string): PostSource | undefined {
  return [localPosts, crawlPosts, liveSearchSource].find((s) => s.id === id);
}

/** 四段闭环的完整产物：合成影子 + 回应层开口的那句话。 */
export interface PipelineResult {
  shadow: EchoShadow;
  reply: TurnOutput;
}

/** 闭环演示用的一句示例玩家话（回应层骨架输入）。 */
export const SAMPLE_USER_LINE = "我改到很晚，群里只回了收到。";

/**
 * 四段流水线的串起入口（最小可运行闭环）：
 * Profile（倾听）→ 各源取帖子（搜索）→ synthesize 合成影子（整合）→ respond 开口回应（回应）。
 * 单个源失败（如占位的 CrawlPosts 抛错）不阻断整条链，继续尝试其余源；
 * 最终返回合成影子与一句回应，演示「倾听 → 搜索 → 整合 → 回应」跑通。
 * 记忆层仍留后续 TODO，本骨架不实现。
 */
export async function runPipeline(
  profile: PlayerProfile,
  sources: PostSource[] = DEFAULT_SOURCES,
  userLine: string = SAMPLE_USER_LINE,
): Promise<PipelineResult> {
  const posts: Post[] = [];
  for (const source of sources) {
    try {
      posts.push(...(await source.search(profile)));
    } catch {
      // 占位源（crawl）会 throw "not implemented"；失败即跳过，由其它源兜底。
    }
  }
  const shadow = synthesize(posts, profile);
  const reply = respond({ shadow, userLine });
  return { shadow, reply };
}
