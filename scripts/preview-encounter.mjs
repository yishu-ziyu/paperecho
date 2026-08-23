#!/usr/bin/env node
/**
 * 聊天页静帧。注入的句子来自 2026-08-23 真跑：
 * 模型步空正文，桌上实际是本地故事卡 林予，ownLine 按层递出。
 * 390×844。先 npm run dev，再：node scripts/preview-encounter.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { pull } from "./play-gestures.mjs";

const url = process.env.PLAY_URL || "http://127.0.0.1:8080/";
const out = process.env.PREVIEW_OUT || "/workspace/docs/previews";
mkdirSync(out, { recursive: true });

const echo = {
  name: "林予",
  city: "杭州",
  felt: "",
  greeting: "十七稿我打成一包，塞进抽屉最下层。",
  replies: [
    "十七稿我打成一包，塞进抽屉最下层。",
    "那句收到我到现在都没回。",
  ],
  returnLetter: "你那句「我把灯留着，像在等一个不存在的点」我还留着。灯还开着。",
  source: "archive",
};

const first = [{ who: "echo", text: echo.greeting }];
const waiting = [
  ...first,
  { who: "you", text: "我改到凌晨，群里只回了收到，灯还开着。" },
];
const table = [
  ...waiting,
  { who: "echo", text: "十七稿我打成一包，塞进抽屉最下层。" },
  { who: "you", text: "那几页我塞进抽屉最下层，到现在都没打开。" },
  { who: "echo", text: "那句收到我到现在都没回。" },
];

const browser = await chromium.launch({ headless: true });

async function boot(reducedMotion) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion,
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__echoGame), null, { timeout: 20000 });
  await page.waitForTimeout(360);
  return page;
}

async function apply(page, patch) {
  await page.evaluate((next) => {
    const store = window.__echoGame;
    if (!store) throw new Error("no __echoGame");
    store.setState(next);
  }, patch);
}

async function shot(page, name) {
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("wrote", name);
}

const motion = await boot("no-preference");
await apply(motion, { phase: "orbit" });
await motion.waitForTimeout(80);
await apply(motion, {
  phase: "encounter",
  searching: false,
  echo,
  round: 0,
  waitingEcho: false,
  recall: first,
  suggestions: [],
  region: "east",
  exchange: { unlocked: 1, silentTurns: 0 },
  fingerprint: [
    { id: "unseen", closeness: 0.86 },
    { id: "tired", closeness: 0.71 },
  ],
  selectedMirror: "群里只回了收到，灯还开着。",
});
await motion.waitForTimeout(180);
await shot(motion, "10-encounter-listen");
await motion.waitForTimeout(720);
await shot(motion, "11-encounter-speak");

const stable = await boot("reduce");
await apply(stable, {
  phase: "encounter",
  searching: false,
  echo,
  round: 1,
  waitingEcho: true,
  recall: waiting,
  suggestions: [],
  region: "east",
  exchange: { unlocked: 2, silentTurns: 0 },
  fingerprint: [
    { id: "unseen", closeness: 0.86 },
    { id: "tired", closeness: 0.71 },
  ],
});
await shot(stable, "12-encounter-wait");

await apply(stable, {
  phase: "encounter",
  waitingEcho: false,
  round: 2,
  recall: table,
  suggestions: [],
  exchange: { unlocked: 3, silentTurns: 0 },
  judgeOpen: false,
});
await shot(stable, "13-encounter-table");

await apply(stable, {
  judgeOpen: true,
  meter: {
    prompt: 0,
    completion: 0,
    total: 0,
    model: "DeepSeek-V4-Flash-0731",
    via: "archive",
    node: "match",
  },
  hits: [
    "跟你一样想被看见、疲惫的人",
    "我改了十七稿方案，群里只回了一句收到",
    "十七稿我打成一包，塞进抽屉最下层。",
  ],
  core: { human: "", persona: "你是林予，在杭州。" },
});
await shot(stable, "14-encounter-judge");

await apply(stable, {
  judgeOpen: false,
  phase: "return",
  echo,
  region: "east",
  scorch: 1,
});
await stable.waitForTimeout(720);
await pull(stable, "return", 0, 50);
await shot(stable, "15-encounter-return");

await browser.close();
console.log("done", out);
