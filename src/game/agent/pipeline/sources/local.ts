/**
 * Paper Echo — 数据源 · LocalPosts（默认快路径）
 *
 * 手写 12 张 + COLLECTED。现场爬到的改写稿 absorb 进本进程，重启后靠 collect.ts。
 * 给 Agent 的 Post 不含 name / city / 原帖。
 */
import { COLLECTED } from "../../../collect.ts";
import { STORIES } from "../../../stories.ts";
import type { Story } from "../../../types.ts";
import type { Post, PostSource } from "../source.ts";

/** 核心手写 + 预采集改写稿。采集稿衰减，不刷掉 12 张质量锚。 */
export function archiveStories(): Story[] {
  return [...STORIES, ...COLLECTED];
}

/** 现场入库：过 QA 的改写稿推进 COLLECTED，本进程立刻能搜到。 */
export function absorbCollected(story: Story): void {
  if (story.source !== "collected") return;
  if (COLLECTED.some((s) => s.id === story.id)) return;
  COLLECTED.push(story);
}

/** 从一句 opening 取第一句作情境摘要。 */
export function summarize(text: string, maxLen = 36): string {
  const first = text.split(/[。！？]/)[0]?.trim() ?? text.trim();
  if (!first) return "";
  return first.length > maxLen ? `${first.slice(0, maxLen)}…` : first;
}

/** 一张 Story 卡 → 一条 Post。只取口语行，不把剧场腔 opening 喂给开口。 */
export function storyToPost(story: Story): Post {
  const spoken = story.lines.map((l) => l.trim()).filter(Boolean);
  const content = spoken.join(" ") || story.opening;
  return {
    platform: "archive",
    content,
    emotion: story.feels,
    situation: summarize(spoken[0] || story.opening),
  };
}

function scorePost(post: Post, wanted: Set<string>, collected: boolean): number {
  const overlap = post.emotion.filter((e) => wanted.has(e)).length;
  return overlap * (collected ? 0.9 : 1);
}

/**
 * 默认数据源：世界档案（手写 + 预采集）。
 * `id` 固定为 "local"，供 `sourceFor` / 日志标记使用。
 */
export const localPosts: PostSource = {
  id: "local",
  async search(profile): Promise<Post[]> {
    const stories = archiveStories();
    const posts = stories.map((s) => {
      const post = storyToPost(s);
      return { post, collected: s.source === "collected" };
    });
    if (!profile.emotions.length) return posts.map((p) => p.post);
    const wanted = new Set(profile.emotions);
    return [...posts]
      .sort((a, b) => scorePost(b.post, wanted, b.collected) - scorePost(a.post, wanted, a.collected))
      .map((p) => p.post);
  },
};
