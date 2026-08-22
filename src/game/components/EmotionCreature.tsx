import { cn } from "@/lib/utils";
import type { EmotionId } from "../types";
import { EMOTION_MAP } from "../emotions";
import { BLOB_SILHOUETTES } from "../faces/blob-silhouettes";
import { CursorAvatar, type CursorState } from "./CursorAvatar";

const NEAR_STATE: Record<EmotionId, CursorState> = {
  gloom: "thinking",
  wronged: "shy",
  anxious: "curious",
  tired: "drowsy",
  anger: "angry",
  lonely: "bored",
  calm: "idle",
  unseen: "proud",
};

const FAR_STATE: Record<EmotionId, CursorState> = {
  gloom: "sleeping",
  wronged: "sad",
  anxious: "drowsy",
  tired: "sleeping",
  lonely: "sleeping",
  anger: "bored",
  calm: "sleeping",
  unseen: "drowsy",
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

/** Clay triad: lit rim, body, shade. */
export function clayGradient(hex: string): [string, string, string] {
  const [r, g, b] = hexRgb(hex);
  return [
    rgbHex(r + (255 - r) * 0.32, g + (248 - g) * 0.32, b + (238 - b) * 0.32),
    hex,
    rgbHex(r * 0.72 + 26 * 0.28, g * 0.72 + 39 * 0.28, b * 0.72 + 68 * 0.28),
  ];
}

function creatureState(
  id: EmotionId | "you",
  awake: boolean,
  held: boolean,
  gather: number,
): CursorState {
  if (id === "you") return gather > 0.18 ? "waking" : awake ? "happy" : "idle";
  if (held) return "dragging";
  if (!awake) return FAR_STATE[id];
  if (gather > 0.25) return "humming";
  return NEAR_STATE[id];
}

export function EmotionCreature({
  id,
  color,
  awake = true,
  held = false,
  gather = 0,
  gaze = null,
  size = 52,
  label,
  title,
  className,
}: {
  id: EmotionId | "you";
  color?: string;
  awake?: boolean;
  held?: boolean;
  gather?: number;
  gaze?: { x: number; y: number } | null;
  size?: number;
  label?: string;
  title?: string | null;
  className?: string;
}) {
  const paint = color ?? (id === "you" ? "#C9B8A4" : EMOTION_MAP[id].color);
  const nervous = id === "anxious" || id === "anger";
  const quiet = id === "tired" || id === "calm" || id === "lonely";
  const looking = held && gaze;

  return (
    <div className={cn("relative flex flex-col items-center", className)} style={{ width: size }}>
      <CursorAvatar
        className="emotion-creature overflow-visible"
        style={{ color: paint }}
        state={creatureState(id, awake, held, gather)}
        size={size}
        silhouette={BLOB_SILHOUETTES[id]}
        gradient={clayGradient(paint)}
        eyeColor="#F4EFE6"
        eyeScale={1.12}
        mouthStroke={8.2}
        gaze={looking ? { x: clamp(gaze.x, -1, 1), y: clamp(gaze.y, -1, 1) } : undefined}
        turn={looking ? gaze.x * 14 : 0}
        lookAround={held ? 0 : awake ? 0.42 : 0.12}
        spring={id === "anxious" ? 9 : id === "tired" ? 5 : 7}
        motion={held ? 1.08 : nervous ? 1.16 : quiet ? 0.82 : 1}
        effects={false}
        glyphs={false}
        title={title === undefined ? (id === "you" ? "你" : EMOTION_MAP[id].label) : title}
      />
      {label ? <span className="mt-0.5 font-display text-sm text-ink/70">{label}</span> : null}
    </div>
  );
}
