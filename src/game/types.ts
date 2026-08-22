export type Phase =
  | "title"
  | "orbit"
  | "mirror"
  | "compose"
  | "fold"
  | "throw"
  | "flight"
  | "encounter"
  | "return"
  | "archive";

/** Ritual steps shown as quiet wayfinding dots. Archive is an exit, not a step. */
export const JOURNEY: Phase[] = [
  "orbit",
  "mirror",
  "compose",
  "fold",
  "throw",
  "flight",
  "encounter",
  "return",
];

export const CAN_BACK: Phase[] = ["orbit", "mirror", "compose", "fold", "throw", "archive"];

export type Shape = "circle" | "square" | "diamond" | "pill";

export type EmotionId =
  | "gloom"
  | "wronged"
  | "anxious"
  | "tired"
  | "lonely"
  | "anger"
  | "calm"
  | "unseen";

export type RegionId =
  | "east"
  | "america"
  | "europe"
  | "africa"
  | "oceania"
  | "polar";

export interface Emotion {
  id: EmotionId;
  label: string;
  hint: string;
  color: string;
  ink: string;
  shape: Shape;
  face: {
    eyes: "closed" | "half" | "downcast" | "round" | "wide" | "side" | "brow";
    mouth: "flat" | "frown" | "wave" | "open" | "none" | "smile" | "bite";
    blink?: boolean;
  };
  mirrors: [string, string];
  chips: string[];
  replies: string[];
}

export interface TokenPos {
  id: EmotionId;
  x: number;
  y: number;
}

export interface Fingerprint {
  id: EmotionId;
  closeness: number;
}

export interface Story {
  id: string;
  name: string;
  city: string;
  region: RegionId;
  feels: EmotionId[];
  opening: string;
  lines: [string, string];
  returnLetter: string;
}

export interface EchoPerson {
  name: string;
  city: string;
  felt: string;
  greeting: string;
  replies: string[];
  returnLetter: string;
  source: "live" | "archive";
}

export interface Journey {
  id: string;
  createdAt: number;
  fingerprint: Fingerprint[];
  mirror: string;
  letter: string;
  chips: string[];
  region: RegionId;
  echo: EchoPerson;
  transcript: { who: "you" | "echo"; text: string }[];
  returnLetter: string;
}

export interface TokenMeter {
  prompt: number;
  completion: number;
  total: number;
  model: string;
  via: "live" | "archive";
  node: string;
}

/** Core block — kept in every prompt window（本轮人格与人设基线）。 */
export interface CoreMemory {
  human: string;
  persona: string;
}

/** 信柜档案记录。词法检索（Jaccard）代替向量嵌入，玩家设备上直接跑。 */
export interface MemoryRecord {
  id: string;
  memory: string;
  emotions: EmotionId[];
  region?: RegionId;
  echoName?: string;
  createdAt: number;
}

export const CENTER = { x: 50, y: 48 };
export const MIN_RADIUS = 28;
export const MAX_RADIUS = 46;
