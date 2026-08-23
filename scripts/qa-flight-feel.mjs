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
function keepError(text) {
  return !/hydrat/i.test(text);
}
page.on("pageerror", (e) => {
  const text = String(e);
  if (keepError(text)) errors.push(text);
});
page.on("console", (m) => {
  if (m.type() === "error" && keepError(m.text())) errors.push(m.text());
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__echoGame);
await page.evaluate(
  ({ echo }) => {
    window.__echoGame.setState({
      phase: "flight",
      region: "europe",
      echo: null,
      searching: true,
      searchNote: "在夜里找一个也说过类似话的人",
      throwPower: 0.9,
    });
  },
  { echo },
);
await page.locator("[data-flight-sky]").waitFor();
await page.waitForTimeout(240);
await page.screenshot({ path: `${out}/idle.png` });

const searching = await page.evaluate(() => {
  const text = document.body.innerText;
  return {
    hasSteerHook: Boolean(window.__flightTest),
    hasFollowCopy: /跟着你|绕开|手可以带着飞/.test(text),
    note: text.includes("在夜里找一个也说过类似话的人"),
    pull: Boolean(document.querySelector('[data-pull="flight"]')),
  };
});

await page.mouse.move(80, 180);
await page.waitForTimeout(180);
await page.mouse.move(320, 220);
await page.waitForTimeout(280);
await page.screenshot({ path: `${out}/mouse.png` });

const afterMouse = await page.evaluate(() => Boolean(window.__flightTest));

await page.evaluate(({ echo }) => {
  window.__echoGame.setState({
    phase: "flight",
    echo,
    searching: false,
    searchNote: "到了 Lisbon，Mara 读完了你的信",
  });
}, { echo });
await page.locator('[data-pull="flight"]').waitFor({ timeout: 4000 });
await page.screenshot({ path: `${out}/found.png` });
const foundTitle = await page.locator("h2").innerText();

const report = {
  errors,
  searching,
  afterMouse,
  foundTitle,
  pass: {
    noSteerHook: !searching.hasSteerHook && !afterMouse,
    noFollowCopy: !searching.hasFollowCopy,
    searchingNote: searching.note,
    noPullWhileSearch: !searching.pull,
    foundTitle: foundTitle === "到了 Lisbon，Mara 读完了你的信",
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
