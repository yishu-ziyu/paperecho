import assert from "node:assert/strict";
import { test } from "node:test";
import { clampToRing } from "./emotions.ts";
import { CENTER, MIN_RADIUS } from "./types.ts";

test("drop on center keeps approach angle, not due south", () => {
  const from = { id: "anxious" as const, x: CENTER.x + 40, y: CENTER.y };
  const p = clampToRing(CENTER.x, CENTER.y + 0.1, "anxious", from);
  const south = { x: CENTER.x, y: CENTER.y + MIN_RADIUS };
  assert.ok(Math.hypot(p.x - south.x, p.y - south.y) > 8, `snapped south: ${p.x},${p.y}`);
  assert.ok(p.x > CENTER.x + 10, `should stay east, got ${p.x}`);
  const d = Math.hypot(p.x - CENTER.x, p.y - CENTER.y);
  assert.ok(Math.abs(d - MIN_RADIUS) < 0.6, `d=${d}`);
});

test("drop on center without from uses home sector", () => {
  const tired = clampToRing(CENTER.x, CENTER.y, "tired");
  const lonely = clampToRing(CENTER.x, CENTER.y, "lonely");
  assert.ok(Math.hypot(tired.x - lonely.x, tired.y - lonely.y) > 10);
});
