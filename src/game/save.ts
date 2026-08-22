import type { Journey } from "./types";

const KEY = "paper-echo-v1";
const VERSION = 1;

interface SaveFile {
  version: number;
  journeys: Journey[];
}

export function loadJourneys(): Journey[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SaveFile;
    if (parsed.version !== VERSION || !Array.isArray(parsed.journeys)) return [];
    return parsed.journeys.slice(0, 24);
  } catch {
    return [];
  }
}

export function persistJourneys(journeys: Journey[]) {
  if (typeof window === "undefined") return;
  const file: SaveFile = { version: VERSION, journeys: journeys.slice(0, 24) };
  localStorage.setItem(KEY, JSON.stringify(file));
}
