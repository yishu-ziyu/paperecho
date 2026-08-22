/**
 * 公开页检索与清洗。无文件系统，可供采集脚本与现场 live 共用。
 * 失败返回空，不抛给调用方。原文链接不进 Post。
 */
import { EMOTIONS } from "../../emotions.ts";
import type { EmotionId } from "../../types.ts";

export interface RawHit {
  url: string;
  title: string;
  text: string;
  platform: string;
  query: string;
}

export interface CleanDoc {
  url: string;
  title: string;
  text: string;
  platform: string;
  query: string;
  emotionHint: EmotionId[];
}

const DENY_HOST =
  /douban\.com|xiaohongshu\.com|xhs\.com|weibo\.com|youtube\.com|facebook\.com|threads\.(net|com)|instagram\.com|tiktok\.com|twitter\.com|x\.com|people\.com|peopleapp\.com|qizhiwang\.org/i;

const CONTACT_RE =
  /(?:\+?\d[\d\-\s]{8,}\d)|(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(?:https?:\/\/\S+)/gi;

const COUNSEL =
  /你不需要永远|我们陪你|接住你的情绪|你值得被|不是一个人|加油啊|请咨询|心理咨询/;

const BOILER =
  /登录|注册|下载.*客户端|关注|字数\s*\d|阅读\s*\d|著作权归作者|首页|扫码|Cookie|分享到|相关阅读|推荐阅读|打开APP|IP属地/;

export function platformOf(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("jianshu")) return "jianshu";
    if (host.includes("zhihu")) return "zhihu";
    if (host.includes("matters")) return "matters";
    if (host.includes("sspai")) return "sspai";
    if (host.includes("reddit")) return "reddit";
    return host.split(".")[0] || "web";
  } catch {
    return "web";
  }
}

export function hostDenied(url: string): boolean {
  try {
    return DENY_HOST.test(new URL(url).hostname);
  } catch {
    return true;
  }
}

export function markdownToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/[*_>#]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripBoilerplate(text: string): string {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 4 && !BOILER.test(l))
    .join("\n")
    .replace(CONTACT_RE, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function emotionHint(text: string): EmotionId[] {
  const hit: EmotionId[] = [];
  for (const e of EMOTIONS) {
    if (text.includes(e.label) || e.chips.some((c) => text.includes(c))) hit.push(e.id);
  }
  return hit;
}

export function cleanHit(hit: RawHit): CleanDoc | null {
  const text = stripBoilerplate(markdownToText(hit.text));
  if (text.length < 80 || text.length > 2400) return null;
  if (!text.includes("我")) return null;
  if (COUNSEL.test(text)) return null;
  return {
    ...hit,
    text,
    emotionHint: emotionHint(text),
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withTimeout<T, F>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<F>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function firecrawl(path: string, payload: Record<string, unknown>): Promise<unknown> {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) throw new Error("missing FIRECRAWL_API_KEY");
  const res = await fetch(`https://api.firecrawl.dev/v2/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 402 || res.status === 429) {
    throw new Error(`firecrawl ${res.status}`);
  }
  if (!res.ok) throw new Error(`firecrawl HTTP ${res.status}`);
  return res.json();
}

export async function searchFirecrawl(query: string, limit: number): Promise<RawHit[]> {
  try {
    const data = (await firecrawl("search", { query, limit })) as {
      data?: { web?: { url?: string; title?: string; description?: string }[] };
    };
    const web = data.data?.web ?? [];
    const hits: RawHit[] = [];
    for (const row of web) {
      const url = row.url?.trim() ?? "";
      if (!url || hostDenied(url)) continue;
      hits.push({
        url,
        title: row.title ?? "",
        text: row.description ?? "",
        platform: platformOf(url),
        query,
      });
    }
    return hits;
  } catch {
    return [];
  }
}

export async function searchAnysearch(query: string, limit: number): Promise<RawHit[]> {
  const key = process.env.ANYSEARCH_API_KEY?.trim();
  if (!key) return [];
  try {
    const res = await fetch("https://api.anysearch.com/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { results?: { title?: string; url?: string; snippet?: string; content?: string }[] };
    };
    const hits: RawHit[] = [];
    for (const row of data.data?.results ?? []) {
      const url = row.url?.trim() ?? "";
      if (!url || hostDenied(url)) continue;
      hits.push({
        url,
        title: row.title ?? "",
        text: [row.content, row.snippet].filter(Boolean).join("\n"),
        platform: platformOf(url),
        query,
      });
    }
    return hits;
  } catch {
    return [];
  }
}

export async function scrapeUrl(url: string): Promise<string> {
  try {
    const data = (await firecrawl("scrape", { url, waitFor: 2500 })) as {
      data?: { markdown?: string };
    };
    return data.data?.markdown ?? "";
  } catch {
    return "";
  }
}
