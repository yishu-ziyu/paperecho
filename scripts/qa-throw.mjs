#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const url = process.env.PLAY_URL || "http://127.0.0.1:8080/";
const out = "/workspace/screenshots";
mkdirSync(out, { recursive: true });

const echo = {
  name: "Mara",
  city: "Lisbon",
  felt: "unseen",
  greeting: "窗还开着。",
  replies: [],
  returnLetter: "",
  source: "archive",
};

async function jump(page, phase, extra = {}) {
  await page.waitForFunction(() => window.__echoGame);
  await page.evaluate(
    ({ phase, extra, echo }) => {
      window.__echoGame.setState({
        phase,
        region: "europe",
        echo,
        searching: phase === "flight",
        searchNote: "飞向 Mara · Lisbon",
        throwPower: 0.9,
        ...extra,
      });
    },
    { phase, extra, echo },
  );
  await page.waitForTimeout(500);
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.error("pageerror", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.error("console", m.text());
});
await page.goto(url, { waitUntil: "networkidle" });
await jump(page, "throw");
await page.screenshot({ path: `${out}/motion-throw-idle.png` });

const well = page.locator("[data-throw-well]");
const box = await well.boundingBox();
if (!box) throw new Error("no throw well");
const x = box.x + box.width / 2;
const y = box.y + 22;
await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x, y + 86, { steps: 16 });
await page.waitForTimeout(180);
await page.screenshot({ path: `${out}/motion-throw-aim.png` });
const aimCue = await page.locator("[data-throw-cue]").innerText();
console.log("aim cue:", aimCue);

await page.mouse.move(x - 18, y + 168, { steps: 14 });
await page.waitForTimeout(220);
await page.screenshot({ path: `${out}/motion-throw-full.png` });
const fullCue = await page.locator("[data-throw-cue]").innerText();
console.log("full cue:", fullCue);

await page.mouse.up();
await page.waitForTimeout(220);
await page.screenshot({ path: `${out}/motion-throwing.png` });
const flyCue = await page.locator("[data-throw-cue]").innerText().catch(() => "(phase left)");
const phase = await page.evaluate(() => window.__echoGame.getState().phase);
console.log("after-release cue:", flyCue, "phase:", phase);

await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/motion-throw-gone.png` });
const after = await page.evaluate(() => window.__echoGame.getState().phase);
console.log("later phase:", after);

await jump(page, "flight", { searching: true, searchNote: "飞向 Mara · Lisbon", throwPower: 0.9 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/motion-flight.png` });

await jump(page, "flight", { searching: false, searchNote: "飞向 Mara · Lisbon", throwPower: 0.9 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/motion-flight-found.png` });

console.log("qa-throw ok");
await browser.close();
