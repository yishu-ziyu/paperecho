#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { dragToken, pull } from "./play-gestures.mjs";

const url = process.env.PLAY_URL || "http://127.0.0.1:8080/";
const out = "/workspace/screenshots/audit";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

const shots = [];
async function shot(name) {
  const path = `${out}/c-${name}.png`;
  await page.screenshot({ path, fullPage: false });
  shots.push(name);
}

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await shot("00-title");

await pull(page, "title", 0, 90);
await page.locator("[data-orbit-field]").waitFor({ timeout: 5000 });
await shot("01-orbit");

await dragToken(page, "郁闷", 0.5, 0.52);
await page.waitForTimeout(200);
await shot("01b-orbit-near");
await page.locator("textarea").fill("群里只回了收到，灯还开着。");
await page.locator("[data-listen-go]").click();
await page.locator('[data-pull="fold"]').waitFor({ timeout: 5000 });
await page.waitForTimeout(400);
await shot("04-fold");
const before = await page.evaluate(() => {
  const g = window.__echoGame?.getState?.();
  return g ? { phase: g.phase, folds: g.folds } : null;
});
console.log("before fold", before);

for (let i = 0; i < 2; i++) {
  const fold = page.locator('[data-pull="fold"]').first();
  if (!(await fold.count())) break;
  const box = await fold.boundingBox();
  console.log("fold box", i, box);
  if (!box) break;
  await page.mouse.move(box.x + box.width * 0.85, box.y + 16);
  await page.mouse.down();
  await page.mouse.move(box.x + 24, box.y + box.height - 12, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const mid = await page.evaluate(() => {
    const g = window.__echoGame?.getState?.();
    return g ? { phase: g.phase, folds: g.folds } : null;
  });
  console.log("after fold", i, mid);
}
await shot("04b-folded");
if (await page.locator('[data-pull="window"]').count()) {
  await pull(page, "window", 0, -90);
}
await page.locator("canvas.globe-canvas").waitFor({ timeout: 6000 });
await shot("05-throw");
await page.locator("canvas.globe-canvas").click({ force: true });
const well = page.locator("[data-throw-well]").first();
const box = await well.boundingBox();
const x = box.x + box.width / 2;
const y = box.y + 24;
await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x, y + 130, { steps: 16 });
await page.mouse.up();
await shot("05b-throwing");

await page.locator('[data-pull="flight"]').waitFor({ timeout: 24000 });
await shot("06-flight");
await pull(page, "flight", 0, 90);
await page.locator('[data-drop="encounter"]').waitFor({ timeout: 8000 });
await page.waitForTimeout(1100);
await shot("07-encounter");

const body = await page.locator("body").innerText();
await browser.close();
console.log(
  JSON.stringify(
    {
      ok: errors.length === 0 && (body.includes("拖到桌上") || body.includes("先听")),
      errors,
      shots,
      snippet: body.replace(/\s+/g, " ").slice(0, 400),
    },
    null,
    2,
  ),
);
