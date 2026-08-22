/**
 * Paper Echo — 数据源 · LocalPosts（默认兜底）
 *
 * 把内置的 12 张 Story 卡直接转成 Post 数组，不碰网络、确定性可复现，
 * 是流水线「先跑通」的那条路。换真实语料时把它换成 CrawlPosts / LiveSearch。
 */
import { STORIES } from "../../../stories";
import type { Story } from "../../../types";
import type { Post, PostSource } from "../source";

/** 从一句 opening 取第一句作情境摘要。 */
export function summarize(text: string, maxLen = 36): string {
  const first = text.split(/[。！？]/)[0]?.trim() ?? text.trim();
  if (!first) return "";
  return first.length > maxLen ? `${first.slice(0, maxLen)}…` : first;
}

/** 一张 Story 卡 → 一条 Post。content 合并 opening 与两行 lines。 */
export function storyToPost(story: Story): Post {
  return {
    platform: "archive",
    content: [story.opening, ...story.lines].join(" "),
    emotion: story.feels,
    situation: summarize(story.opening),
  };
}

/**
 * 默认数据源：12 张 Story 卡就是 12 条候选帖。
 * `id` 固定为 "local"，供 `sourceFor` / 日志标记使用。
 */
export const localPosts: PostSource = {
  id: "local",
  async search(): Promise<Post[]> {
    return STORIES.map(storyToPost);
  },
};
