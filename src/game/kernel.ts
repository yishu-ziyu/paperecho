import { ownedOf } from "./emotions";
import { matchStory, storyToEcho } from "./stories";
import type {
  EchoPerson,
  EmotionId,
  Fingerprint,
  Journey,
  RegionId,
} from "./types";

export function letterFromChips(chips: string[], extra: string): string {
  const body = chips.filter(Boolean).join("，");
  const line = extra.trim();
  if (body && line) return `${body}。${line}`;
  return body || line || "今晚我想把一句说不出口的话折起来。";
}

export function fallbackEcho(
  fp: Fingerprint[],
  region: RegionId,
): EchoPerson {
  const feels = ownedOf(fp, 0.3).map((f) => f.id) as EmotionId[];
  return storyToEcho(matchStory(feels, region));
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
