/**
 * 匿名改写与确定性 QA。无文件系统。采集脚本与现场入库共用。
 */
import { jaccard, parroted, tokensOf } from "../memory.ts";
import { llmApiKey, LLM_CONFIG } from "../config.ts";
import { STORIES } from "../../stories.ts";
import type { EmotionId, RegionId, Story } from "../../types.ts";
import type { CleanDoc } from "./web.ts";

export const EMOTION_IDS: EmotionId[] = [
  "gloom",
  "wronged",
  "anxious",
  "tired",
  "lonely",
  "anger",
  "calm",
  "unseen",
];

export const REGION_IDS: RegionId[] = [
  "east",
  "america",
  "europe",
  "africa",
  "oceania",
  "polar",
];

const CONTACT_RE =
  /(?:\+?\d[\d\-\s]{8,}\d)|(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(?:https?:\/\/\S+)/gi;

export interface QaFail {
  reason: string;
  detail?: string;
}

const REWRITE_SYSTEM = `你把一段公开的深夜自述，改写成游戏里一个普通人今晚的三层小故事。
铁律：
- 吸收情绪与具体物件/动作/时间，彻底改写；不得连续复用原文 8 个字以上。
- 不含原帖任何真名、昵称、城市、账号、公司全称、街道、手机、邮箱、@、链接。
- 口吻：夜深普通人，像微信，写「事」不写状态；不说教、不金句、不安慰读者。
- name 必须是虚构的短名（2–6 字），city 必须是常见城市且不得出现在原文里。
- feels 只能从 gloom,wronged,anxious,tired,lonely,anger,calm,unseen 里选 1–3 个。
- region 只能是 east,america,europe,africa,oceania,polar 之一。
- returnLetter 是你留给桌上那个人的一句，像「那包还在。你要是也有，先别扔。」禁止点自己的名字，禁止叫对方睡觉、禁止鸡汤。
- opening 与 lines 必须第一人称「我」，禁止「他自己」。
- 只输出一个 JSON 对象，不要 markdown、不要解释。`;

export function extractMarkers(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.match(/@[A-Za-z0-9_\u4e00-\u9fff.]{2,24}/g) ?? []) out.add(m);
  for (const m of text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) out.add(m.toLowerCase());
  for (const m of text.match(/https?:\/\/\S+/gi) ?? []) out.add(m);
  for (const m of text.match(/\+?\d[\d\-\s]{8,}\d/g) ?? []) out.add(m.replace(/\s/g, ""));
  for (const m of text.match(/我叫[\u4e00-\u9fffA-Za-z]{2,8}/g) ?? []) out.add(m.slice(2));
  return [...out].filter((s) => s.length >= 2);
}

export function hasEightCharLeak(original: string, rewrite: string): boolean {
  const src = original.replace(/\s+/g, "");
  const dst = rewrite.replace(/\s+/g, "");
  if (src.length < 8 || dst.length < 8) return false;
  for (let i = 0; i <= src.length - 8; i++) {
    const clip = src.slice(i, i + 8);
    if (!/[\u4e00-\u9fffA-Za-z]/.test(clip)) continue;
    if (dst.includes(clip)) return true;
  }
  return false;
}

export function storyBlob(s: Pick<Story, "opening" | "lines" | "returnLetter">): string {
  return [s.opening, ...s.lines, s.returnLetter].join("\n");
}

export function qaStory(story: Story, original: string, pool: Story[]): QaFail | null {
  const blob = storyBlob(story);
  if (story.opening.length < 12 || story.opening.length > 80) return { reason: "opening_len" };
  if (story.lines.length !== 2) return { reason: "lines_count" };
  if (story.lines.some((l) => l.length < 8 || l.length > 56)) return { reason: "line_len" };
  if (story.returnLetter.length < 8 || story.returnLetter.length > 72) return { reason: "letter_len" };
  if (!REGION_IDS.includes(story.region)) return { reason: "region" };
  if (!story.feels.length || story.feels.some((f) => !EMOTION_IDS.includes(f))) return { reason: "feels" };
  if (!`${story.opening}${story.lines.join("")}`.includes("我")) return { reason: "no_first_person" };
  if (blob.includes(story.name) || story.returnLetter.includes(story.name)) return { reason: "name_in_text" };
  if (/去睡吧|你不需要永远|加油|接住你/.test(blob)) return { reason: "counsel" };
  if (CONTACT_RE.test(blob)) return { reason: "contact" };
  if (jaccard(tokensOf(blob), tokensOf(original)) >= 0.55) return { reason: "jaccard_original" };
  if (hasEightCharLeak(original, blob)) return { reason: "eight_char" };
  const markers = extractMarkers(original);
  for (const m of markers) {
    if (m.length >= 2 && blob.includes(m)) return { reason: "marker", detail: m };
  }
  if (original.includes(story.name) || original.includes(story.city)) {
    return { reason: "name_or_city_in_source" };
  }
  for (const s of STORIES) {
    if (parroted(blob, storyBlob(s))) return { reason: "parrot_core" };
  }
  for (const s of pool) {
    if (jaccard(tokensOf(blob), tokensOf(storyBlob(s))) >= 0.48) return { reason: "dup_pool" };
  }
  return null;
}

function anthropicText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const b = block as { type?: string; text?: unknown };
      return b.type === "text" && typeof b.text === "string" ? b.text : "";
    })
    .join("");
}

export async function rewriteStory(doc: CleanDoc, id: string): Promise<Story | null> {
  const apiKey = llmApiKey();
  if (!apiKey) return null;
  const user = `原文（只作情绪与物件参考，禁止照抄）：\n${doc.text.slice(0, 1600)}\n\n输出 JSON 字段：id 已定为 ${id}。请给出 name,city,region,feels,opening,lines,returnLetter。`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(LLM_CONFIG.timeoutMs, 45000));
  try {
    let url: string;
    let headers: Record<string, string>;
    let body: Record<string, unknown>;
    if (LLM_CONFIG.api === "openai-completions") {
      url = `${LLM_CONFIG.baseUrl.replace(/\/$/, "")}/chat/completions`;
      headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
      body = {
        model: LLM_CONFIG.modelId,
        messages: [
          { role: "system", content: REWRITE_SYSTEM },
          { role: "user", content: user },
        ],
        max_tokens: 800,
        temperature: 0.7,
      };
    } else {
      url = `${LLM_CONFIG.baseUrl.replace(/\/$/, "")}/v1/messages`;
      headers = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey,
      };
      body = {
        model: LLM_CONFIG.modelId,
        system: REWRITE_SYSTEM,
        messages: [{ role: "user", content: user }],
        max_tokens: 800,
        temperature: 0.7,
      };
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const raw =
      LLM_CONFIG.api === "openai-completions"
        ? String(
            (data.choices as { message?: { content?: unknown } }[] | undefined)?.[0]?.message?.content ??
              "",
          )
        : anthropicText(data.content);
    return parseStoryJson(raw, id, doc);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function parseStoryJson(raw: string, id: string, doc: CleanDoc): Story | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const name = String(parsed.name ?? "").trim();
  const city = String(parsed.city ?? "").trim();
  const region = String(parsed.region ?? "").trim() as RegionId;
  const opening = String(parsed.opening ?? "").trim();
  const returnLetter = String(parsed.returnLetter ?? "").trim();
  const linesRaw = Array.isArray(parsed.lines) ? parsed.lines.map((x) => String(x).trim()) : [];
  const feels = (Array.isArray(parsed.feels) ? parsed.feels : doc.emotionHint)
    .map((x) => String(x) as EmotionId)
    .filter((x) => EMOTION_IDS.includes(x))
    .slice(0, 3);
  if (!name || !city || !opening || linesRaw.length < 2 || !returnLetter) return null;
  return {
    id,
    name,
    city,
    region: REGION_IDS.includes(region) ? region : "east",
    feels: feels.length ? feels : (["gloom"] as EmotionId[]),
    opening,
    lines: [linesRaw[0]!, linesRaw[1]!],
    returnLetter,
    source: "collected",
  };
}

export function emitCollectTs(stories: Story[]): string {
  const body = JSON.stringify(stories, null, 2);
  return `/**
 * 预采集世界档案。由 scripts/collect/run.mts 生成。
 * 原文不入库、不进游戏；运行时只读本文件。
 */
import type { Story } from "./types.ts";

export const COLLECTED: Story[] = ${body};
`;
}
