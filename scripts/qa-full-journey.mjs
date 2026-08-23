#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { dragToken, pull } from "./play-gestures.mjs";

const url = process.env.PLAY_URL || "http://127.0.0.1:8080/";
const out = "/workspace/screenshots/journey";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

async function shot(name) {
  await page.screenshot({ path: `${out}/${name}.png` });
}

function game() {
  return page.evaluate(() => {
    const g = window.__echoGame?.getState?.();
    if (!g) return null;
    return {
      phase: g.phase,
      folds: g.folds,
      round: g.round,
      waiting: g.waitingEcho,
      searching: g.searching,
      scorch: g.scorch,
      reading: Boolean(g.reading),
      journeys: g.journeys.length,
      echo: g.echo ? `${g.echo.name} · ${g.echo.city}` : null,
    };
  });
}

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await shot("00-title");

await pull(page, "title", 0, 90);
await page.locator("[data-orbit-field]").waitFor({ timeout: 5000 });
await page.waitForTimeout(400);
await shot("01-orbit");

await dragToken(page, "郁闷", 0.5, 0.52);
await dragToken(page, "疲惫", 0.48, 0.5);
await page.waitForTimeout(200);
await shot("01b-faces");
await page.locator("textarea").fill("群里只回了收到，灯还开着。");
await page.locator("[data-listen-go]").click();
await page.locator('[data-pull="fold"]').waitFor({ timeout: 5000 });
await shot("04-fold-written");

for (let i = 0; i < 2; i++) {
  const fold = page.locator('[data-pull="fold"]').first();
  if (!(await fold.count())) break;
  const box = await fold.boundingBox();
  if (!box) break;
  await page.mouse.move(box.x + box.width * 0.85, box.y + 16);
  await page.mouse.down();
  await page.mouse.move(box.x + 24, box.y + box.height - 12, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}
await shot("04b-plane");
if (await page.locator('[data-pull="window"]').count()) {
  await pull(page, "window", 0, -90);
}

await page.locator("canvas.globe-canvas").waitFor({ timeout: 6000 });
await page.waitForTimeout(520);
await shot("05-throw-enter");
await page.locator("canvas.globe-canvas").click({ force: true });
const well = page.locator("[data-throw-well]").first();
const box = await well.boundingBox();
const x = box.x + box.width / 2;
const y = box.y + 24;
await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x, y + 130, { steps: 16 });
await page.mouse.up();
await shot("05b-thrown");

await page.locator("[data-flight-sky]").waitFor({ timeout: 8000 });
await page.waitForTimeout(900);
await shot("06-storm");
const sky = page.locator("[data-flight-sky]").first();
const sb = await sky.boundingBox();
if (sb) {
  await page.mouse.move(sb.x + sb.width * 0.5, sb.y + sb.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width * 0.7, sb.y + sb.height * 0.35, { steps: 12 });
  await page.mouse.move(sb.x + sb.width * 0.3, sb.y + sb.height * 0.6, { steps: 12 });
  await page.mouse.up();
}
await page.waitForTimeout(800);
await shot("06b-storm-steer");

await page.locator('[data-pull="flight"]').waitFor({ timeout: 26000 });
await shot("06c-land");
await pull(page, "flight", 0, 90);
await page.locator('[data-drop="encounter"]').waitFor({ timeout: 8000 });
await page.waitForTimeout(1100);
await shot("07-encounter");

const speakLines = [
  "抽屉我到现在都没再打开。",
  "我把那张截图发给自己了。",
  "群里那条我还是没回。",
];
for (let r = 0; r < 3; r++) {
  const box = page.locator("textarea").first();
  await box.waitFor({ timeout: 14000 });
  await box.fill(speakLines[r]);
  await page.locator('button[type="submit"]').click();
  if (r < 2) {
    await page.waitForFunction(() => {
      const g = window.__echoGame?.getState?.();
      return g && !g.waitingEcho && g.phase === "encounter";
    }, { timeout: 16000 });
    await page.waitForTimeout(800);
  }
}
await page.locator('[data-pull="return"]').waitFor({ timeout: 18000 });
await page.waitForTimeout(700);
await shot("08-return-flyin");

await pull(page, "return", 0, 50);
await page.waitForTimeout(300);
await shot("08b-opened");
await pull(page, "return", 0, 140);
await page.locator('[data-pull="archive"]').waitFor({ timeout: 8000 });
await shot("09-archive");

await pull(page, "archive", 0, -80);
await page.locator("[data-orbit-field]").waitFor({ timeout: 5000 });
await page.waitForTimeout(400);
await shot("10-orbit-again");

const final = await game();
const body = await page.locator("body").innerText();
await browser.close();

const result = {
  ok:
    errors.length === 0 &&
    final?.phase === "orbit" &&
    (final?.journeys ?? 0) >= 1 &&
    (body.includes("把靠近你的留下") || body.includes("靠近")),
  errors,
  final,
  snippet: body.replace(/\s+/g, " ").slice(0, 360),
};
writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
