import type { EmotionId } from "../types";
import { FUN_CANVAS, FUN_EYES, FUN_EYES_TF, FUN_MOUTH, FUN_MOUTH_TF, type FunPart } from "../faces/fun-emoji";

/** Fun Emoji Set by Davis Uche (CC BY 4.0), remixed via DiceBear.
 * Sleep / awake / held each keep the emotion's silhouette — no generic "--" face.
 */
type Triple = { eyes: [string, string, string]; mouth: [string, string, string] };

const FUN: Record<EmotionId, Triple> = {
  gloom: { eyes: ["sleepClose", "sad", "sad"], mouth: ["plain", "sad", "sad"] },
  wronged: { eyes: ["sad", "tearDrop", "crying"], mouth: ["plain", "sad", "sad"] },
  anxious: { eyes: ["cute", "cute", "wink2"], mouth: ["plain", "shout", "shout"] },
  tired: { eyes: ["sleepClose", "sleepClose", "sad"], mouth: ["sick", "sick", "plain"] },
  lonely: { eyes: ["sad", "sad", "sad"], mouth: ["shy", "shy", "plain"] },
  anger: { eyes: ["pissed", "pissed", "pissed"], mouth: ["plain", "pissed", "pissed"] },
  calm: { eyes: ["closed", "closed", "closed"], mouth: ["lilSmile", "lilSmile", "wideSmile"] },
  unseen: { eyes: ["plain", "plain", "stars"], mouth: ["plain", "shout", "wideSmile"] },
};

function paint(fill: string) {
  if (fill === "black") return "currentColor";
  if (fill === "white") return "var(--face-hole, var(--color-paper))";
  return fill;
}

function Paths({ parts }: { parts: FunPart[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={paint(p.fill)}
          fillRule={(p.fillRule as "evenodd" | "nonzero" | undefined) ?? undefined}
          clipRule={(p.clipRule as "evenodd" | "nonzero" | undefined) ?? undefined}
          opacity={p.opacity ? Number(p.opacity) : undefined}
        />
      ))}
    </>
  );
}

export function TokenFace({
  id,
  awake,
  held,
  gaze,
  size = 30,
  blink,
}: {
  id: EmotionId;
  awake: boolean;
  held?: boolean;
  gaze?: { x: number; y: number } | null;
  size?: number;
  blink?: boolean;
}) {
  const spec = FUN[id];
  const slot = held ? 2 : awake ? 1 : 0;
  const eyeName = spec.eyes[slot]!;
  const mouthName = spec.mouth[slot]!;
  const eyes = FUN_EYES[eyeName] ?? FUN_EYES.closed!;
  const mouth = FUN_MOUTH[mouthName] ?? FUN_MOUTH.plain!;
  const gx = held && gaze ? Math.max(-6, Math.min(6, gaze.x * 5)) : 0;
  const gy = held && gaze ? Math.max(-4, Math.min(4, gaze.y * 4)) : 0;

  return (
    <svg
      viewBox={`0 0 ${FUN_CANVAS.width} ${FUN_CANVAS.height}`}
      width={size}
      height={size}
      aria-hidden
      className="overflow-visible"
    >
      <g transform={FUN_MOUTH_TF}>
        <Paths parts={mouth} />
      </g>
      <g transform={`${FUN_EYES_TF} translate(${gx} ${gy})`}>
        <g className={blink ? "face-blink" : undefined} style={blink ? { transformOrigin: "50% 50%" } : undefined}>
          <Paths parts={eyes} />
        </g>
      </g>
    </svg>
  );
}
