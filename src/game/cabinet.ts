import type { PromiseWallNote } from "./vendor/promise-wall";
import type { Journey, MemoryRecord } from "./types.ts";

/**
 * Slot list taken from Promise Wall's own pinned notes
 * (thebuggeddev/promise-wall index.html store.promises, photos dropped,
 * hero card "I will keep showing up…" moved to index 0).
 */
export const WALL_SLOTS = [
  { x: -1.1, y: 2.4, w: 5.7, paper: "torn", font: "serif" as const, doodle: "star", rot: 0.5, attach: "pin" as const },
  { x: -7.6, y: 8.7, w: 5.3, paper: "torn", font: "serif" as const, doodle: "heart", rot: -1, attach: "pin" as const },
  { x: -0.7, y: 8.6, w: 4.2, paper: "pastelPink", doodle: "heart", rot: 1.5, attach: "tape" as const },
  { x: 5.9, y: 9.1, w: 4.5, paper: "kraft", rot: 2, attach: "pin" as const, pinColor: 0x8a6a33 },
  { x: 11.6, y: 5.5, w: 3.9, paper: "pastelPurple", doodle: "sprig", rot: -1.5, attach: "pin" as const },
  { x: 16.9, y: 7.0, w: 4.0, paper: "classic", doodle: "sprig", rot: 1, attach: "tape" as const },
  { x: -15.6, y: 3.3, w: 4.3, paper: "pastelPink", doodle: "heart", rot: -2, attach: "pin" as const },
  { x: -8.5, y: 2.1, w: 5.1, paper: "notebook", doodle: "heart", rot: -0.5, attach: "pin" as const },
  { x: -16.3, y: -3.7, w: 3.6, paper: "graph", doodle: "heart", rot: -1, attach: "clip" as const },
  { x: -9.9, y: -4.5, w: 3.9, paper: "kraft", rot: -2.5, attach: "pin" as const, pinColor: 0x7d7d85 },
  { x: -4.3, y: -4.9, w: 3.8, paper: "pastelGreen", rot: 1.5, attach: "tape" as const },
  { x: 4.7, y: -3.5, w: 4.3, paper: "torn", doodle: "sprig", rot: 2, attach: "pin" as const },
  { x: 10.9, y: -1.8, w: 4.1, paper: "kraft", rot: -3, attach: "pin" as const },
  { x: 12.5, y: -7.2, w: 3.1, paper: "kraft", doodle: "heart", rot: 2, attach: "pin" as const },
  { x: 21.5, y: 1.6, w: 4.0, paper: "classic", rot: -1.5, attach: "pin" as const },
  { x: -21.8, y: 6.5, w: 3.9, paper: "pastelPurple", doodle: "arrow", rot: 2, attach: "pin" as const },
  { x: -21.9, y: -1.8, w: 4.1, paper: "pastelGreen", rot: -2, attach: "pin" as const },
  { x: 21.8, y: -5.4, w: 4.0, paper: "pastelPink", rot: 1, attach: "tape" as const },
  { x: -17.6, y: 8.3, w: 4.8, paper: "classic", rot: -2.5, attach: "pin" as const },
  { x: 7.9, y: -7.7, w: 3.5, paper: "classic", rot: 2.5, attach: "tape" as const },
] as const;

export type CabinetNote = PromiseWallNote & {
  kind: "journey" | "memory";
};

export interface CabinetLayout {
  notes: CabinetNote[];
}

export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function excerptOf(text: string, n = 36): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n)}…`;
}

export function signatureOf(name: string): string {
  return name.trim();
}

export function journeyForMemory(memory: MemoryRecord, journeys: Journey[]): Journey | undefined {
  const name = memory.echoName?.trim();
  if (!name) return undefined;
  return journeys.find((j) => j.echo.name === name);
}

function slotAt(index: number) {
  const base = WALL_SLOTS[index % WALL_SLOTS.length]!;
  const ring = Math.floor(index / WALL_SLOTS.length);
  return {
    ...base,
    x: base.x + (ring ? (ring % 2 ? 2.4 : -2.4) : 0),
    y: base.y - ring * 6.4,
  };
}

function asNote(
  slot: ReturnType<typeof slotAt>,
  partial: Omit<CabinetNote, "x" | "y" | "w" | "rot" | "paper" | "attach" | "font" | "doodle" | "pinColor"> &
    Partial<Pick<CabinetNote, "w" | "paper" | "attach">>,
): CabinetNote {
  return {
    paper: slot.paper,
    attach: slot.attach,
    font: "font" in slot ? slot.font : undefined,
    doodle: "doodle" in slot ? slot.doodle : undefined,
    pinColor: "pinColor" in slot ? slot.pinColor : undefined,
    rot: slot.rot,
    w: slot.w,
    x: slot.x,
    y: slot.y,
    ...partial,
  };
}

export function cabinetFace(index: number, id: string): "envelope" | "note" {
  if (index === 0) return "envelope";
  return hashId(id) % 3 === 0 ? "envelope" : "note";
}

/** Newest letter hangs as a signed envelope; older ones mix notes and envelopes. */
export function layoutCabinet(
  journeys: Journey[],
  archival: MemoryRecord[],
  _readingId?: string | null,
): CabinetLayout {
  const notes: CabinetNote[] = [];
  let i = 0;

  journeys.forEach((journey, index) => {
    const slot = slotAt(i++);
    const face = cabinetFace(index, journey.id);
    notes.push(
      asNote(slot, {
        id: journey.id,
        kind: "journey",
        type: face,
        attach: face === "envelope" ? "string" : slot.attach,
        text: excerptOf(journey.returnLetter || journey.letter),
        body: journey.returnLetter || journey.letter,
        author: signatureOf(journey.echo.name),
        title: journey.echo.name,
        city: journey.echo.city,
        category: "回信",
        date: new Date(journey.createdAt).toLocaleDateString("zh-CN"),
        journey,
      }),
    );
  });

  for (const memory of archival.slice(0, 6)) {
    const slot = slotAt(i++);
    notes.push(
      asNote(slot, {
        id: memory.id,
        kind: "memory",
        text: excerptOf(memory.memory, 28),
        body: memory.memory,
        author: memory.echoName ? signatureOf(memory.echoName) : "还记得",
        category: "还记得",
        date: new Date(memory.createdAt).toLocaleDateString("zh-CN"),
        w: Math.min(slot.w, 3.8),
        paper: slot.paper === "torn" ? "classic" : slot.paper,
        journey: journeyForMemory(memory, journeys),
      }),
    );
  }

  return { notes };
}
