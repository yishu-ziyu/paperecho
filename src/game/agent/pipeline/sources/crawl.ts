/**
 * Paper Echo — 数据源 · CrawlPosts（占位实现）
 *
 * 读 MediaCrawler 预爬的 JSON 语料库。本阶段只定义期望 schema 与接入步骤，
 * 不真读文件、不真检索。接入后与 LocalPosts 一样满足 `PostSource`。
 */
import type { EmotionId } from "../../../types";
import type { PlayerProfile } from "../profile";
import type { Post, PostSource } from "../source";

/**
 * 期望的语料库记录 schema（JSONL，一行一条）。
 *
 * 示例一行：
 * {"platform":"xiaohongshu","content":"我改了十七稿方案，群里只回了一句收到。","emotion":["unseen","tired"],"situation":"深夜加班，被已读不回"}
 */
export interface CrawlCorpusRecord {
  platform: string;
  content: string;
  emotion: EmotionId[];
  situation: string;
}

/**
 * 从文件路径构造一个 CrawlPosts 源。
 *
 * TODO(接入步骤)：
 * 1. 用 MediaCrawler 预爬目标平台（小红书/豆瓣/微博等），导出 JSONL 语料库，
 *    每行符合 `CrawlCorpusRecord`。公开内容须脱敏（去姓名/头像/ID/联系方式）。
 * 2. 把文件放到约定目录（如 `paper-echo/corpus/*.jsonl`），路径传入本函数。
 * 3. 在 `search` 里读文件、按 `profile.emotions` 做粗筛（标签命中 / Jaccard 文本相似），
 *    映射成 `Post[]` 返回。文件较大时做一次进程内缓存。
 * 4. 把 `{ ...crawlPosts, id }` 塞进流水线的 `sources` 列表即可生效。
 */
export function crawlPostsFromPath(path: string): PostSource {
  return {
    id: `crawl:${path}`,
    async search(_profile: PlayerProfile): Promise<Post[]> {
      // TODO: 读文件 → 过滤 → 映射，见上方接入步骤。
      throw new Error(`CrawlPosts 未接入（语料路径：${path}）`);
    },
  };
}

/** 默认语料路径的 CrawlPosts 源。未接入前调用会抛错。 */
export const crawlPosts: PostSource = crawlPostsFromPath("corpus/posts.jsonl");
