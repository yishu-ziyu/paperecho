#!/usr/bin/env node
import { chromium } from "playwright";

const url = process.env.PLAY_URL || "http://127.0.0.1:8080/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto(url, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "进入房间" }).click();
await page.waitForTimeout(400);

const gloom = page.getByRole("button", { name: "郁闷" });
const box = await gloom.boundingBox();
const field = page.locator(".relative.mx-auto.mt-2").first();
const fieldBox = await field.boundingBox();
if (box && fieldBox) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(fieldBox.x + fieldBox.width / 2, fieldBox.y + fieldBox.height * 0.54, { steps: 12 });
  await page.mouse.up();
}
await page.waitForTimeout(300);
await page.getByRole("button", { name: "这就是现在的我" }).click();
await page.waitForTimeout(300);

const mirror = page.locator("ul button").first();
await mirror.click();
await page.waitForTimeout(250);

await page.locator(".flex.flex-wrap.gap-2 button").first().click();
await page.getByRole("button", { name: "开始折飞机" }).click();
await page.getByRole("button", { name: "折这一角" }).click();
await page.getByRole("button", { name: "折成飞机" }).click();
await page.getByRole("button", { name: "去窗边" }).click().catch(() => {});
await page.locator("canvas.globe-canvas").click({ force: true });
await page.getByRole("button", { name: /投出去|点地球|先转/ }).click();

const found = page.locator("text=/找到|旧句子|信柜|线路/");
await found.first().waitFor({ timeout: 20000 });
await page.waitForTimeout(1200);

const encounter = page.locator("text=/把回答拖向对方|对方把纸/");
await encounter.first().waitFor({ timeout: 8000 });
const echoTitle = await page.locator("h2").first().innerText();
await page.screenshot({ path: "/workspace/screenshots/agent-match.png" });

for (let i = 0; i < 3; i++) {
  await page.locator(".mt-auto.grid button").first().click();
  await page.waitForFunction(() => !document.body.innerText.includes("……"), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(350);
}
await page.getByText("未拆的回声").waitFor({ timeout: 15000 });
await page.locator("button.relative.mx-auto.mt-8").click();
await page.getByRole("button", { name: "放进信柜" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/agent-archive.png" });
const archive = await page.locator("body").innerText();
await browser.close();
console.log(
  JSON.stringify(
    {
      ok: errors.length === 0 && archive.includes("还记得的事"),
      errors,
      echoTitle,
      archive: archive.replace(/\s+/g, " ").slice(0, 800),
    },
    null,
    2,
  ),
);
