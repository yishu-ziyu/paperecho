#!/usr/bin/env node
/** Play two full nights. Collect loop-breakers, voice slips, and stuck verbs. */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { dragToken, pull } from "./play-gestures.mjs";

const url = process.env.PLAY_URL || "http://127.0.0.1:8080/";
const out = "/workspace/screenshots/loop";
mkdirSync(out, { recursive: true });

const NIGHTS = [
  {
    id: "n1-gloom",
    near: ["郁闷"],
    far: ["愤怒"],
    chips: 2,
    extra: "",
    pick: 0,
  },
  {
    id: "n2-wronged",
    near: ["委屈", "愤怒"],
    far: ["平静"],
    chips: 3,
    extra: "我不想被说敏感。",
    pick: 0,
  },
];

function issuesOf(text, night) {
  const issues = [];
  if (/我理解你|你并不孤单|抱抱|没关系的|你已经很勇敢|我看见你了/.test(text)) {
    issues.push("therapist-voice");
  }
  if ((text.match(/我看见/g) || []).length >= 2) issues.push("i-see-you-repeat");
  if (text.includes("……") && night.phase === "encounter") issues.push("ellipsis-on-screen");
  return issues;
}

function bleeds(text, previous) {
  if (!previous || !text) return false;
  const corpus = [previous.greeting, previous.letter, ...(previous.memories || [])]
    .map((s) => String(s || "").replace(/（.*?）/g, "").replace(/玩家曾说「|」/g, "").trim())
    .filter((s) => s.length >= 8);
  return corpus.some((line) => {
    const clip = line.slice(0, 10);
    return clip.length >= 8 && text.includes(clip) && /我/.test(text) && !/你上次|你留着|你那/.test(text);
  });
}

async function state(page) {
  return page.evaluate(() => {
    const g = window.__echoGame?.getState?.();
    if (!g) return null;
    return {
      phase: g.phase,
      folds: g.folds,
      round: g.round,
      waiting: g.waitingEcho,
      searching: g.searching,
      echo: g.echo ? { name: g.echo.name, city: g.echo.city, greeting: g.echo.greeting } : null,
      recall: g.recall,
      suggestions: g.suggestions,
      journeys: g.journeys.length,
      archival: g.archival.map((m) => m.memory).slice(0, 4),
      mirror: g.selectedMirror,
      letterChips: g.letterChips,
    };
  });
}

async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png` });
}

async function sling(page) {
  const well = page.locator("[data-throw-well]").first();
  await well.waitFor({ state: "visible", timeout: 8000 });
  const box = await well.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + 24;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 130, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

async function foldPaper(page) {
  for (let i = 0; i < 2; i++) {
    const fold = page.locator('[data-pull="fold"]').first();
    if (!(await fold.count())) break;
    const box = await fold.boundingBox();
    if (!box || box.width < 80) break;
    await page.mouse.move(box.x + box.width * 0.85, box.y + 16);
    await page.mouse.down();
    await page.mouse.move(box.x + 24, box.y + box.height - 12, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(360);
  }
  if (await page.locator('[data-pull="window"]').count()) {
    await pull(page, "window", 0, -90);
  }
}

async function night(page, persona, index, previous) {
  const log = {
    id: persona.id,
    phases: [],
    echo: null,
    greeting: "",
    replies: [],
    letter: "",
    memories: [],
    issues: [],
    errors: [],
  };
  const onErr = (e) => log.errors.push(String(e));
  page.on("pageerror", onErr);

  const s0 = await state(page);
  if (index === 0 || s0?.phase === "title") {
    await pull(page, "title", 0, 90);
  } else if (s0?.phase === "archive") {
    await pull(page, "archive", 0, -90);
  } else {
    await pull(page, "title", 0, 90);
  }
  await page.locator("[data-orbit-field]").waitFor({ timeout: 6000 });
  log.phases.push("orbit");

  for (const label of persona.near) await dragToken(page, label, 0.5, 0.52);
  for (const label of persona.far) await dragToken(page, label, 0.12, 0.18);
  await shot(page, `${persona.id}-orbit`);
  await page.locator("textarea").fill(persona.extra || "群里只回了收到，灯还开着。");
  await page.locator("[data-listen-go]").click();
  await page.locator('[data-pull="fold"]').waitFor({ timeout: 6000 });
  log.phases.push("fold");
  await page.waitForTimeout(350);
  await foldPaper(page);
  await page.locator("canvas.globe-canvas").waitFor({ timeout: 8000 });
  log.phases.push("throw");
  await shot(page, `${persona.id}-throw`);
  await page.locator("canvas.globe-canvas").click({ force: true });
  await sling(page);

  await page.locator('[data-pull="flight"]').waitFor({ timeout: 24000 });
  log.phases.push("flight");
  await shot(page, `${persona.id}-flight`);
  await pull(page, "flight", 0, 90);
  await page.locator('[data-drop="encounter"]').waitFor({ timeout: 8000 });
  log.phases.push("encounter");
  await page.waitForTimeout(1100);

  const s = await state(page);
  log.echo = s?.echo;
  log.greeting = s?.recall?.find((t) => t.who === "echo")?.text || "";
  await shot(page, `${persona.id}-encounter`);
  log.issues.push(...issuesOf(log.greeting, { phase: "encounter" }));
  if (previous && bleeds(log.greeting, previous)) log.issues.push("memory-bleed");
  if (previous && log.greeting && log.greeting === previous.greeting) log.issues.push("same-greeting");
  if (previous?.echo?.name && log.echo?.name === previous.echo.name) log.issues.push("same-echo");
  if (log.picked && log.echo?.name && log.picked !== log.echo.name) log.issues.push(`identity-swap:${log.picked}->${log.echo.name}`);

  const lines = [
    "抽屉我到现在都没再打开。",
    "我把那张截图发给自己了。",
    "群里那条我还是没回。",
  ];
  for (let r = 0; r < 3; r++) {
    const you = lines[r];
    const box = page.locator("textarea").first();
    await box.waitFor({ timeout: 14000 }).catch(() => log.issues.push(`no-input-round-${r}`));
    if (!(await box.count())) {
      const st = await state(page);
      if (st?.phase === "return") break;
      break;
    }
    await box.fill(you);
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(() => {
      const g = window.__echoGame?.getState?.();
      return g && (!g.waitingEcho || g.phase === "return");
    }, { timeout: 18000 }).catch(() => log.issues.push(`waiting-stuck-round-${r}`));
    await page.waitForTimeout(350);
    const st = await state(page);
    const echoLine = [...(st?.recall || [])].reverse().find((t) => t.who === "echo")?.text || "";
    log.replies.push({ you, echo: echoLine });
    log.issues.push(...issuesOf(echoLine, { phase: "encounter" }));
    if (previous && bleeds(echoLine, previous)) log.issues.push(`memory-bleed-round-${r}`);
    if (you && echoLine && (echoLine === you || echoLine.includes(you))) log.issues.push(`parrot-round-${r}`);
    if (st?.phase === "return") break;
  }
  if (log.replies.length >= 2 && log.replies.every((r) => r.echo === log.replies[0].echo)) {
    log.issues.push("echo-repeat");
  }

  await page.locator('[data-pull="return"]').waitFor({ timeout: 16000 });
  log.phases.push("return");
  await shot(page, `${persona.id}-return`);
  // open
  await pull(page, "return", 0, 70);
  await page.waitForTimeout(280);
  const letter = await page.locator("[data-pull=return] p").first().innerText().catch(() => "");
  log.letter = letter.slice(0, 240);
  log.issues.push(...issuesOf(letter, { phase: "return" }));
  if (letter.length > 90) log.issues.push("return-letter-long");
  await shot(page, `${persona.id}-return-open`);
  // file into drawer
  await pull(page, "return", 0, 150);
  await page.waitForTimeout(500);
  const after = await state(page);
  if (after?.phase !== "archive") {
    log.issues.push(`return-did-not-file:${after?.phase}`);
    // last resort: call save if stuck
    await page.evaluate(() => window.__echoGame?.getState?.().saveReturn?.());
    await page.waitForTimeout(400);
  }
  log.phases.push("archive");
  await shot(page, `${persona.id}-archive`);
  const body = await page.locator("body").innerText();
  const stA = await state(page);
  log.memories = stA?.archival || [];
  if (index > 0 && !log.memories.length) log.issues.push("memories-missing-on-return-visit");
  if (!body.includes("这一晚说过的") && !body.includes("空白的一张")) {
    log.issues.push("archive-copy-missing");
  }
  log.issues.push(...issuesOf(body, { phase: "archive" }));

  page.off("pageerror", onErr);
  return log;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

const results = [];
for (let i = 0; i < NIGHTS.length; i++) {
  try {
    results.push(await night(page, NIGHTS[i], i, results[i - 1]));
  } catch (err) {
    const st = await state(page).catch(() => null);
    await shot(page, `${NIGHTS[i].id}-crash`);
    results.push({
      id: NIGHTS[i].id,
      issues: ["crash"],
      errors: [String(err)],
      at: st,
    });
  }
}

await browser.close();
const report = {
  closed: results.every((r) => (r.phases || []).includes("archive")) && results.length === 2,
  consoleErrors,
  results,
};
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
