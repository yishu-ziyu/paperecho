import assert from "node:assert/strict";
import { test } from "node:test";
import { phaseFrame } from "./phaseMotion.ts";

test("archive slides up from the drawer unless motion is reduced", () => {
  const slide = phaseFrame("archive", false);
  assert.equal(slide.initial.y, "100%");
  assert.equal(slide.animate.y, "0%");
  assert.equal(slide.exit.y, "100%");
  assert.equal(slide.initial.opacity, 1);
  assert.ok(slide.transition.duration >= 0.4);

  const quiet = phaseFrame("archive", true);
  assert.equal(quiet.initial.y, 0);
  assert.equal(quiet.initial.opacity, 0);
  assert.equal(quiet.animate.y, 0);
});

test("other phases keep a short fade", () => {
  const frame = phaseFrame("return", false);
  assert.equal(frame.initial.y, 0);
  assert.equal(frame.initial.opacity, 0);
  assert.equal(frame.animate.opacity, 1);
  assert.ok(frame.transition.duration <= 0.25);
});
