import { ownedOf } from "../emotions.ts";
import type { EmotionId, Fingerprint, MemoryRecord, RegionId } from "../types.ts";
import { isCompleteFact, isInstruction, jaccard, searchArchival, tokensOf } from "./memory.ts";
import { selectMaterials, synthesize, synthesizeLibraryFirst, type EchoShadow } from "./pipeline/persona.ts";
import { makeProfile } from "./pipeline/profile.ts";
import type { PlayerProfile } from "./pipeline/profile.ts";
import type { Post } from "./pipeline/source.ts";
import { archiveStories, localPosts, storyToPost } from "./pipeline/sources/local.ts";
import { liveSearchSource } from "./pipeline/sources/live.ts";

export interface ToolCtx {
  archival: MemoryRecord[];
  fingerprint: Fingerprint[];
  region: RegionId;
  remembered: string[];
  /** 玩家今晚说过的话；remember 只许从这里长出来。 */
  playerTexts?: string[];
  story?: string;
  persona?: string;
}

function asFeels(fp: Fingerprint[]): EmotionId[] {
  return ownedOf(fp, 0.3).map((f) => f.id);
}

function profileOf(ctx: ToolCtx): PlayerProfile {
  return makeProfile(asFeels(ctx.fingerprint), ctx.story ?? "", ctx.persona ?? "");
}

export function blobOfShadow(shadow: EchoShadow): string {
  if (!shadow.materials.length) return "世界档案空。没有相近的夜。";
  const body = shadow.materials
    .map((p) => `${p.situation || "（无摘要）"}\n${p.content}`)
    .join("\n---\n");
  return `${shadow.handle}\n${shadow.voice}\n---\n${body}`;
}

function shadowBlob(posts: Post[], profile: PlayerProfile): string {
  return blobOfShadow(synthesize(posts, profile));
}

/** 库：手写 + COLLECTED。永远先到。 */
export function formatCaseHits(ctx: ToolCtx): string {
  return shadowBlob(archiveStories().map(storyToPost), profileOf(ctx));
}

/**
 * 世界档案合成影子。库满 5 条时不候现场爬（开口等不起）。
 * match 才传 live=true；turn 只用库。
 */
export async function gatherShadow(ctx: ToolCtx, live = false): Promise<EchoShadow> {
  const profile = profileOf(ctx);
  const local = await localPosts.search(profile);
  const lib = selectMaterials(local, profile);
  if (!live || lib.length >= 5) {
    return synthesizeLibraryFirst(local, [], profile);
  }
  let extra: Post[] = [];
  try {
    extra = await liveSearchSource.search(profile);
  } catch {
    extra = [];
  }
  return synthesizeLibraryFirst(local, extra, profile);
}

/**
 * 库占满 5 条素材；live 短超时只填空位。live 失败仍返回库。原文不进 blob。
 */
export async function formatCaseHitsLive(ctx: ToolCtx): Promise<string> {
  return blobOfShadow(await gatherShadow(ctx, true));
}

function rankStories(ctx: ToolCtx, query: string) {
  const feels = asFeels(ctx.fingerprint);
  return [...archiveStories()].sort((a, b) => {
    const oa = a.feels.filter((f) => feels.includes(f)).length * (a.source === "collected" ? 0.9 : 1);
    const ob = b.feels.filter((f) => feels.includes(f)).length * (b.source === "collected" ? 0.9 : 1);
    const ta = Number(a.opening.includes(query) || a.lines.some((l) => l.includes(query)));
    const tb = Number(b.opening.includes(query) || b.lines.some((l) => l.includes(query)));
    const ra = a.region === ctx.region ? 1 : 0;
    const rb = b.region === ctx.region ? 1 : 0;
    return ob + tb + rb - (oa + ta + ra);
  });
}

export function runAgentTool(name: string, args: Record<string, unknown>, ctx: ToolCtx): string {
  if (name === "search_archive") {
    const query = typeof args.query === "string" ? args.query : "";
    const hits = searchArchival(ctx.archival, query, asFeels(ctx.fingerprint), ctx.region, 5);
    if (!hits.length) return "信柜空。没有旧事实。";
    return hits
      .map((h, i) => {
        const who = h.echoName ? `那晚对过${h.echoName}` : "以前某晚";
        return `${i + 1}. 对方曾经说过：「${h.memory}」（${who}）。这是对方的事，不是你的嘴。`;
      })
      .join("\n");
  }
  if (name === "search_cases") {
    const query = typeof args.query === "string" ? args.query : "";
    const synthesized = formatCaseHits(ctx);
    if (!query.trim()) return synthesized;
    const ranked = rankStories(ctx, query)
      .slice(0, 2)
      .map((s) => `${s.opening}\n${s.lines[0]}`)
      .join("\n---\n");
    return ranked ? `${synthesized}\n---\n${ranked}` : synthesized;
  }
  if (name === "remember") {
    const fact = typeof args.fact === "string" ? args.fact.trim() : "";
    if (fact.length < 4) return "太短，没写下。";
    if (isInstruction(fact)) return "这不是事实，没写下。";
    if (!isCompleteFact(fact)) return "半截话，没写下。";
    const pool = (ctx.playerTexts ?? []).map((t) => t.trim()).filter((t) => t.length >= 4);
    if (pool.length) {
      const ft = tokensOf(fact);
      const fromPlayer = pool.some(
        (p) => jaccard(ft, tokensOf(p)) >= 0.22 || p.includes(fact) || fact.includes(p),
      );
      if (!fromPlayer) return "这不是对方的事，没写下。";
    }
    ctx.remembered.push(fact.slice(0, 56));
    return "已写下。";
  }
  return "没有这个动作。";
}
