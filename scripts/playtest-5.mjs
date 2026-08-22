#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { dragToken, dropOnto, pull } from "./play-gestures.mjs";

const url = process.env.PLAY_URL || "http://127.0.0.1:8080/";
const outDir = "/workspace/screenshots/playtest";
mkdirSync(outDir, { recursive: true });

const PERSONAS = [
  {
    id: "p1-hesitant",
    habit: "犹豫：只把郁闷轻轻靠近，不写自己的句子，点第一项就走",
    near: ["郁闷"],
    far: ["愤怒"],
    extra: "",
    chips: 1,
    region: "东亚",
    pick: 0,
  },
  {
    id: "p2-flooded",
    habit: "倾诉：把郁闷、孤单、疲惫、想被看见都拖进来，再写一句很私人的话",
    near: ["郁闷", "孤单", "疲惫", "想被看见"],
    far: [],
    extra: "群里已读，可没人回我那句认真的。",
    chips: 4,
    region: "美洲",
    pick: 1,
  },
  {
    id: "p3-wronged",
    habit: "委屈：愤怒和委屈贴得很近，其他推开，句子短、冲",
    near: ["愤怒", "委屈"],
    far: ["平静", "郁闷"],
    extra: "我不想被说敏感。",
    chips: 2,
    region: "欧洲",
    pick: 0,
  },
  {
    id: "p4-calm",
    habit: "平静：只靠近平静和疲惫，话很少，投向极夜",
    near: ["平静", "疲惫"],
    far: ["焦虑", "愤怒"],
    extra: "",
    chips: 2,
    region: "极夜",
    pick: 2,
  },
  {
    id: "p5-returner",
    habit: "回访：孤单为主，看系统会不会用上前几程的记忆",
    near: ["孤单", "想被看见"],
    far: ["愤怒"],
    extra: "还是那间没人敲门的房间。",
    chips: 3,
    region: "南半球",
    pick: 0,
  },
];

function notesOf(body) {
  const issues = [];
  if (body.includes("……") && !body.includes("对方把纸")) issues.push("ellipsis-stuck");
  if ((body.match(/我看见/g) || []).length >= 3) issues.push("echo-i-see-you-repeat");
  if (body.length < 40) issues.push("empty-screen");
  return issues;
}

async function sling(page) {
  const well = page.locator("[data-throw-well]").first();
  await well.waitFor({ state: "visible", timeout: 8000 });
  const box = await well.boundingBox();
  if (!box) throw new Error("no throw well");
  const x = box.x + box.width / 2;
  const y = box.y + 24;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 130, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

async function journey(page, persona, index) {
  const record = {
    id: persona.id,
    habit: persona.habit,
    echo: "",
    greeting: "",
    replies: [],
    suggestions: [],
    letter: "",
    memories: [],
    searchNote: "",
    usedMemory: false,
    issues: [],
    errors: [],
  };
  const onErr = (e) => record.errors.push(String(e));
  page.on("pageerror", onErr);

  if (index === 0) {
    await pull(page, "title", 0, 90);
  } else {
    const blank = page.locator('[data-pull="archive"]');
    if (await blank.count()) await pull(page, "archive", 0, -90);
    else await pull(page, "title", 0, 90);
  }
  await page.waitForTimeout(350);

  for (const label of persona.near) {
    await dragToken(page, label, 0.5, 0.54);
  }
  for (const label of persona.far) {
    await dragToken(page, label, 0.12, 0.18);
  }
  await page.screenshot({ path: `${outDir}/${persona.id}-orbit.png` });
  await page.locator("textarea").fill(persona.extra || "群里只回了收到，灯还开着。");
  await page.locator("[data-listen-go]").click();
  await page.waitForTimeout(250);

  const fold = page.locator('[data-pull="fold"]').first();
  await fold.waitFor({ state: "visible", timeout: 5000 });
  for (let i = 0; i < 2; i++) {
    const box = await fold.boundingBox();
    if (!box) break;
    await page.mouse.move(box.x + box.width * 0.85, box.y + 16);
    await page.mouse.down();
    await page.mouse.move(box.x + 24, box.y + box.height - 12, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(280);
  }
  const win = page.locator('[data-pull="window"]').first();
  if (await win.count()) await pull(page, "window", 0, -90);
  await page.locator("canvas.globe-canvas").click({ force: true });
  await page.screenshot({ path: `${outDir}/${persona.id}-throw.png` });
  await sling(page);

  const found = page.locator("text=/找到|旧句子|信柜|线路|带着|往下拉|落到桌上|到了/");
  await found.first().waitFor({ timeout: 22000 });
  record.searchNote = (await found.first().innerText().catch(() => "")).slice(0, 80);
  record.usedMemory = /旧句子|带着/.test(record.searchNote);
  await page.waitForTimeout(400);
  const land = page.locator('[data-pull="flight"]');
  await land.waitFor({ state: "visible", timeout: 22000 });
  await page.screenshot({ path: `${outDir}/${persona.id}-flight.png` });
  await pull(page, "flight", 0, 90);

  await page.locator("text=/把一句拖向对方|写一句自己的|对方把纸|回信正在折|拖到桌上|先听/").first().waitFor({ timeout: 12000 });
  record.echo = await page.locator("h2").first().innerText();
  record.greeting = await page.locator("ul li").first().innerText();
  await page.waitForTimeout(1100);
  record.suggestions = await page.locator("button.echo-opt").allInnerTexts();
  await page.screenshot({ path: `${outDir}/${persona.id}-encounter.png` });

  if (record.greeting.length > 36) record.issues.push("greeting-long");
  if (new Set(record.suggestions).size < record.suggestions.length) record.issues.push("dup-suggestions");
  if (record.suggestions.every((s) => s.length > 18)) record.issues.push("suggestions-too-long");

  const desk = page.locator('[data-drop="encounter"]').first();
  for (let i = 0; i < 3; i++) {
    const opts = page.locator("button.echo-opt");
    const count = await opts.count();
    if (!count) {
      record.issues.push(`no-options-round-${i}`);
      break;
    }
    const choice = opts.nth(Math.min(i, count - 1));
    const text = (await choice.innerText()).trim();
    await dropOnto(page, choice, desk);
    await page.waitForFunction(() => !document.body.innerText.includes("……"), { timeout: 15000 }).catch(() => {
      record.issues.push(`waiting-stuck-round-${i}`);
    });
    await page.waitForTimeout(280);
    const spoken = await page.locator("ul li.self-start").last().innerText().catch(() => "");
    record.replies.push({ you: text, echo: spoken });
    if (spoken === "……") record.issues.push(`ellipsis-round-${i}`);
    if (spoken.length > 40) record.issues.push(`echo-long-round-${i}`);
  }

  await page.getByText("未拆的回声").waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${outDir}/${persona.id}-return.png` });
  await pull(page, "return", 0, 70);
  await page.waitForTimeout(200);
  const letterEl = page.locator("[data-pull=return] p").first();
  record.letter = (await letterEl.innerText().catch(() => "")).slice(0, 200);
  if (record.letter.length > 90) record.issues.push("return-letter-long");
  await pull(page, "return", 0, 140);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${persona.id}-archive.png` });
  const archive = await page.locator("body").innerText();
  record.memories = archive.includes("还记得的事")
    ? archive
        .split("还记得的事")[1]
        .split("空白的一张")[0]
        .trim()
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  if (!archive.includes("还记得的事") && index > 0) record.issues.push("memories-missing");
  record.issues.push(...notesOf(archive));
  record.body = archive.replace(/\s+/g, " ").slice(0, 500);
  page.off("pageerror", onErr);
  return record;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

await page.goto(url, { waitUntil: "networkidle" });
const results = [];
for (let i = 0; i < PERSONAS.length; i++) {
  try {
    results.push(await journey(page, PERSONAS[i], i));
  } catch (err) {
    results.push({
      id: PERSONAS[i].id,
      habit: PERSONAS[i].habit,
      issues: ["crash"],
      errors: [String(err)],
    });
  }
}
await browser.close();
const report = { consoleErrors, results };
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
