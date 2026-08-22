import assert from "node:assert/strict";
import { test } from "node:test";
import { dartBoxOf, flowPoints, type CardRect, type Pt } from "./paperFlow.ts";

const card: CardRect = { x: 40, y: 80, w: 280, h: 320 };
const view = { w: 390, h: 844 };

function halfW(pts: Pt[], i: number, j: number) {
  return Math.abs(pts[i]!.x - pts[j]!.x) / 2;
}

function assertMirror(pts: Pt[]) {
  assert.equal(pts.length, 10);
  const cx = (pts[0]!.x + pts[1]!.x) / 2;
  const pairs: Array<[number, number]> = [
    [0, 1],
    [9, 2],
    [8, 3],
    [7, 4],
    [6, 5],
  ];
  for (const [l, r] of pairs) {
    assert.ok(Math.abs(cx - pts[l]!.x - (pts[r]!.x - cx)) < 0.6, `x ${l}/${r}`);
    assert.ok(Math.abs(pts[l]!.y - pts[r]!.y) < 0.6, `y ${l}/${r}`);
  }
}

test("card stays a wide rectangle", () => {
  const pts = flowPoints(0, card);
  assertMirror(pts);
  assert.ok(halfW(pts, 9, 2) > card.w * 0.46);
  assert.ok(Math.abs(pts[5]!.y - (card.y + card.h)) < 1);
  assert.ok(pts[0]!.y <= pts[2]!.y);
});

test("hold fold tapers to a point, no second lobe", () => {
  const pts = flowPoints(0.4, card);
  assertMirror(pts);
  assert.ok(pts[0]!.y > pts[9]!.y, "V already sits below the peaks");
  assert.ok(halfW(pts, 2, 9) >= halfW(pts, 3, 8) - 1);
  assert.ok(halfW(pts, 3, 8) >= halfW(pts, 4, 7) - 1);
  assert.ok(halfW(pts, 4, 7) > halfW(pts, 5, 6));
  assert.ok(halfW(pts, 5, 6) < 8);
  assert.ok(pts[5]!.y > pts[4]!.y);
});

test("final dart is a tall V-notched plane", () => {
  const box = dartBoxOf(1, card, view);
  const pts = flowPoints(1, card, box);
  assertMirror(pts);
  assert.ok(pts[0]!.y > pts[9]!.y, "V sits below the trailing peaks");
  assert.ok(halfW(pts, 2, 9) >= halfW(pts, 3, 8) - 1);
  assert.ok(halfW(pts, 3, 8) > halfW(pts, 4, 7));
  assert.ok(halfW(pts, 4, 7) > halfW(pts, 5, 6));
  const h = pts[5]!.y - Math.min(pts[2]!.y, pts[9]!.y);
  const w = halfW(pts, 2, 9) * 2;
  assert.ok(h / w > 1.45, `aspect ${h / w}`);
  assert.ok(w > view.w * 0.9, "wings cover the page for the split");
});
