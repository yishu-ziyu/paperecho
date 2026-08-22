/**
 * 预采集入口：搜公开页 → 洗 → 改写 → QA → 写出 src/game/collect.ts。
 *
 *   node scripts/with-app-env.mjs npx -y tsx scripts/collect/run.mts
 *   COLLECT_TARGET=24 COLLECT_MAX_SCRAPE=40 …
 *
 * 批量扩库用。现场扔飞机走短预算 live，不跑本脚本。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  COLLECT_OUT,
  CORPUS_DIR,
  SEARCH_QUERIES,
  appendJsonl,
  cleanHit,
  qaStory,
  rewriteStory,
  scrapeUrl,
  searchAnysearch,
  searchFirecrawl,
  sleep,
  writeCollectTs,
  type CleanDoc,
  type RawHit,
} from "./lib.ts";
import type { Story } from "../../src/game/types.ts";

const TARGET = Number(process.env.COLLECT_TARGET ?? 24);
const MAX_SCRAPE = Number(process.env.COLLECT_MAX_SCRAPE ?? 48);
const SEARCH_LIMIT = Number(process.env.COLLECT_SEARCH_LIMIT ?? 5);

function log(msg: string): void {
  console.error(`[collect] ${msg}`);
}

async function discover(): Promise<RawHit[]> {
  const seen = new Set<string>();
  const hits: RawHit[] = [];
  for (const q of SEARCH_QUERIES) {
    try {
      const batch =
        q.provider === "firecrawl"
          ? await searchFirecrawl(q.query, SEARCH_LIMIT)
          : await searchAnysearch(q.query, SEARCH_LIMIT);
      for (const h of batch) {
        if (seen.has(h.url)) continue;
        seen.add(h.url);
        hits.push(h);
      }
      log(`${q.provider} 「${q.query.slice(0, 28)}」 +${batch.length} 累计 ${hits.length}`);
    } catch (e) {
      log(`search fail ${q.provider}: ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(1200 + Math.floor(Math.random() * 800));
  }
  return hits;
}

async function harvest(hits: RawHit[]): Promise<CleanDoc[]> {
  const docs: CleanDoc[] = [];
  let scraped = 0;
  for (const hit of hits) {
    if (docs.length >= TARGET * 3) break;
    if (scraped >= MAX_SCRAPE) break;
    let text = hit.text;
    if (text.length < 220) {
      try {
        const md = await scrapeUrl(hit.url);
        if (md.length > text.length) text = md;
        scraped += 1;
      } catch (e) {
        log(`scrape skip ${hit.url.slice(0, 80)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const cleaned = cleanHit({ ...hit, text });
    appendJsonl(join(CORPUS_DIR, "raw.jsonl"), {
      url: hit.url,
      platform: hit.platform,
      query: hit.query,
      title: hit.title,
      kept: Boolean(cleaned),
      chars: (cleaned?.text ?? text).length,
      text: cleaned?.text ?? null,
    });
    if (cleaned) {
      docs.push(cleaned);
      log(`keep ${cleaned.platform} ${cleaned.text.length}c ${hit.url.slice(0, 72)}`);
    }
    await sleep(2500 + Math.floor(Math.random() * 2000));
  }
  return docs;
}

async function ingest(docs: CleanDoc[]): Promise<Story[]> {
  const accepted: Story[] = [];
  let i = 0;
  for (const doc of docs) {
    if (accepted.length >= TARGET) break;
    i += 1;
    const id = `c${String(i).padStart(3, "0")}`;
    const story = await rewriteStory(doc, id);
    if (!story) {
      appendJsonl(join(CORPUS_DIR, "rejected.jsonl"), { id, url: doc.url, reason: "rewrite_fail" });
      log(`rewrite fail ${id}`);
      continue;
    }
    const fail = qaStory(story, doc.text, accepted);
    if (fail) {
      appendJsonl(join(CORPUS_DIR, "rejected.jsonl"), {
        id,
        url: doc.url,
        reason: fail.reason,
        detail: fail.detail,
      });
      log(`qa drop ${id} ${fail.reason}`);
      continue;
    }
    accepted.push(story);
    appendJsonl(join(CORPUS_DIR, "accepted.jsonl"), {
      id: story.id,
      url: doc.url,
      story,
      originalChars: doc.text.length,
    });
    log(`accept ${story.id} ${story.name} ${accepted.length}/${TARGET}`);
    await sleep(400);
  }
  return accepted;
}

async function main() {
  mkdirSync(CORPUS_DIR, { recursive: true });
  log(`target=${TARGET} max_scrape=${MAX_SCRAPE}`);
  const hits = await discover();
  log(`discovered ${hits.length} urls`);
  writeFileSync(join(CORPUS_DIR, "discovered.json"), JSON.stringify(hits, null, 2));
  const docs = await harvest(hits);
  log(`clean docs ${docs.length}`);
  const stories = await ingest(docs);
  writeCollectTs(stories);
  log(`wrote ${stories.length} stories → ${COLLECT_OUT}`);
  if (!stories.length) process.exitCode = 2;
}

main().catch((e) => {
  console.error("[collect] fatal", e instanceof Error ? e.message : e);
  process.exit(1);
});
