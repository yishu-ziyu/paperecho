#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.env.PLAY_URL || "http://127.0.0.1:8080/";
const out = "/workspace/screenshots/flight-feel";
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

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__echoGame);
await page.evaluate(
  ({ echo }) => {
    window.__echoGame.setState({
      phase: "flight",
      region: "europe",
      echo,
      searching: true,
      searchNote: "飞向 Mara · Lisbon",
      throwPower: 0.9,
    });
  },
  { echo },
);
await page.waitForFunction(() => window.__flightTest);
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/idle.png` });

async function chase(x, y, ms) {
  await page.evaluate(({ x, y }) => window.__flightTest.setTarget(x, y), { x, y });
  const peak = await page.evaluate(async (ms) => {
    const t0 = performance.now();
    let maxVx = 0;
    let minVx = 0;
    let maxBank = -999;
    let minBank = 999;
    let last = {};
    while (performance.now() - t0 < ms) {
      last = {
        x: window.__flightTest.getX(),
        y: window.__flightTest.getY(),
        vx: window.__flightTest.getVx(),
        vy: window.__flightTest.getVy(),
        bank: window.__flightTest.getBank(),
      };
      maxVx = Math.max(maxVx, last.vx);
      minVx = Math.min(minVx, last.vx);
      maxBank = Math.max(maxBank, last.bank);
      minBank = Math.min(minBank, last.bank);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { ...last, maxVx, minVx, maxBank, minBank };
  }, ms);
  return peak;
}

const right = await chase(180, -40, 220);
await page.screenshot({ path: `${out}/chase-right.png` });

const left = await chase(-180, 50, 260);
await page.screenshot({ path: `${out}/chase-left.png` });

await page.mouse.move(320, 220);
await page.waitForTimeout(280);
await page.screenshot({ path: `${out}/mouse.png` });

const report = {
  errors,
  right,
  left,
  pass: {
    rightVel: right.maxVx > 80,
    rightBank: right.maxBank > 2,
    leftVel: left.minVx < -80,
    leftBank: left.minBank < -2,
    noErrors: errors.length === 0,
  },
};
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const failed = Object.entries(report.pass).filter(([, v]) => !v);
if (failed.length) {
  console.error("FAIL", failed.map(([k]) => k).join(", "));
  process.exit(1);
}
console.log("qa-flight-feel ok");
await browser.close();
