import type { ExchangeState } from "./agent/exchange";
import type {
  CoreMemory,
  EchoPerson,
  Fingerprint,
  Journey,
  Phase,
  RegionId,
  TokenPos,
} from "./types";

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

/**
 * 进行中旅程的快照。只存可序列化、可在刷新后重新接上的状态；
 * 异步等待段（flight 匹配、encounter 回复）由 store 恢复时降级重入。
 */
const SNAP_KEY = "paper-echo-snapshot-v1";
export const SNAP_VERSION = 1;

export interface JourneySnapshot {
  version: number;
  createdAt: number;
  phase: Phase;
  tokens: TokenPos[];
  fingerprint: Fingerprint[];
  selectedMirror: string | null;
  personaHint: string;
  chips: string[];
  letterChips: string[];
  extraLine: string;
  folds: number;
  region: RegionId | null;
  throwPower: number;
  echo: EchoPerson | null;
  searching: boolean;
  searchNote: string;
  round: number;
  replies: string[];
  chosenReplies: string[];
  recall: { who: "you" | "echo"; text: string }[];
  waitingEcho: boolean;
  session: string;
  core: CoreMemory;
  exchange: ExchangeState;
}

export function loadSnapshot(): JourneySnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JourneySnapshot;
    if (parsed.version !== SNAP_VERSION || !parsed.phase || !Array.isArray(parsed.tokens)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSnapshot(snap: JourneySnapshot) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(snap));
  } catch {
    // 隐私模式或存储写满，静默放弃；不影响本局。
  }
}

export function clearSnapshot() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SNAP_KEY);
  } catch {
    /* noop */
  }
}

/** 静音偏好，独立于对局；供 store 做唯一数据源。 */
const MUTE_KEY = "paper-echo-muted-v1";

export function loadMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* noop */
  }
}
