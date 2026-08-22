#!/usr/bin/env node
import { chromium } from "playwright";
import { dragToken, dropOnto, pull } from "./play-gestures.mjs";

const page = await (await chromium.launch({ headless: true })).newPage({ viewport: { width: 390, height: 844 } });
page.on("console", (m) => console.log("PAGE", m.type(), m.text()));
await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
await pull(page, "title", 0, 90);
await page.locator("[data-orbit-field]").waitFor();
await dragToken(page, "郁闷", 0.5, 0.52);
await pull(page, "you", 0, 90);
await page.locator('[data-drop="mirror"]').waitFor();
await page.waitForTimeout(400);

const info = await page.evaluate(() => {
  const table = document.querySelector("[data-drop=mirror]");
  const card = document.querySelector("ul button");
  const tr = table?.getBoundingClientRect();
  const cr = card?.getBoundingClientRect();
  return {
    table: tr && { x: tr.x, y: tr.y, w: tr.width, h: tr.height },
    card: cr && { x: cr.x, y: cr.y, w: cr.width, h: cr.height },
    phase: window.__echoGame?.getState?.().phase,
    candidates: window.__echoGame?.getState?.().candidates?.length,
  };
});
console.log("boxes", JSON.stringify(info, null, 2));

await page.evaluate(() => {
  window.__dragLog = [];
  window.addEventListener(
    "pointerup",
    (e) => {
      const t = document.querySelector("[data-drop=mirror]")?.getBoundingClientRect();
      window.__dragLog.push({
        t: "up",
        x: e.clientX,
        y: e.clientY,
        hit: t ? e.clientX >= t.left - 16 && e.clientX <= t.right + 16 && e.clientY >= t.top - 16 && e.clientY <= t.bottom + 16 : false,
        table: t && { t: t.top, b: t.bottom, l: t.left, r: t.right },
      });
    },
    true,
  );
  window.addEventListener(
    "pointerdown",
    (e) => {
      window.__dragLog.push({ t: "down", x: e.clientX, y: e.clientY, tag: e.target?.tagName });
    },
    true,
  );
});

const card = page.locator("ul button").first();
const table = page.locator("[data-drop=mirror]").first();
await dropOnto(page, card, table);
await page.waitForTimeout(500);
const after = await page.evaluate(() => ({
  phase: window.__echoGame?.getState?.().phase,
  log: window.__dragLog,
  mirror: window.__echoGame?.getState?.().selectedMirror,
}));
console.log("after", JSON.stringify(after, null, 2));
await page.screenshot({ path: "/workspace/screenshots/loop/debug-mirror.png" });
await page.context().browser().close();
