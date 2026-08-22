/**
 * 预采集管线：改写、QA、写盘。检索与清洗见 pipeline/web.ts。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanHit,
  platformOf,
  hostDenied,
  markdownToText,
  scrapeUrl,
  searchAnysearch,
  searchFirecrawl,
  sleep,
  stripBoilerplate,
  type CleanDoc,
  type RawHit,
} from "../../src/game/agent/pipeline/web.ts";
import {
  EMOTION_IDS,
  REGION_IDS,
  emitCollectTs,
  extractMarkers,
  hasEightCharLeak,
  parseStoryJson,
  qaStory,
  rewriteStory,
  storyBlob,
  type QaFail,
} from "../../src/game/agent/pipeline/rewrite.ts";
import type { Story } from "../../src/game/types.ts";

export const COLLECT_ROOT = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = dirname(dirname(COLLECT_ROOT));
export const CORPUS_DIR = join(PROJECT_ROOT, "corpus");
export const COLLECT_OUT = join(PROJECT_ROOT, "src/game/collect.ts");

export {
  EMOTION_IDS,
  REGION_IDS,
  cleanHit,
  platformOf,
  hostDenied,
  markdownToText,
  scrapeUrl,
  searchAnysearch,
  searchFirecrawl,
  sleep,
  stripBoilerplate,
  extractMarkers,
  hasEightCharLeak,
  parseStoryJson,
  qaStory,
  rewriteStory,
  storyBlob,
  emitCollectTs,
};
export type { CleanDoc, RawHit, QaFail };

export interface SearchQuery {
  query: string;
  provider: "firecrawl" | "anysearch";
}

export const SEARCH_QUERIES: SearchQuery[] = [
  { provider: "firecrawl", query: "site:www.jianshu.com 加班到很晚 日记 我" },
  { provider: "firecrawl", query: "site:www.jianshu.com 群里只回了收到 我" },
  { provider: "firecrawl", query: "site:www.jianshu.com 委屈 还好 日记 我" },
  { provider: "firecrawl", query: "site:www.jianshu.com 失眠 清单 焦虑 我" },
  { provider: "firecrawl", query: "site:www.jianshu.com 一个人 夜里 日记" },
  { provider: "firecrawl", query: "site:www.jianshu.com 没人看见 努力 日记" },
  { provider: "firecrawl", query: "site:www.jianshu.com 郁闷 说不出口 日记" },
  { provider: "firecrawl", query: "site:www.jianshu.com 雨停了 还好 日记 我" },
  { provider: "firecrawl", query: "site:zhuanlan.zhihu.com 我 加班到凌晨" },
  { provider: "firecrawl", query: "site:zhuanlan.zhihu.com 我把话删了 群里" },
  { provider: "anysearch", query: "加班到深夜 第一人称 日记 群消息 收到" },
  { provider: "anysearch", query: "我一个人坐到很晚 失眠 日记 中文" },
  { provider: "anysearch", query: "答辩结束了 没有人记得 我改到凌晨 日记" },
  { provider: "anysearch", query: "我把怒气忍回去 日记 第一人称" },
];

export function appendJsonl(path: string, row: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(row)}\n`, { flag: "a" });
}

export function writeCollectTs(stories: Story[]): void {
  writeFileSync(COLLECT_OUT, emitCollectTs(stories), "utf8");
}
