import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cabinetFace,
  excerptOf,
  hashId,
  journeyForMemory,
  layoutCabinet,
  signatureOf,
  WALL_SLOTS,
} from "./cabinet.ts";
import type { Journey, MemoryRecord } from "./types.ts";

const echo = {
  name: "林予",
  city: "杭州",
  felt: "灯还开着",
  greeting: "十七稿我打成一包。",
  replies: ["灯还开着。"],
  returnLetter: "抽屉那包还在。你要是也有一包，先别扔。",
  source: "archive" as const,
};

function journey(id: string, createdAt = 1): Journey {
  return {
    id,
    createdAt,
    fingerprint: [{ id: "tired", closeness: 0.8 }],
    mirror: "群里只回了收到，灯还开着。",
    letter: "群里只回了收到，灯还开着。",
    chips: [],
    region: "east",
    echo,
    transcript: [],
    returnLetter: echo.returnLetter,
  };
}

test("hero slot is Promise Wall's center card", () => {
  assert.equal(WALL_SLOTS[0]?.x, -1.1);
  assert.equal(WALL_SLOTS[0]?.y, 2.4);
  assert.equal(WALL_SLOTS[0]?.paper, "torn");
  assert.equal(WALL_SLOTS[0]?.font, "serif");
});

test("newest journey hangs as a signed envelope", () => {
  assert.equal(cabinetFace(0, "j-any"), "envelope");
  const mixed = ["j-1", "j-2", "j-3", "j-4", "j-5", "j-6"].map((id, i) => cabinetFace(i + 1, id));
  assert.ok(mixed.includes("note"));
});

test("layout maps letters and memories onto their slots", () => {
  const journeys = [journey("j-a", 3), journey("j-b", 2), journey("j-c", 1)];
  journeys[1] = { ...journeys[1]!, echo: { ...echo, name: "Mara", city: "Lisbon" } };
  const archival: MemoryRecord[] = [
    { id: "m1", memory: "群里只回了收到，灯还开着。", emotions: ["unseen"], echoName: "林予", createdAt: 9 },
    { id: "m2", memory: "改到很晚。稿还在文件夹里。", emotions: ["tired"], createdAt: 8 },
  ];
  const board = layoutCabinet(journeys, archival, "j-a");
  assert.equal(board.notes.filter((n) => n.kind === "journey").length, 3);
  assert.equal(board.notes.filter((n) => n.kind === "memory").length, 2);
  assert.equal(board.notes[0]?.id, "j-a");
  assert.equal(board.notes[0]?.type, "envelope");
  assert.equal(board.notes[0]?.attach, "string");
  assert.equal(board.notes[0]?.x, WALL_SLOTS[0]?.x);
  assert.equal(board.notes[0]?.y, WALL_SLOTS[0]?.y);
  assert.equal(board.notes[0]?.category, "回信");
  assert.equal(board.notes[0]?.author, "林予");
  assert.equal(board.notes[0]?.city, "杭州");
  assert.match(board.notes[0]?.text ?? "", /抽屉那包还在/);
  assert.ok(board.notes.every((n) => n.category === "回信" || n.category === "还记得"));
  assert.ok(board.notes.filter((n) => n.kind === "memory").every((n) => n.type !== "envelope"));
  assert.equal(board.notes.find((n) => n.id === "m1")?.category, "还记得");
  assert.equal(journeyForMemory(archival[0]!, journeys)?.id, "j-a");
  assert.equal(journeyForMemory(archival[1]!, journeys), undefined);
});

test("excerpt and signature stay stable", () => {
  assert.equal(excerptOf("灯还开着"), "灯还开着");
  assert.equal(excerptOf("抽屉那包还在。你要是也有一包，先别扔。", 8), "抽屉那包还在。你…");
  assert.equal(signatureOf("  林予  "), "林予");
  assert.equal(hashId("same"), hashId("same"));
  assert.notEqual(hashId("same"), hashId("other"));
});

test("empty cabinet feeds an empty note list to their wall", () => {
  const board = layoutCabinet([], []);
  assert.equal(board.notes.length, 0);
});
