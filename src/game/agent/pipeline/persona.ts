/**
 * Paper Echo — 流水线 · 整合层（合成影子）
 *
 * 把搜索层搜到的「一批帖子」整合成一个「合成影子」（EchoShadow）——
 * 它代表「跟你同频的那群人」，不绑定任何具体真人：名字抽象、声音融合、带素材库。
 * 本阶段只做确定性/启发式聚合；真正的 LLM 融合留 TODO。
 */
import { EMOTION_MAP } from "../../emotions";
import type { EmotionId } from "../../types";
import type { PlayerProfile } from "./profile";
import type { Post } from "./source";

/**
 * 合成影子 —— 一批同频帖子的化身。
 *
 * - `handle`：抽象化名，不指向任何真人（从情绪派生的代称，如「跟你一样把难受咽下去的人」）。
 * - `voice`：统一的说话方式描述（从一批帖子的语言风格提炼）。
 * - `materials`：素材库——去重后的一批帖子细节，供后续对话生成时取用。
 */
export interface EchoShadow {
  handle: string;
  voice: string;
  materials: Post[];
}

/**
 * 从 `profile.emotions` 派生一个抽象代称。
 *
 * 明确不绑定真人姓名/城市：只用情绪标签拼出「跟你一样 XX 的人」这类代称，
 * 不用 `Story.name` 或任何城市信息当身份；空情绪回退到「回声」占位。
 */
export function deriveHandle(emotions: EmotionId[]): string {
  const labels = emotions
    .map((id) => EMOTION_MAP[id]?.label)
    .filter((label): label is string => Boolean(label))
    .slice(0, 2);
  return labels.length ? `跟你一样${labels.join("、")}的人` : "回声";
}

/**
 * 从一批帖子做启发式提炼，生成一句统一的 voice 描述。
 *
 * 观察语言共性（第一人称、短句、具体物件、不说教），按「过半命中」判定；
 * TODO：未来用 LLM 把这一批帖子的语言风格融合成统一的 voice。
 */
export function deriveVoice(posts: Post[]): string {
  if (posts.length === 0) {
    return "尚未成形——素材库为空，等有帖子再提炼统一的说话方式。";
  }
  const traits: string[] = [];
  const half = posts.length / 2;
  if (posts.filter((p) => p.content.includes("我")).length >= half) {
    traits.push("第一人称");
  }
  if (posts.filter((p) => p.content.length <= 48).length >= half) {
    traits.push("短句");
  }
  const objects = /稿|灯|沙发|风扇|手机|清单|截图|窗|门|天花板|衣领|电池|文件夹|雨/;
  if (posts.filter((p) => objects.test(p.content)).length >= half) {
    traits.push("说具体物件");
  }
  if (posts.every((p) => !/(你应该|你要|记住|千万别|必须)/.test(p.content))) {
    traits.push("不说教");
  }
  const core = traits.length ? traits.join("、") : "口语、白描、克制";
  return `统一的说话方式：${core}。`;
}

/**
 * 挑出素材库：按 `Post.emotion` 与 `profile.emotions` 的重叠数降序、
 * 按 `content` 去重、取 top 5（不足则全取）。
 */
export function selectMaterials(posts: Post[], profile: PlayerProfile): Post[] {
  const wanted = new Set(profile.emotions);
  const scored = posts.map((post) => ({
    post,
    overlap: post.emotion.filter((e) => wanted.has(e)).length,
  }));
  // Array.prototype.sort 稳定：重叠数相同时保留原顺序，确定性可复现。
  scored.sort((a, b) => b.overlap - a.overlap);
  const seen = new Set<string>();
  return scored
    .filter(({ post }) => {
      if (seen.has(post.content)) return false;
      seen.add(post.content);
      return true;
    })
    .slice(0, 5)
    .map(({ post }) => post);
}

/**
 * 整合：把一批帖子聚成一个合成影子（骨架阶段的确定性/启发式聚合）。
 *
 * 空数组时返回明确的「空影子」占位：`handle` 仍有、`materials` 为空、`voice` 为占位说明。
 */
export function synthesize(posts: Post[], profile: PlayerProfile): EchoShadow {
  const materials = selectMaterials(posts, profile);
  return {
    handle: deriveHandle(profile.emotions),
    voice: deriveVoice(posts),
    materials,
  };
}
