import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catchUp,
  HEARTBEAT_KEY,
  isCannedDay,
  loadBooks,
  loadDaybook,
  missingDays,
  nightLine,
  openingLine,
  persistDaybook,
  pulseHeartbeat,
  recordTalk,
  seedDaybook,
  speakFromDays,
  todayStamp,
  writeDay,
  type Daybook,
  type DaySpeaker,
  type StoreLike,
} from "./heartbeat.ts";
import type { Journey } from "./types.ts";

function memoryStore(start: Record<string, string> = {}): StoreLike & { data: Record<string, string> } {
  const data = { ...start };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

function book(over: Partial<Daybook> = {}): Daybook {
  return seedDaybook({
    name: "林予",
    city: "杭州",
    lastEcho: "十七稿我打成一包，塞进抽屉最下层。",
    lastYou: "灯我也没关",
    lastEmotions: ["tired"],
    page: "抽屉我后来自己又碰过一次，还搁在原处。",
    on: "2026-08-25",
    ...over,
  });
}

const fakeSpeak: DaySpeaker = ({ name, date }) => `${name}在${date}自己过了一天。`;

function journeyOf(name: string, city: string, createdAt: number): Journey {
  return {
    id: `j-${name}`,
    createdAt,
    fingerprint: [{ id: "tired", closeness: 0.8 }],
    mirror: "灯我也没关",
    letter: "灯我也没关",
    chips: [],
    region: "east",
    echo: {
      name,
      city,
      felt: "",
      greeting: `${name}开口。`,
      replies: [],
      returnLetter: "灯还开着。",
      source: "archive",
      awayThing: `${name}后来自己又过了一件。`,
    },
    transcript: [
      { who: "echo", text: `${name}开口。` },
      { who: "you", text: "灯我也没关" },
    ],
    returnLetter: "灯还开着。",
    awayThing: `${name}后来自己又过了一件。`,
  };
}

describe("heartbeat daybook", () => {
  it("fills 3 missing days from the model and the greeting is the last one", async () => {
    const start = book();
    assert.equal(missingDays("2026-08-25", "2026-08-28").join(","), "2026-08-26,2026-08-27,2026-08-28");
    const next = await catchUp(start, "2026-08-28", fakeSpeak);
    const added = next.days.filter((d) => d.date > "2026-08-25");
    assert.equal(added.length, 3);
    assert.equal(next.lastWritten, "2026-08-28");
    const greet = speakFromDays(next);
    assert.equal(greet, "林予在2026-08-28自己过了一天。");
    assert.ok(added.every((d) => d.text.includes("林予在") && d.text.includes("自己过了一天")));
    assert.equal(/想你|我是林予|你好|Mara|Jonah/.test(added.map((d) => d.text).join("\n") + greet), false);
    assert.notEqual(greet, "我改了十七稿方案，群里只回了收到。");
    const again = await catchUp(next, "2026-08-28", fakeSpeak);
    assert.equal(again.days.length, next.days.length);
  });

  it("only keeps a model line; empty spoken is not a new day", () => {
    const a = writeDay("十七稿我打成一包，塞进抽屉最下层。", "2026-08-26", "抽屉我下午又拉开过，没把那包拿出来。");
    assert.equal(a, "抽屉我下午又拉开过，没把那包拿出来。");
    assert.equal(writeDay(a, "2026-08-27", null), "");
    assert.equal(writeDay(a, "2026-08-27", "  "), "");
    assert.equal(writeDay(a, "2026-08-27", "白天没出门，那件事还搁着。"), "");
    assert.equal(writeDay(a, "2026-08-27", a), "");
    assert.equal(writeDay(a, "2026-08-27", "十七稿我打成一包，塞进抽屉最下层。", "十七稿我打成一包，塞进抽屉最下层。"), "");
  });

  it("survives persist and load of two books", async () => {
    const store = memoryStore();
    const lin = await catchUp(book(), "2026-08-28", fakeSpeak);
    persistDaybook(lin, store);
    persistDaybook(
      seedDaybook({
        name: "Mara",
        city: "Lisbon",
        lastEcho: "窗开着。我在群里打了又删。",
        lastYou: "我也是",
        lastEmotions: ["lonely"],
        page: "窗还开着。",
        on: "2026-08-25",
      }),
      store,
    );
    assert.ok(store.data[HEARTBEAT_KEY]);
    const loaded = loadDaybook(store, "林予");
    const mara = loadDaybook(store, "Mara");
    assert.equal(loaded?.name, "林予");
    assert.equal(loaded?.lastWritten, "2026-08-28");
    assert.equal(loaded?.days.length, 4);
    assert.equal(speakFromDays(loaded!), speakFromDays(lin));
    assert.equal(mara?.name, "Mara");
    assert.equal(mara?.lastWritten, "2026-08-25");
    assert.equal(Object.keys(loadBooks(store)).sort().join(","), "Mara,林予");
  });

  it("catching up A does not rewrite B", async () => {
    const store = memoryStore();
    persistDaybook(book(), store);
    persistDaybook(
      seedDaybook({
        name: "Mara",
        city: "Lisbon",
        lastEcho: "窗开着。我在群里打了又删。",
        lastYou: "我也是",
        lastEmotions: ["lonely"],
        page: "窗还开着。",
        on: "2026-08-25",
      }),
      store,
    );
    const onlyA: DaySpeaker = ({ name, date }) => (name === "林予" ? `林予补了${date}` : `不该写到B ${date}`);
    const pulsed = await pulseHeartbeat(new Date(2026, 7, 28), [], store, onlyA, "林予");
    assert.equal(pulsed?.name, "林予");
    const lin = loadDaybook(store, "林予");
    const mara = loadDaybook(store, "Mara");
    assert.equal(lin?.lastWritten, "2026-08-28");
    assert.ok(lin?.days.some((d) => d.text.includes("林予补了")));
    assert.equal(mara?.lastWritten, "2026-08-25");
    assert.equal(mara?.page, "窗还开着。");
    assert.equal(mara?.days.length, 1);
    assert.equal(mara?.days.some((d) => d.text.includes("林予") || d.text.includes("不该写到B")), false);
  });

  it("talking today writes today's page; later catch-up keeps the name", async () => {
    const store = memoryStore();
    const afterTalk = await recordTalk(null, {
      name: "林予",
      city: "杭州",
      lastEcho: "十七稿我打成一包，塞进抽屉最下层。",
      lastYou: "我也是",
      lastEmotions: ["tired"],
      page: "抽屉我后来自己又碰过一次，还搁在原处。",
    }, "2026-08-25");
    persistDaybook(afterTalk, store);
    assert.equal(afterTalk.lastYou, "我也是");
    const pulsed = await pulseHeartbeat(new Date(2026, 7, 28), [], store, fakeSpeak);
    assert.ok(pulsed);
    assert.equal(pulsed.name, "林予");
    assert.equal(pulsed.days.filter((d) => d.date > "2026-08-25").length, 3);
    assert.equal(speakFromDays(pulsed), pulsed.days.at(-1)?.text);
    assert.match(speakFromDays(pulsed), /林予在2026-08-28/);
  });

  it("seeds two leftover journeys into two books", async () => {
    const store = memoryStore();
    const pulsed = await pulseHeartbeat(
      new Date(2026, 7, 28),
      [
        journeyOf("Mara", "Lisbon", new Date(2026, 7, 25).getTime()),
        journeyOf("林予", "杭州", new Date(2026, 7, 24).getTime()),
      ],
      store,
      fakeSpeak,
    );
    assert.ok(pulsed);
    const lin = loadDaybook(store, "林予");
    const mara = loadDaybook(store, "Mara");
    assert.equal(lin?.name, "林予");
    assert.equal(mara?.name, "Mara");
    assert.ok(lin?.days.some((d) => d.text.includes("林予")));
    assert.ok(mara?.days.some((d) => d.text.includes("Mara")));
    assert.equal(lin?.days.some((d) => d.text.includes("Mara")), false);
  });

  it("migrates the old single-book store", () => {
    const store = memoryStore();
    const old = book();
    store.setItem(HEARTBEAT_KEY, JSON.stringify({ version: 1, book: old }));
    const loaded = loadDaybook(store, "林予");
    assert.equal(loaded?.name, "林予");
    assert.equal(loaded?.lastWritten, "2026-08-25");
  });

  it("calls the model once per missing day with different lines", async () => {
    const called: string[] = [];
    let n = 0;
    const speak: DaySpeaker = ({ date }) => {
      called.push(date);
      n += 1;
      return `模型第${n}句 ${date}`;
    };
    const next = await catchUp(book(), "2026-08-28", speak);
    assert.deepEqual(called, ["2026-08-26", "2026-08-27", "2026-08-28"]);
    const added = next.days.filter((d) => d.date > "2026-08-25");
    assert.equal(added.length, 3);
    const texts = added.map((d) => d.text);
    assert.deepEqual(texts, ["模型第1句 2026-08-26", "模型第2句 2026-08-27", "模型第3句 2026-08-28"]);
    assert.equal(new Set(texts).size, 3);
    assert.equal(next.lastWritten, "2026-08-28");
  });

  it("without a model, does not copy the previous line into new dates", async () => {
    const prev = "十七稿我打成一包，塞进抽屉最下层。";
    const original28 = "抽屉我后来自己又碰过一次，还搁在原处。";
    const start = book({ lastEcho: prev, page: prev });
    const next = await catchUp(start, "2026-08-28");
    const added = next.days.filter((d) => d.date > "2026-08-25");
    assert.equal(added.length, 0);
    assert.equal(next.lastWritten, "2026-08-25");
    assert.equal(
      next.days.some((d) => d.date > "2026-08-25" && d.text === prev),
      false,
    );
    const nullSpeak: DaySpeaker = () => null;
    const copies = await catchUp(
      {
        ...start,
        days: [
          { date: "2026-08-25", text: prev },
          { date: "2026-08-26", text: prev },
          { date: "2026-08-27", text: prev },
          { date: "2026-08-28", text: original28 },
        ],
      },
      "2026-08-28",
      nullSpeak,
    );
    assert.equal(copies.lastWritten, "2026-08-25");
    assert.equal(copies.days.length, 4);
    assert.equal(
      copies.days.some((d) => d.date === "2026-08-28" && d.text === original28),
      true,
    );
    assert.deepEqual(
      copies.days.map((d) => d.date),
      ["2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"],
    );
    const store = memoryStore();
    persistDaybook(copies, store);
    const loaded = loadDaybook(store, "林予");
    assert.equal(loaded?.days.length, 4);
    assert.equal(loaded?.days.some((d) => d.date === "2026-08-28"), true);
  });

  it("persist does not drop later days or retreat lastWritten", () => {
    const store = memoryStore();
    const filled = book();
    filled.lastWritten = "2026-08-28";
    filled.page = "模型写了2026-08-28";
    filled.days = [
      { date: "2026-08-25", text: "十七稿我打成一包，塞进抽屉最下层。" },
      { date: "2026-08-26", text: "模型写了2026-08-26" },
      { date: "2026-08-27", text: "模型写了2026-08-27" },
      { date: "2026-08-28", text: "模型写了2026-08-28" },
    ];
    persistDaybook(filled, store);
    persistDaybook(
      {
        ...filled,
        lastWritten: "2026-08-25",
        page: filled.days[0]!.text,
        days: [filled.days[0]!],
      },
      store,
    );
    const loaded = loadDaybook(store, "林予");
    assert.equal(loaded?.lastWritten, "2026-08-28");
    assert.equal(loaded?.days.length, 4);
    assert.equal(loaded?.days.some((d) => d.date === "2026-08-28"), true);
  });

  it("empty spoken is not a repeat; table gets a visible daybook line", () => {
    const start = book();
    const last = start.lastEcho;
    const other = "抽屉我下午又拉开过，没把那包拿出来。";
    start.days = [
      { date: "2026-08-25", text: last },
      { date: "2026-08-28", text: other },
    ];
    start.page = other;
    assert.equal(nightLine("", last, start), other);
    assert.equal(nightLine("   ", last, start), other);
    assert.equal(nightLine(last, last, start), other);
    assert.equal(nightLine("窗还开着，灯我后来拧暗了。", last, start), "窗还开着，灯我后来拧暗了。");
    assert.ok(nightLine("", last, start).trim());
    assert.notEqual(nightLine("", last, start), last);
  });

  it("empty greet is not written as the first line", () => {
    const start = book();
    const line = openingLine("", start, start.lastEcho);
    assert.ok(line.trim());
    assert.notEqual(line, "");
    assert.equal(line, start.days.at(-1)?.text);
    assert.equal(openingLine("   ", start, "上一句还在"), start.days.at(-1)?.text);
    assert.equal(openingLine(start.lastEcho, start, start.lastEcho), start.days.at(-1)?.text);
    assert.equal(
      openingLine("窗还开着，灯我后来拧暗了。", start, start.lastEcho),
      "窗还开着，灯我后来拧暗了。",
    );
    const canned = book({
      page: "白天没出门，那件事还搁着。",
      lastEcho: "",
    });
    canned.days = [{ date: "2026-08-25", text: "白天没出门，那件事还搁着。" }];
    const fallback = openingLine("", canned, "");
    assert.ok(fallback.trim());
    assert.equal(fallback, "白天没出门，那件事还搁着。");
  });

  it("Shanghai calendar: UTC 16:30 on the 27th is still 28, and lastWritten 25 fills 26/27/28 once", async () => {
    const now = new Date("2026-08-27T16:30:00.000Z");
    assert.equal(todayStamp(now), "2026-08-28");
    const store = memoryStore();
    const stale = book();
    stale.lastWritten = "2026-08-25";
    stale.page = "白天没出门，那件事还搁着。";
    stale.days = [
      { date: "2026-08-25", text: "白天没出门，那件事还搁着。" },
      { date: "2026-08-27", text: "白天没出门，那件事还搁着。" },
      { date: "2026-08-27", text: "夜里我还是一个人把灯拧暗了。" },
    ];
    persistDaybook(stale, store);
    const called: string[] = [];
    const speak: DaySpeaker = ({ date }) => {
      called.push(date);
      return `模型写了${date}`;
    };
    const pulsed = await pulseHeartbeat(now, [], store, speak, "林予");
    assert.ok(pulsed);
    assert.deepEqual(called, ["2026-08-26", "2026-08-27", "2026-08-28"]);
    const dates = pulsed.days.map((d) => d.date);
    assert.deepEqual(
      dates.filter((d) => d > "2026-08-25"),
      ["2026-08-26", "2026-08-27", "2026-08-28"],
    );
    assert.equal(dates.filter((d) => d === "2026-08-27").length, 1);
    assert.equal(pulsed.lastWritten, "2026-08-28");
    assert.equal(speakFromDays(pulsed), "模型写了2026-08-28");
    assert.equal(
      pulsed.days
        .filter((d) => d.date > "2026-08-25")
        .some((d) => isCannedDay(d.text) || d.text.includes("白天没出门")),
      false,
    );
  });

  it("store and match read the daybook, MiniMax voice, no generation pool", async () => {
    const { readFile } = await import("node:fs/promises");
    const store = await readFile(new URL("./store.ts", import.meta.url), "utf8");
    const chains = await readFile(new URL("./agent/chains.ts", import.meta.url), "utf8");
    const shell = await readFile(new URL("./GameShell.tsx", import.meta.url), "utf8");
    const hb = await readFile(new URL("./heartbeat.ts", import.meta.url), "utf8");
    const voice = await readFile(new URL("./voice.ts", import.meta.url), "utf8");
    const respond = await readFile(new URL("./agent/pipeline/respond.ts", import.meta.url), "utf8");
    const config = await readFile(new URL("./agent/config.ts", import.meta.url), "utf8");
    assert.match(store, /pulseHeartbeat/);
    assert.match(store, /recordTalk/);
    assert.match(store, /speakDay/);
    assert.match(store, /speakGreet/);
    assert.match(store, /openingLine/);
    assert.match(store, /nightLine/);
    assert.match(store, /speakTurn/);
    assert.equal(/parroted\(spoken/.test(store), false);
    assert.equal(/speakFromDays/.test(store), false);
    assert.equal(/lineForLayer/.test(store), false);
    assert.match(chains, /kind: "greet"/);
    assert.match(chains, /kind: "turn"/);
    assert.match(chains, /askTurnLive/);
    assert.match(chains, /voiceAsPerson/);
    assert.match(chains, /nightLine/);
    assert.match(chains, /via !== "live"/);
    assert.match(voice, /ask\("turn"/);
    assert.match(shell, /pulseHeartbeat/);
    assert.match(shell, /speakDay/);
    assert.match(voice, /runVoice/);
    assert.match(voice, /speakGreet/);
    assert.match(voice, /ask\("greet"/);
    assert.match(respond, /voiceAsPerson/);
    assert.match(respond, /llmReply/);
    assert.match(hb, /Asia\/Shanghai/);
    assert.match(hb, /openingLine/);
    assert.equal(/byDate\.delete/.test(hb), false);
    assert.match(config, /MINIMAX_CN_API_KEY/);
    assert.equal(/const noObj|const withObj|pool\[n %/.test(hb), false);
  });
});
