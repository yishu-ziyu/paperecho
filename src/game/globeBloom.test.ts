import assert from "node:assert/strict";
import { test } from "node:test";
import { bloomOrder, bloomPulse, pickMarkerAt, projectRegion } from "./globeBloom.ts";
import { REGIONS } from "./stories.ts";

test("bloom order puts polar last and overlap first", () => {
  const order = bloomOrder(["unseen", "tired"]);
  assert.equal(order[order.length - 1], "polar");
  assert.ok(order.includes("east"));
  assert.ok(order.indexOf("east") < order.indexOf("polar"));
  assert.ok(order.indexOf("africa") < order.indexOf("europe"));
});

test("empty feels keeps region order except polar last", () => {
  assert.deepEqual(bloomOrder([]), ["east", "america", "europe", "africa", "oceania", "polar"]);
});

test("bloom pulse is a stepped pop", () => {
  assert.equal(bloomPulse(0), 0);
  assert.ok(bloomPulse(0.2) < 0.4);
  assert.ok(bloomPulse(0.8) > 1);
  assert.ok(Math.abs(bloomPulse(1) - 1) < 0.02);
});

test("facing a region projects that city near the disc", () => {
  const east = REGIONS[0]!;
  const phi = (-east.lng * Math.PI) / 180;
  const theta = ((east.lat * Math.PI) / 180) * 0.42;
  const p = projectRegion(east.lat, east.lng, phi, theta, 320);
  assert.ok(p);
  assert.ok(p.z > 0.7);
  assert.ok(Math.abs(p.x - 160) < 36);
  const hit = pickMarkerAt(p.x, p.y, 320, phi, theta, { east: 1 });
  assert.equal(hit, "east");
});

test("tap empty ocean does not steal a city", () => {
  const east = REGIONS[0]!;
  const phi = (-east.lng * Math.PI) / 180;
  const theta = ((east.lat * Math.PI) / 180) * 0.42;
  assert.equal(pickMarkerAt(12, 12, 320, phi, theta, { east: 1 }), null);
});
