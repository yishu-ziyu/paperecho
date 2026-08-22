/** Playwright helpers that speak the game's verbs: pull, drop, not click-to-skip. */

export async function pull(page, testId, dx, dy, steps = 16) {
  const el = page.locator(`[data-pull="${testId}"]`).first();
  await el.waitFor({ state: "visible", timeout: 8000 });
  const box = await el.boundingBox();
  if (!box) throw new Error(`no box for data-pull=${testId}`);
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height * 0.4, 40);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps });
  await page.mouse.up();
  await page.waitForTimeout(280);
}

export async function dropOnto(page, from, onto) {
  const a = await from.boundingBox();
  const b = await onto.boundingBox();
  if (!a || !b) throw new Error("dropOnto: missing box");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(320);
}

export async function dragToken(page, label, xPct, yPct) {
  const btn = page.getByRole("button", { name: label });
  const field = page.locator("[data-orbit-field]").first();
  await btn.waitFor({ state: "visible", timeout: 5000 });
  const fieldBox = await field.boundingBox();
  const box = await btn.boundingBox();
  if (!fieldBox || !box) throw new Error(`no box for ${label}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(fieldBox.x + fieldBox.width * xPct, fieldBox.y + fieldBox.height * yPct, {
    steps: 14,
  });
  await page.mouse.up();
  await page.waitForTimeout(180);
}
