import { EMOTION_MAP, ownedOf } from "../emotions.ts";
import { regionLabel } from "../stories.ts";
import type { EmotionId, Fingerprint, MemoryRecord, RegionId } from "../types.ts";

const KEY = "paper-echo-memory-v2";
const VERSION = 3;
const CAP = 48;
const GENERIC = "今晚我想把一句说不出口的话折起来。";
const INSTRUCTION = /纸要折回去|写进 Human|# Human|# Persona|\barrive\b|search_cases|search_archive|^remember\b|桌上三句|先查（|对方扔到桌上|你就是/;

interface File {
  version: number;
  records: MemoryRecord[];
}

export function newMemoryId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function loadArchival(): MemoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as File;
    if (!Array.isArray(parsed.records)) return [];
    return parsed.records.slice(0, CAP);
  } catch {
    return [];
  }
}

export function persistArchival(records: MemoryRecord[]) {
  if (typeof window === "undefined") return;
  const file: File = { version: VERSION, records: records.slice(0, CAP) };
  localStorage.setItem(KEY, JSON.stringify(file));
}

export function tokensOf(text: string): Set<string> {
  const out = new Set<string>();
  const lower = text.toLowerCase();
  for (const w of lower.match(/[a-z0-9]+/g) ?? []) out.add(w);
  const chars = [...lower.replace(/[^\u4e00-\u9fff]/g, "")];
  for (let i = 0; i < chars.length; i++) {
    out.add(chars[i]!);
    if (chars[i + 1]) out.add(chars[i]! + chars[i + 1]);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function isInstruction(text: string): boolean {
  return INSTRUCTION.test(text);
}

function quotesBalanced(t: string): boolean {
  const pairs: [string, string][] = [
    ["「", "」"],
    ["『", "』"],
    ["“", "”"],
  ];
  for (const [open, close] of pairs) {
    if ((t.split(open).length - 1) !== (t.split(close).length - 1)) return false;
  }
  if ((t.match(/"/g) ?? []).length % 2 !== 0) return false;
  return true;
}

/** remember 闸门：只收下完整短句。半截、开引号、残句一律丢掉。 */
export function isCompleteFact(fact: string): boolean {
  const t = fact.trim();
  if (t.length < 4) return false;
  if (isInstruction(t)) return false;
  if (!quotesBalanced(t)) return false;
  if (/[的了没着和把被在]$/.test(t) && t.length < 18) return false;
  return true;
}

/** Echo is speaking a previous night's fact as 我 — not a 你上次 nod. */
export function stolenVoice(text: string, records: MemoryRecord[]): boolean {
  const t = text.trim();
  if (!t || !records.length) return false;
  if (/你上次|你跟.+说过|你留着|你那/.test(t) && !/^(我|咱)/.test(t)) return false;
  const st = tokensOf(t);
  for (const r of records) {
    const mem = r.memory.trim();
    if (mem.length < 6) continue;
    const clip = mem.slice(0, 8);
    const hit = jaccard(st, tokensOf(mem)) >= 0.4 || (clip.length >= 6 && t.includes(clip));
    if (hit && /我/.test(t)) return true;
  }
  return false;
}

export function parroted(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  return jaccard(tokensOf(x), tokensOf(y)) >= 0.55;
}

export function ownLine(
  spoken: string,
  fallbacks: string[],
  archival: MemoryRecord[],
  used?: string | string[],
): string {
  const first = !archival.length;
  const banned = new Set((Array.isArray(used) ? used : [used]).filter((s): s is string => Boolean(s)));
  const seen = new Set<string>();
  const accept = (raw: string) => {
    const t = raw.trim();
    if (!t || seen.has(t) || isInstruction(t) || stolenVoice(t, archival)) return "";
    if (banned.has(t) || [...banned].some((b) => parroted(t, b))) return "";
    if (first && /你上次|你留着|你那晚|你跟.+说过/.test(t)) return "";
    seen.add(t);
    return t;
  };
  return accept(spoken) || fallbacks.map(accept).find(Boolean) || fallbacks.find((s) => s.trim() && !banned.has(s))?.trim() || spoken.trim();
}

/** Keep only facts that came from the player's mouth, plus those lines themselves. */
export function keepPlayerFacts(facts: string[], playerTexts: string[]): string[] {
  const pool = [...new Set(playerTexts.map((t) => t.trim()).filter((t) => t.length >= 4 && t !== GENERIC && !isInstruction(t)))];
  const out: string[] = [];
  const push = (raw: string) => {
    const t = raw.trim().slice(0, 56);
    if (!t || t === GENERIC || !isCompleteFact(t) || /玩家靠近|今晚靠近/.test(t)) return;
    if (out.some((x) => x === t || jaccard(tokensOf(x), tokensOf(t)) >= 0.48)) return;
    out.push(t);
  };
  for (const f of facts) {
    const ft = tokensOf(f);
    if (pool.some((p) => jaccard(ft, tokensOf(p)) >= 0.22 || p.includes(f) || f.includes(p))) push(f);
  }
  for (const p of pool) push(p);
  return out.slice(0, 8);
}

export function searchArchival(
  records: MemoryRecord[],
  query: string,
  feels: EmotionId[],
  region?: RegionId,
  topK = 5,
): MemoryRecord[] {
  const q = tokensOf(query);
  const scored = records.map((r) => {
    const overlap = r.emotions.filter((e) => feels.includes(e)).length;
    const regionBonus = region && r.region === region ? 0.35 : 0;
    const text = jaccard(q, tokensOf(r.memory));
    const recency = 1 / (1 + (Date.now() - r.createdAt) / 86_400_000);
    return { r, n: overlap * 0.4 + regionBonus + text * 2 + recency * 0.3 };
  });
  return scored
    .filter((s) => s.n > 0.06)
    .sort((a, b) => b.n - a.n)
    .slice(0, topK)
    .map((s) => s.r);
}

export function applyFacts(
  existing: MemoryRecord[],
  facts: string[],
  meta: { emotions: EmotionId[]; region?: RegionId; echoName?: string },
): MemoryRecord[] {
  let next = [...existing];
  for (const raw of facts) {
    const fact = raw.trim();
    if (!isCompleteFact(fact)) continue;
    if (/玩家靠近|想被看见 \d|疲惫 \d/.test(fact)) continue;
    const ft = tokensOf(fact);
    let bestI = -1;
    let best = 0;
    for (let i = 0; i < next.length; i++) {
      const s = jaccard(ft, tokensOf(next[i]!.memory));
      if (s > best) {
        best = s;
        bestI = i;
      }
    }
    if (best >= 0.48 && bestI >= 0) {
      const cur = next[bestI]!;
      if (fact.length > cur.memory.length) {
        next[bestI] = { ...cur, memory: fact, ...meta };
      }
    } else if (best < 0.88) {
      next.unshift({
        id: newMemoryId(),
        memory: fact,
        emotions: meta.emotions,
        region: meta.region,
        echoName: meta.echoName,
        createdAt: Date.now(),
      });
    }
  }
  const seen = new Set<string>();
  next = next.filter((r) => {
    if (seen.has(r.memory)) return false;
    seen.add(r.memory);
    return true;
  });
  return next.slice(0, CAP);
}

/** Tonight's observation. Goes in the user turn, never into durable Human. */
export function perceptionOf(
  fp: Fingerprint[],
  letter: string,
  mirror: string,
  region: string,
  persona = "",
): string {
  const owned = ownedOf(fp, 0.3)
    .slice(0, 4)
    .map((f) => `${EMOTION_MAP[f.id].label} ${(f.closeness * 100).toFixed(0)}%`);
  const bits = [`今晚靠近：${owned.join("，") || "不明"}`];
  if (mirror) bits.push(`他写下的一句：${mirror}`);
  if (persona) bits.push(`他今晚更像：${persona}`);
  if (letter) bits.push(`他折进来的原话：${letter}`);
  bits.push(`飞向：${regionLabel(region)}`);
  return bits.join("。");
}

export function factsOf(records: MemoryRecord[]): string[] {
  return records
    .map((r) => {
      const mem = r.memory.trim();
      if (mem.length < 4 || isInstruction(mem) || /玩家靠近|今晚靠近/.test(mem)) return "";
      const line = `玩家曾说「${mem}」`;
      return r.echoName ? `${line}（那晚对过${r.echoName}）` : line;
    })
    .filter(Boolean)
    .slice(0, 10);
}

/** Pi system blocks. Persona + Human stay in context every turn. */
export function renderBlocks(persona: string, facts: string[]): string {
  const human = facts.length
    ? `这是玩家留下的事，不是你的人生。禁止把这些句子改成「我……」。\n${facts.map((f) => `- ${f}`).join("\n")}`
    : "- （还没有记下的事）";
  return `# Persona\n${persona || "身份未定。arrive 时落下。"}\n\n# Human\n${human}`;
}
