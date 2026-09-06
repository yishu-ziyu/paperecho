/**
 * Paper Echo — 数据源 · LiveSearch
 *
 * 现场短预算现搜公开页（AnySearch / Firecrawl）。库永远先到；
 * 本源失败返回 []，不挡飞机。命中的脱敏 Post 可并入 synthesize；
 * 原文走后台改写+QA 入库，不进 prompt。
 */
import { EMOTION_MAP } from "../../../emotions.ts";
import type { PlayerProfile } from "../profile.ts";
import type { Post, PostSource } from "../source.ts";
import { summarize } from "./local.ts";
import {
  cleanHit,
  scrapeUrl,
  searchAnysearch,
  searchFirecrawl,
  withTimeout,
  type CleanDoc,
  type RawHit,
} from "../web.ts";

export type LiveProvider = "anysearch" | "firecrawl";

const LIVE_MS = Number(process.env.PAPER_ECHO_LIVE_MS ?? 4000);
const LIVE_LIMIT = 3;

/** 调用时读预算：测试可临时覆盖 PAPER_ECHO_LIVE_MS（gatherShadow 的注入缝用）。 */
export function liveBudgetMs(): number {
  const env = Number(process.env.PAPER_ECHO_LIVE_MS);
  return Number.isFinite(env) && env > 0 ? env : LIVE_MS;
}

export function liveEnabled(): boolean {
  if (process.env.PAPER_ECHO_LIVE === "0") return false;
  if (process.env.NODE_TEST_CONTEXT && process.env.PAPER_ECHO_LIVE !== "1") return false;
  return Boolean(process.env.FIRECRAWL_API_KEY?.trim() || process.env.ANYSEARCH_API_KEY?.trim());
}

export function queriesOf(profile: PlayerProfile): string[] {
  const labels = profile.emotions
    .map((id) => EMOTION_MAP[id]?.label)
    .filter((x): x is string => Boolean(x));
  const story = profile.story.replace(/\s+/g, " ").trim().slice(0, 24);
  const out: string[] = [];
  if (labels[0]) out.push(`site:www.jianshu.com ${labels[0]} 日记 我`);
  if (story.length >= 4) out.push(`${story} 日记 我`);
  else if (labels[1]) out.push(`site:zhuanlan.zhihu.com 我 ${labels[1]}`);
  if (!out.length) out.push("site:www.jianshu.com 夜里 日记 我");
  return out.slice(0, 2);
}

function clipContent(text: string, maxLen = 140): string {
  const first = text.split(/[。！？]/).filter((s) => s.trim()).slice(0, 2).join("。").trim();
  const body = first || text.trim();
  return body.length > maxLen ? `${body.slice(0, maxLen)}…` : body;
}

function docToPost(doc: CleanDoc, profile: PlayerProfile): Post {
  return {
    platform: doc.platform || "web",
    content: clipContent(doc.text),
    emotion: doc.emotionHint.length ? doc.emotionHint : profile.emotions,
    situation: summarize(doc.title || doc.text),
  };
}

async function harvest(profile: PlayerProfile): Promise<{ posts: Post[]; docs: CleanDoc[] }> {
  const queries = queriesOf(profile);
  const seen = new Set<string>();
  const hits: RawHit[] = [];
  const batches = await Promise.all(
    queries.map((q) => Promise.all([searchAnysearch(q, 3), searchFirecrawl(q, 3)])),
  );
  for (const [anyHits, fireHits] of batches) {
    for (const h of [...anyHits, ...fireHits]) {
      if (!h.url || seen.has(h.url)) continue;
      seen.add(h.url);
      hits.push(h);
    }
  }
  const docs: CleanDoc[] = [];
  let scraped = 0;
  for (const hit of hits) {
    let cleaned = cleanHit(hit);
    if (!cleaned && hit.text.length < 220 && scraped < 1) {
      const md = await scrapeUrl(hit.url);
      scraped += 1;
      if (md) cleaned = cleanHit({ ...hit, text: md });
    }
    if (cleaned) docs.push(cleaned);
    if (docs.length >= LIVE_LIMIT) break;
  }
  return { posts: docs.map((d) => docToPost(d, profile)), docs };
}

function scheduleIngest(docs: CleanDoc[]): void {
  if (!docs.length) return;
  void import("../ingest.ts")
    .then((m) => m.ingestCleanDocs(docs))
    .catch(() => {});
}

/**
 * 构造一个实时搜索源。无 key / 超时 / 失败一律 []。
 */
export function liveSearch(opts: { provider: LiveProvider; query?: string } = { provider: "anysearch" }): PostSource {
  return {
    id: `live:${opts.provider}`,
    async search(profile: PlayerProfile): Promise<Post[]> {
      if (!liveEnabled()) return [];
      try {
        const work = harvest(profile);
        const result = await withTimeout(work, LIVE_MS, null);
        if (result) {
          if (result.docs.length) scheduleIngest(result.docs);
          return result.posts;
        }
        void work
          .then((full) => {
            if (full.docs.length) scheduleIngest(full.docs);
          })
          .catch(() => {});
        return [];
      } catch {
        return [];
      }
    },
  };
}

/** 默认的实时搜索源：AnySearch 与 Firecrawl 并联，短预算。 */
export const liveSearchSource: PostSource = liveSearch({ provider: "anysearch" });
