#!/usr/bin/env node
import { chromium } from "playwright";

const url = process.env.PLAY_URL || "http://127.0.0.1:8080/";
const out = process.env.PREVIEW_OUT || "/opt/cursor/artifacts";
const headed = process.env.HEADED === "1";

const echo = {
  name: "林予",
  city: "杭州",
  felt: "灯还开着",
  greeting: "十七稿我打成一包。",
  replies: ["灯还开着。"],
  returnLetter: "抽屉那包还在。你要是也有一包，先别扔。",
  source: "archive",
};

const echo2 = {
  name: "Mara",
  city: "Lisbon",
  felt: "the draft is still in the folder",
  greeting: "I left the lamp on.",
  replies: ["I left the lamp on."],
  returnLetter: "The folder is still on the chair.",
  source: "archive",
};

const echo3 = {
  name: "阿宁",
  city: "台北",
  felt: "已读不回",
  greeting: "我把手机扣过去了。",
  replies: ["我把手机扣过去了。"],
  returnLetter: "那句已读我还留着。",
  source: "archive",
};

function journey(id, person, createdAt) {
  return {
    id,
    createdAt: createdAt || Date.UTC(2026, 7, 20),
    fingerprint: [{ id: "tired", closeness: 0.8 }],
    mirror: "群里只回了收到，灯还开着。",
    letter: "群里只回了收到，灯还开着。",
    chips: [],
    region: "east",
    echo: person,
    transcript: [],
    returnLetter: person.returnLetter,
  };
}

const journeys = [
  journey("j-a", echo, Date.UTC(2026, 7, 22)),
  journey("j-b", echo2, Date.UTC(2026, 7, 21)),
  journey("j-c", echo3, Date.UTC(2026, 7, 20)),
];

const archival = [
  { id: "m1", memory: "群里只回了收到，灯还开着。", emotions: ["unseen"], echoName: "林予", createdAt: Date.UTC(2026, 7, 22) },
  { id: "m2", memory: "改到很晚。稿还在文件夹里。", emotions: ["tired"], createdAt: Date.UTC(2026, 7, 21) },
  { id: "m3", memory: "那句已读我到现在都没回。", emotions: ["lonely"], echoName: "阿宁", createdAt: Date.UTC(2026, 7, 20) },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/local/bin/google-chrome",
  headless: !headed,
  args: headed
    ? ["--window-size=430,900", "--window-position=40,20", "--no-first-run"]
    : ["--headless=new", "--no-first-run", "--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "no-preference",
  recordVideo: { dir: out, size: { width: 390, height: 844 } },
});
const page = await context.newPage();
page.on("pageerror", (err) => console.log("pageerror", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("console", msg.text());
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => Boolean(window.__echoGame), null, { timeout: 20000 });
await page.waitForTimeout(240);

await page.evaluate(
  ({ journeys: nextJ, archival: nextA }) => {
    window.__echoGame.setState({
      phase: "archive",
      journeys: nextJ,
      archival: nextA,
      reading: null,
      leftFrom: "title",
    });
  },
  { journeys, archival },
);
await page.waitForSelector("[data-cabinet='wall'] canvas[data-wall-ready='1']", { timeout: 12000 });
await page.waitForTimeout(900);
const wall = page.locator("[data-cabinet='wall'] canvas");
const count = await wall.getAttribute("data-card-count");
console.log("card count", count);
if (count !== "6") throw new Error(`expected 6 notes, got ${count}`);
await page.screenshot({ path: `${out}/pw_engine_wall_idle.png` });
console.log("wrote pw_engine_wall_idle");

const box = await wall.boundingBox();
if (!box) throw new Error("no wall canvas");
const hero = { x: box.x + box.width * 0.46, y: box.y + box.height * 0.52 };
await page.mouse.move(hero.x, hero.y);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/pw_engine_wall_hover.png` });
console.log("wrote pw_engine_wall_hover");

let opened = false;
for (const pt of [
  hero,
  { x: box.x + box.width * 0.38, y: box.y + box.height * 0.48 },
  { x: box.x + box.width * 0.55, y: box.y + box.height * 0.44 },
]) {
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(280);
  await page.mouse.click(pt.x, pt.y);
  try {
    await page.waitForSelector("[data-cabinet='letter']", { timeout: 1800 });
    opened = true;
    break;
  } catch {
    /* try next pin */
  }
}
if (!opened) throw new Error("clicked wall but no letter opened");
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/pw_engine_wall_open.png` });
const sig = await page.locator("[data-cabinet='letter'] .font-hand").first().textContent();
console.log("letter signature:", sig);

await page.evaluate(() => {
  const s = window.__echoGame.getState();
  window.__echoGame.setState({ reading: null, leftFrom: s.leftFrom });
});
await page.waitForTimeout(400);

await page.mouse.move(hero.x, hero.y);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.22, box.y + box.height * 0.58, { steps: 10 });
await page.waitForTimeout(240);
await page.screenshot({ path: `${out}/pw_engine_wall_drag.png` });
await page.mouse.up();
console.log("wrote pw_engine_wall_drag");

await page.evaluate(
  ({ echo: person, journeys: prev, archival: nextA }) => {
    window.__echoGame.setState({
      phase: "return",
      echo: person,
      region: "east",
      journeys: prev.slice(1),
      archival: nextA,
      reading: null,
      leftFrom: null,
      letterChips: ["群里只回了收到，灯还开着。"],
      extraLine: "",
      selectedMirror: "群里只回了收到，灯还开着。",
      fingerprint: [{ id: "tired", closeness: 0.8 }],
      recall: [],
    });
  },
  { echo, journeys, archival },
);
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/pw_engine_return_before_slide.png` });

const slideP = page.evaluate(() => {
  window.__echoGame.getState().saveReturn();
});
await page.waitForTimeout(180);
await page.screenshot({ path: `${out}/pw_engine_endgame_slide_mid.png` });
await slideP;
await page.waitForSelector("[data-cabinet='wall'] canvas[data-wall-ready='1']", { timeout: 12000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/pw_engine_endgame_slide_settled.png` });
const title = await page.locator("[data-phase='archive'] h2").first().textContent();
console.log("settled title:", title);
if (title !== "这封刚滑进来") throw new Error(`unexpected title ${title}`);

const video = page.video();
await context.close();
if (video) {
  const vpath = await video.path();
  const dest = `${out}/pw_engine_wall_open_drag_and_endgame_slide.webm`;
  const { copyFileSync } = await import("node:fs");
  copyFileSync(vpath, dest);
  console.log("wrote video", dest);
}
if (!headed) await browser.close();
else console.log("headed browser left open");
console.log("done", out);
