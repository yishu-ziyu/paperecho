import { cn } from "@/lib/utils";
import type { ExpressionId } from "../bloub/expressions";
import type { ShapeId } from "../bloub/skins";
import { EMOTION_MAP } from "../emotions";
import type { EmotionId } from "../types";
import { BloubBot } from "./BloubBot";

/** Catalogue skins. Each mood keeps its own measured eye geometry. */
const SKIN: Record<EmotionId | "you", { shape: ShapeId; mood: ExpressionId }> = {
  gloom: { shape: "galet", mood: "triste" },
  wronged: { shape: "goutte", mood: "timide" },
  anxious: { shape: "nuage", mood: "confus" },
  tired: { shape: "capsule", mood: "somnolent" },
  lonely: { shape: "cercle", mood: "blase" },
  anger: { shape: "triangle", mood: "colere" },
  calm: { shape: "squircle", mood: "heureux" },
  unseen: { shape: "hexagone", mood: "fier" },
  you: { shape: "cercle", mood: "neutre" },
};

function faceOf(id: EmotionId | "you", awake: boolean, gather: number): ExpressionId {
  if (id === "you") return awake || gather > 0.18 ? "heureux" : "neutre";
  return SKIN[id].mood;
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
  const skin = SKIN[id];
  const paint = color ?? (id === "you" ? "#C9B8A4" : EMOTION_MAP[id].color);
  const looking = held && gaze;

  return (
    <div className={cn("relative flex flex-col items-center", className)} style={{ width: size }}>
      <BloubBot
        className="emotion-creature overflow-visible"
        size={size}
        shape={skin.shape}
        color={paint}
        expression={faceOf(id, awake, gather)}
        state="idle"
        paper="#f0e6d2"
        look={looking ? gaze : null}
        title={title === undefined ? (id === "you" ? "你" : EMOTION_MAP[id].label) : title}
      />
      {label ? <span className="mt-0.5 font-display text-sm text-ink/70">{label}</span> : null}
    </div>
  );
}
