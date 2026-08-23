#!/usr/bin/env node
/**
 * Capture one still of each playable module for docs/previews/.
 * Injects store state — does not replay gestures.
 * Aligned with main after compose was removed (orbit → fold).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const url = process.env.PLAY_URL || "http://127.0.0.1:8080/";
const out = process.env.PREVIEW_OUT || "/workspace/docs/previews";
mkdirSync(out, { recursive: true });

const echo = {
  name: "林予",
  city: "杭州",
  felt: "灯还开着，像在等一个不存在的点头",
  greeting: "十七稿我打成一包，塞进抽屉最下层。",
  replies: ["那句收到我到现在都没回。", "灯还开着。我没关。"],
  returnLetter: "抽屉那包还在。你要是也有一包，先别扔。",
  source: "archive",
};

const journey = {
  id: "j-preview",
  createdAt: Date.now() - 86400000,
  fingerprint: [{ id: "unseen", closeness: 0.86 }, { id: "tired", closeness: 0.71 }],
  mirror: "群里只回了收到，灯还开着。",
  letter: "群里只回了收到，灯还开着。",
  chips: [],
  region: "east",
  echo,
  transcript: [
    { who: "echo", text: echo.greeting },
    { who: "you", text: "群里只回了收到，灯还开着。" },
    { who: "echo", text: "那句收到我到现在都没回。" },
  ],
  returnLetter: echo.returnLetter,
};

const recall = [
  { who: "echo", text: echo.greeting },
  { who: "you", text: "群里只回了收到，灯还开着。" },
  { who: "echo", text: "那句收到我到现在都没回。" },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => Boolean(window.__echoGame), null, { timeout: 15000 });
await page.waitForTimeout(400);

async function shot(name) {
  await page.waitForTimeout(280);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("wrote", name);
}

async function apply(patch) {
  await page.evaluate((next) => {
    const store = window.__echoGame;
    if (!store) throw new Error("no __echoGame");
    store.setState(next);
  }, patch);
}

await shot("01-title");

await apply({
  phase: "orbit",
  selectedMirror: "",
  personaHint: "",
});
await shot("02-orbit");

await apply({
  phase: "fold",
  folds: 1,
  selectedMirror: "群里只回了收到，灯还开着。",
  letterChips: [],
  extraLine: "",
  fingerprint: [
    { id: "unseen", closeness: 0.86 },
    { id: "tired", closeness: 0.71 },
    { id: "gloom", closeness: 0.55 },
  ],
});
await shot("03-fold");

await apply({ phase: "throw", region: "east", folds: 2 });
await shot("04-throw");

await apply({
  phase: "flight",
  searching: true,
  searchNote: "在夜里找一个也说过类似话的人",
  throwPower: 0.72,
  echo: null,
});
await shot("05-flight");

await apply({
  phase: "encounter",
  searching: false,
  echo,
  round: 1,
  waitingEcho: false,
  recall,
  suggestions: ["灯还开着", "那几页我没提", "群里只回了收到"],
  region: "east",
  exchange: { unlocked: 2, silentTurns: 0 },
});
await page.waitForTimeout(800);
await shot("06-encounter");

await apply({
  phase: "return",
  echo,
  region: "east",
  scorch: 1,
});
await shot("07-return");

await apply({
  phase: "archive",
  journeys: [journey],
  reading: journey,
  archival: [
    { id: "m1", memory: "群里只回了收到，灯还开着。", emotions: ["unseen"], createdAt: Date.now() },
    { id: "m2", memory: "改到很晚。稿还在文件夹里。", emotions: ["tired"], createdAt: Date.now() },
  ],
  judgeOpen: false,
});
await shot("08-archive");

await apply({
  phase: "encounter",
  echo,
  recall,
  suggestions: ["灯还开着", "那几页我没提"],
  judgeOpen: true,
  meter: {
    prompt: 842,
    completion: 126,
    total: 968,
    model: "DeepSeek-V4-Flash-0731",
    via: "archive",
    node: "turn-reply",
  },
  hits: ["林予 · 杭州", "改了十七稿"],
  core: { human: "玩家曾说「群里只回了收到」", persona: "你是林予，在杭州。" },
  exchange: { unlocked: 2, silentTurns: 0 },
  fingerprint: [
    { id: "unseen", closeness: 0.86 },
    { id: "tired", closeness: 0.71 },
  ],
});
await shot("09-judge");

await browser.close();
console.log("done", out);
