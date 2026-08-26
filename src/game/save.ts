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

/** 首夜引导只看一次；看过就记下来，不再打扰。 */
const GUIDE_KEY = "paper-echo-guide-v1";

interface GuideFile {
  version: number;
  seen: boolean;
}

export function loadHasSeenGuide(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(GUIDE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as GuideFile;
    if (parsed.version !== 1 || typeof parsed.seen !== "boolean") return false;
    return parsed.seen;
  } catch {
    return false;
  }
}

export function persistHasSeenGuide(seen: boolean) {
  if (typeof window === "undefined") return;
  const file: GuideFile = { version: 1, seen };
  localStorage.setItem(GUIDE_KEY, JSON.stringify(file));
}
