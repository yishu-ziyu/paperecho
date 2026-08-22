/**
 * 现场爬到的公开页：改写 + QA 后写入进程内档案，并尽量落盘 collect.ts / corpus。
 * 失败吞掉，绝不挡飞机开口。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Story } from "../../types.ts";
import { qaStory, rewriteStory, emitCollectTs } from "./rewrite.ts";
import { absorbCollected, archiveStories } from "./sources/local.ts";
import type { CleanDoc } from "./web.ts";

const CORPUS_DIR = join(process.cwd(), "corpus");
const COLLECT_OUT = join(process.cwd(), "src/game/collect.ts");

function nextId(pool: Story[]): string {
  let max = 0;
  for (const s of pool) {
    const m = /^c(\d+)$/.exec(s.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `c${String(max + 1).padStart(3, "0")}`;
}

function appendJsonl(name: string, row: unknown): void {
  try {
    const path = join(CORPUS_DIR, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(row)}\n`, { flag: "a" });
  } catch {
    // 演示现场写盘失败就算了，进程内 absorb 仍有效。
  }
}

function persistCollected(pool: Story[]): void {
  try {
    const collected: Story[] = [];
    const seen = new Set<string>();
    for (const s of pool) {
      if (s.source !== "collected" || seen.has(s.id)) continue;
      seen.add(s.id);
      collected.push(s);
    }
    writeFileSync(COLLECT_OUT, emitCollectTs(collected), "utf8");
  } catch {
    // ignore
  }
}

let queue: Promise<void> = Promise.resolve();

export function ingestCleanDocs(docs: CleanDoc[]): void {
  if (!docs.length) return;
  if (typeof process === "undefined" || typeof process.cwd !== "function") return;
  queue = queue
    .then(async () => {
      const pool = [...archiveStories()];
      let grew = false;
      for (const doc of docs) {
        const id = nextId(pool);
        const story = await rewriteStory(doc, id);
        if (!story) {
          appendJsonl("rejected.jsonl", { id, url: doc.url, reason: "rewrite_fail" });
          continue;
        }
        const fail = qaStory(story, doc.text, pool.filter((s) => s.source === "collected"));
        if (fail) {
          appendJsonl("rejected.jsonl", { id, url: doc.url, reason: fail.reason, detail: fail.detail });
          continue;
        }
        pool.push(story);
        absorbCollected(story);
        grew = true;
        appendJsonl("accepted.jsonl", { id: story.id, url: doc.url, story, originalChars: doc.text.length });
      }
      if (grew) persistCollected(archiveStories());
    })
    .catch(() => {});
}
