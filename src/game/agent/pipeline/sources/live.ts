/**
 * Paper Echo — 数据源 · LiveSearch（占位实现）
 *
 * AnySearch / Firecrawl 现搜。本阶段只给函数签名与 TODO，不真调网络。
 * 接入后可在运行时按玩家画像实时检索公开帖子。
 */
import type { PlayerProfile } from "../profile";
import type { Post, PostSource } from "../source";

export type LiveProvider = "anysearch" | "firecrawl";

/**
 * 构造一个实时搜索源。
 *
 * TODO(接入步骤)：
 * 1. 按 `profile.emotions` / `profile.story` 拼查询词（情绪标签 + 情境关键词）。
 * 2. provider === "anysearch"：走 AnySearch API（`ANYSEARCH_API_KEY`）。
 *    provider === "firecrawl"：走 Firecrawl API（`FIRECRAWL_API_KEY`），
 *    用 search 或 scrape 抓公开页面转 markdown。
 * 3. 对结果做情绪标注（标签命中或小模型分类）→ 映射成 `Post[]`。
 * 4. 网络失败时返回 []（让上层走 LocalPosts 兜底），不要抛错。
 * 合规：仅学习研究使用，只取公开内容，输出前脱敏。
 */
export function liveSearch(opts: { provider: LiveProvider; query?: string }): PostSource {
  return {
    id: `live:${opts.provider}`,
    async search(_profile: PlayerProfile): Promise<Post[]> {
      // TODO: 现搜 + 标注 + 映射，见上方接入步骤。占位阶段返回空。
      return [];
    },
  };
}

/** 默认的实时搜索源（AnySearch）。 */
export const liveSearchSource: PostSource = liveSearch({ provider: "anysearch" });
