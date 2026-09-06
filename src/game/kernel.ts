import { ownedOf } from "./emotions.ts";
import { decideMatch } from "./agent/matching.ts";
import { storyToEcho } from "./stories.ts";
import type {
  EchoPerson,
  EmotionId,
  Fingerprint,
  Journey,
  RegionId,
} from "./types.ts";

export function letterFromChips(chips: string[], extra: string, mirror = ""): string {
  const body = chips.filter(Boolean).join("，");
  const line = extra.trim();
  if (body && line) return `${body}。${line}`;
  return body || line || mirror.trim() || "今晚我想把一句说不出口的话折起来。";
}

/**
 * 无对话链时的身份兜底：签名不变，内部走 decideMatch（Task 2A）。
 * 这里没有 query 文本 → text 项整体为 0，由 emotion 计数 + region 偏好决定；
 * 候选池是 archiveStories()（手写 + COLLECTED），COLLECTED 从此可成为身份。
 * avoid 硬避让、池空回退，与 matchStory 同语义。
 */
export function fallbackEcho(
  fp: Fingerprint[],
  region: RegionId,
  avoid: string[] = [],
): EchoPerson {
  const feels = ownedOf(fp, 0.3).map((f) => f.id) as EmotionId[];
  return storyToEcho(decideMatch({ letter: "", feels, region, avoid }).anchor);
}

export function newJourneyId(): string {
  return `j-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function buildJourney(input: Omit<Journey, "id" | "createdAt">): Journey {
  return {
    id: newJourneyId(),
    createdAt: Date.now(),
    ...input,
  };
}
