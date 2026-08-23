import assert from "node:assert/strict";
import { test } from "node:test";
import { clampHeading, headingToward, rubberAxis } from "./planeLook.ts";

test("heading 0 is up, then clockwise toward the pointer", () => {
  assert.equal(headingToward(0, -20), 0);
  assert.ok(Math.abs(headingToward(20, 0) - 90) < 0.01);
  assert.ok(Math.abs(Math.abs(headingToward(0, 20)) - 180) < 0.01);
  assert.ok(Math.abs(headingToward(-20, 0) + 90) < 0.01);
});

test("tiny pointer moves stay nose-up", () => {
  assert.equal(headingToward(0, 0), 0);
  assert.equal(headingToward(3, -2), 0);
  assert.equal(headingToward(1, -1, 8), 0);
});

test("heading clamps so the dart leans, not spins", () => {
  assert.equal(clampHeading(80, 48), 48);
  assert.equal(clampHeading(-80, 48), -48);
  assert.equal(clampHeading(12, 48), 12);
});

test("rubber axis resists past the limit on both sides", () => {
  assert.equal(rubberAxis(40, 80), 40);
  assert.equal(rubberAxis(-40, 80), -40);
  assert.ok(rubberAxis(120, 80) > 80);
  assert.ok(rubberAxis(120, 80) < 120);
  assert.equal(rubberAxis(-120, 80), -rubberAxis(120, 80));
});
