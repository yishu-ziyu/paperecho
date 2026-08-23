import type { Journey } from "../types";

export type PromiseWallNote = {
  id: string;
  text: string;
  body?: string;
  author?: string;
  category?: string;
  paper?: string;
  attach?: "pin" | "tape" | "clip" | "string";
  pinColor?: number;
  rot?: number;
  w?: number;
  x?: number;
  y?: number;
  font?: "hand" | "serif";
  doodle?: string;
  date?: string;
  city?: string;
  title?: string;
  type?: "note" | "photo" | "envelope";
  journey?: Journey;
};

export function mountPromiseWall(
  canvas: HTMLCanvasElement,
  options?: {
    host?: HTMLElement;
    notes?: PromiseWallNote[];
    selectedId?: string | null;
    pinFreshId?: string | null;
    reducedMotion?: boolean | null;
    onSelect?: (note: PromiseWallNote) => void;
    onVacant?: () => void;
  },
): {
  destroy: () => void;
  selectById: (id: string | null, opts?: { moveCamera?: boolean }) => void;
  closePanel: () => void;
  cards: unknown[];
};
