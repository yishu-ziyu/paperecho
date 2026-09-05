/**
 * 心跳 · 日子本。
 *
 * 玩家不在的日子，这个人仍按自己的日子写。打开游戏或再来找他时，
 * 用上一回写下的日期和今天相减，一次补上。不必开着页面一直跑。
 * 按人分本，存在 localStorage `paper-echo-heartbeat-v1`，刷新还在。
 * 每一页的正文来自模型（或测试里的假模型）。模型没回来这一天不写，下次再问。
 */
import { companionFromJourney, stableName } from "./companion.ts";
import type { EmotionId, Journey } from "./types.ts";

export const HEARTBEAT_KEY = "paper-echo-heartbeat-v1";
const VERSION = 2;
const CATCH_UP_CAP = 30;
const DAYS_KEPT = 60;
const LONGING = /想你|我想你|很想你|你还好|我懂你|接住|加油|不是一个人/;

export interface DayPage {
  date: string;
  text: string;
}

export interface Daybook {
  name: string;
  city: string;
  lastEcho: string;
  lastYou: string;
  lastEmotions: EmotionId[];
  page: string;
  days: DayPage[];
  lastWritten: string;
}

export type StoreLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const SHANGHAI = "Asia/Shanghai";

/** 旧 writeDay / growAwayThing 句池。不能再当他的一天或开口。 */
const CANNED_DAY =
  /今天还在原处，我路过看了一眼|那件事我没动|还搁着，灯我拧暗了|我又一个人过了一天，没拆开|白天没出门，那件事还搁着|夜里我还是一个人把灯拧暗了|那晚的事我又一个人过了一[天遍]|我后来自己又碰过一次，还搁在原处|我过后又一个人过了一遍|今晚又改到很晚|屋里还是我自己/;

export function isCannedDay(text: string): boolean {
  return CANNED_DAY.test(text.trim());
}

/** 产品路径把这一天交给模型；单测注入假回复。空则这一天不写。 */
export type DaySpeaker = (input: {
  date: string;
  prev: string;
  name: string;
  city: string;
  lastEcho: string;
  lastYou: string;
  lastEmotions: EmotionId[];
  days: DayPage[];
}) => Promise<string | null | undefined> | string | null | undefined;

function browserStore(): StoreLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function todayStamp(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: SHANGHAI });
}

export function addDays(stamp: string, n: number): string {
  const [y, mo, d] = stamp.split("-").map(Number);
  return todayStamp(new Date(Date.UTC(y!, (mo ?? 1) - 1, (d ?? 1) + n)));
}

/** 上一回之后、今天为止（不含上一回，含今天）。 */
export function missingDays(lastWritten: string, today: string, cap = CATCH_UP_CAP): string[] {
  if (!lastWritten || !today || lastWritten >= today) return [];
  const all: string[] = [];
  let cur = addDays(lastWritten, 1);
  while (cur <= today) {
    all.push(cur);
    cur = addDays(cur, 1);
    if (all.length > 400) break;
  }
  return all.length <= cap ? all : all.slice(-cap);
}

function clipLine(text: string): string {
  return text.trim().slice(0, 56);
}

function keepLine(text: string): string {
  const line = clipLine(text);
  if (!line || LONGING.test(line) || isCannedDay(line)) return "";
  return line;
}

function uniqueDays(days: DayPage[]): DayPage[] {
  const map = new Map<string, string>();
  for (const d of days) {
    if (!d?.date || typeof d.text !== "string") continue;
    map.set(d.date, d.text);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, text]) => ({ date, text }));
}

/** 只收下模型这一句。空、句池、上一句、lastEcho 都不许冒充新的一天。 */
export function writeDay(prev: string, date: string, spoken?: string | null, lastEcho = ""): string {
  void date;
  const line = keepLine(spoken ?? "");
  if (!line) return "";
  if (line === clipLine(prev) || line === clipLine(lastEcho)) return "";
  return line;
}

export function speakFromDays(book: Daybook): string {
  for (let i = book.days.length - 1; i >= 0; i--) {
    const line = keepLine(book.days[i]?.text ?? "");
    if (line) return line;
  }
  return keepLine(book.page) || keepLine(book.lastEcho);
}

function lastSuccessfulLine(book: Daybook): string {
  for (let i = book.days.length - 1; i >= 0; i--) {
    const raw = clipLine(book.days[i]?.text ?? "");
    if (raw) return raw;
  }
  return clipLine(book.page) || clipLine(book.lastEcho);
}

/** 回访第一句：模型新说；空了或原样上一句，再用本里最后一句成功的话。不许空白。 */
export function openingLine(
  spoken: string | null | undefined,
  book: Daybook | null | undefined,
  lastEcho = "",
): string {
  const live = keepLine(spoken ?? "");
  const fromBook = book ? lastSuccessfulLine(book) : "";
  if (live && live !== clipLine(lastEcho) && live !== fromBook) return live;
  if (fromBook) return fromBook;
  return clipLine(lastEcho);
}

/** 今晚桌上的回声。空串不是复读，要重问后再顶。只挡住与上一句完全相同。 */
export function nightLine(
  spoken: string | null | undefined,
  lastEcho = "",
  book?: Daybook | null,
): string {
  const prev = clipLine(lastEcho);
  const live = clipLine(spoken ?? "");
  if (live && live !== prev) return live;
  if (!book) return "";
  for (let i = book.days.length - 1; i >= 0; i--) {
    const raw = clipLine(book.days[i]?.text ?? "");
    if (raw && raw !== prev) return raw;
  }
  const page = clipLine(book.page);
  if (page && page !== prev) return page;
  const echo = clipLine(book.lastEcho);
  if (echo && echo !== prev) return echo;
  return "";
}

export function seedDaybook(input: {
  name: string;
  city: string;
  lastEcho: string;
  lastYou: string;
  lastEmotions: EmotionId[];
  page: string;
  on: string;
}): Daybook {
  const text = (input.page || input.lastEcho).trim().slice(0, 56);
  return {
    name: stableName(input.name),
    city: input.city,
    lastEcho: input.lastEcho,
    lastYou: input.lastYou,
    lastEmotions: input.lastEmotions,
    page: text,
    days: text ? [{ date: input.on, text }] : [],
    lastWritten: input.on,
  };
}

export async function catchUp(book: Daybook, today: string, speak?: DaySpeaker): Promise<Daybook> {
  const dates = missingDays(book.lastWritten, today);
  const byDate = new Map(uniqueDays(book.days).map((d) => [d.date, d.text]));
  if (!dates.length) {
    const days = uniqueDays(book.days).slice(-DAYS_KEPT);
    const last = days.at(-1);
    return {
      ...book,
      days,
      page: last?.text || book.page,
      lastWritten: book.lastWritten,
    };
  }
  let prev =
    keepLine(byDate.get(book.lastWritten) || "") || keepLine(book.page) || keepLine(book.lastEcho);
  const filled: DayPage[] = [];
  let written = book.lastWritten;
  for (const date of dates) {
    const voiced = speak
      ? await speak({
          date,
          prev,
          name: book.name,
          city: book.city,
          lastEcho: book.lastEcho,
          lastYou: book.lastYou,
          lastEmotions: book.lastEmotions,
          days: uniqueDays([...book.days, ...filled]),
        })
      : null;
    const text = writeDay(prev, date, voiced ?? null, book.lastEcho);
    if (!text) continue;
    let dup = false;
    for (const [d, t] of byDate) {
      if (d !== date && t === text) {
        dup = true;
        break;
      }
    }
    if (dup) continue;
    byDate.set(date, text);
    filled.push({ date, text });
    prev = text;
    if (date === addDays(written, 1)) written = date;
  }
  const days = uniqueDays(
    [...byDate.entries()].map(([date, text]) => ({ date, text })),
  ).slice(-DAYS_KEPT);
  const last = days.at(-1);
  return {
    ...book,
    days,
    page: keepLine(byDate.get(written) || "") || last?.text || book.page,
    lastWritten: written,
  };
}

function upsertToday(book: Daybook, today: string, text: string): Daybook {
  const line = keepLine(text) || keepLine(book.lastEcho);
  const days = uniqueDays([
    ...book.days.filter((d) => d.date !== today),
    ...(line ? [{ date: today, text: line }] : []),
  ]).slice(-DAYS_KEPT);
  const last = days.at(-1);
  return {
    ...book,
    page: line || book.page,
    days,
    lastWritten: last?.date || today,
  };
}

/** 聊完离开：更新这个人的日子本，今天这一页写成他刚过的那件。 */
export async function recordTalk(
  book: Daybook | null,
  talk: {
    name: string;
    city: string;
    lastEcho: string;
    lastYou: string;
    lastEmotions: EmotionId[];
    page: string;
  },
  today: string,
  speak?: DaySpeaker,
): Promise<Daybook> {
  const base =
    book ??
    seedDaybook({
      ...talk,
      on: today,
    });
  const named: Daybook = {
    ...base,
    name: stableName(talk.name),
    city: talk.city,
    lastEcho: talk.lastEcho,
    lastYou: talk.lastYou,
    lastEmotions: talk.lastEmotions,
  };
  return upsertToday(await catchUp(named, today, speak), today, talk.page);
}

function asBook(raw: unknown): Daybook | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Daybook;
  if (!b.name || !Array.isArray(b.days) || !b.lastWritten) return null;
  return {
    name: stableName(b.name),
    city: typeof b.city === "string" ? b.city : "",
    lastEcho: typeof b.lastEcho === "string" ? b.lastEcho : "",
    lastYou: typeof b.lastYou === "string" ? b.lastYou : "",
    lastEmotions: Array.isArray(b.lastEmotions) ? b.lastEmotions : [],
    page: typeof b.page === "string" ? b.page : "",
    days: uniqueDays(
      b.days.filter((d): d is DayPage => Boolean(d) && typeof d.date === "string" && typeof d.text === "string"),
    ),
    lastWritten: b.lastWritten,
  };
}

export function loadBooks(storage: StoreLike | null = browserStore()): Record<string, Daybook> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(HEARTBEAT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { version?: number; book?: unknown; books?: Record<string, unknown> };
    if (parsed.books && typeof parsed.books === "object") {
      const out: Record<string, Daybook> = {};
      for (const [k, v] of Object.entries(parsed.books)) {
        const b = asBook(v);
        if (b) out[stableName(b.name || k)] = b;
      }
      return out;
    }
    const one = asBook(parsed.book);
    return one ? { [stableName(one.name)]: one } : {};
  } catch {
    return {};
  }
}

export function loadDaybook(storage: StoreLike | null = browserStore(), name?: string): Daybook | null {
  const books = loadBooks(storage);
  if (name) return books[stableName(name)] ?? null;
  const vals = Object.values(books);
  return vals[0] ?? null;
}

function mergeBooks(prev: Daybook, next: Daybook): Daybook {
  const byDate = new Map(uniqueDays(prev.days).map((d) => [d.date, d.text]));
  for (const d of uniqueDays(next.days)) {
    const incoming = d.text.trim();
    if (!incoming) continue;
    if (!byDate.has(d.date) || next.lastWritten >= d.date) byDate.set(d.date, incoming);
  }
  const days = uniqueDays([...byDate.entries()].map(([date, text]) => ({ date, text }))).slice(-DAYS_KEPT);
  const lastWritten = prev.lastWritten > next.lastWritten ? prev.lastWritten : next.lastWritten;
  const last = days.at(-1);
  return {
    ...next,
    days,
    page: keepLine(byDate.get(lastWritten) || "") || last?.text || next.page || prev.page,
    lastWritten,
  };
}

export function persistDaybook(book: Daybook, storage: StoreLike | null = browserStore()): void {
  if (!storage) return;
  const books = loadBooks(storage);
  const key = stableName(book.name);
  const prev = books[key];
  books[key] = prev ? mergeBooks(prev, book) : book;
  storage.setItem(HEARTBEAT_KEY, JSON.stringify({ version: VERSION, books }));
}

function leftoverByName(journeys: Journey[]): Map<string, Journey> {
  const map = new Map<string, Journey>();
  for (const j of journeys) {
    if (!j?.echo) continue;
    const n = stableName(j.echo.name);
    if (!map.has(n)) map.set(n, j);
  }
  return map;
}

/** 打开游戏或再来找他：按今天一次补上缺的日子。可只补一个人。 */
export async function pulseHeartbeat(
  now = new Date(),
  journeys: Journey[] = [],
  storage: StoreLike | null = browserStore(),
  speak?: DaySpeaker,
  focusName?: string,
): Promise<Daybook | null> {
  const today = todayStamp(now);
  const books = loadBooks(storage);
  const leftover = leftoverByName(journeys);
  const names = new Set<string>();
  if (focusName?.trim()) names.add(stableName(focusName));
  else {
    for (const k of Object.keys(books)) names.add(k);
    for (const k of leftover.keys()) names.add(k);
  }
  let focus: Daybook | null = null;
  for (const name of names) {
    let book = books[name];
    if (!book) {
      const j = leftover.get(name);
      if (!j) continue;
      const c = companionFromJourney(j);
      book = seedDaybook({
        name: c.name,
        city: c.city,
        lastEcho: c.lastEcho,
        lastYou: c.lastYou,
        lastEmotions: c.lastEmotions,
        page: c.awayThing || c.lastEcho,
        on: todayStamp(new Date(j.createdAt)),
      });
    }
    const next = await catchUp(book, today, speak);
    persistDaybook(next, storage);
    if (!focusName || stableName(next.name) === stableName(focusName)) focus = next;
  }
  return focus;
}
