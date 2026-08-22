import { ownedOf } from "../emotions";
import { STORIES } from "../stories";
import type { EmotionId, Fingerprint, MemoryRecord, RegionId } from "../types";
import { isInstruction, searchArchival } from "./memory";

export interface ToolCtx {
  archival: MemoryRecord[];
  fingerprint: Fingerprint[];
  region: RegionId;
  remembered: string[];
}

function asFeels(fp: Fingerprint[]): EmotionId[] {
  return ownedOf(fp, 0.3).map((f) => f.id);
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
    const feels = asFeels(ctx.fingerprint);
    const ranked = [...STORIES].sort((a, b) => {
      const oa = a.feels.filter((f) => feels.includes(f)).length;
      const ob = b.feels.filter((f) => feels.includes(f)).length;
      const ta = Number(a.opening.includes(query) || a.lines.some((l) => l.includes(query)));
      const tb = Number(b.opening.includes(query) || b.lines.some((l) => l.includes(query)));
      const ra = a.region === ctx.region ? 1 : 0;
      const rb = b.region === ctx.region ? 1 : 0;
      return ob + tb + rb - (oa + ta + ra);
    });
    return ranked
      .slice(0, 4)
      .map((s) => `${s.name} · ${s.city}\n${s.opening}\n${s.lines[0]}`)
      .join("\n---\n");
  }
  if (name === "remember") {
    const fact = typeof args.fact === "string" ? args.fact.trim() : "";
    if (fact.length < 4) return "太短，没写下。";
    if (isInstruction(fact)) return "这不是事实，没写下。";
    ctx.remembered.push(fact.slice(0, 24));
    return "已写下。";
  }
  return "没有这个动作。";
}
