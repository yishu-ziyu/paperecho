import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { sfxFold, sfxWhoosh } from "../audio";
import { ease } from "../motion";
import {
  destOf,
  flowEase,
  flowPoints,
  type CardRect,
} from "../paperFlow";
import { PaperSheet } from "./PaperSheet";

export type { CardRect };

const FLOW_MS = 1120;
const OPEN_MS = 560;

/**
 * One paper silhouette: rectangle → hourglass drain → dart,
 * then the sheet splits to show the room.
 */
export function TitleDive({
  from,
  seedU = 0,
  onCovered,
  onDone,
}: {
  from: CardRect;
  seedU?: number;
  onCovered: () => void;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<"flow" | "open">("flow");
  const [u, setU] = useState(seedU);
  const view = useRef({
    w: typeof window === "undefined" ? 390 : window.innerWidth,
    h: typeof window === "undefined" ? 844 : window.innerHeight,
  });
  const covered = useRef(false);

  useEffect(() => {
    sfxWhoosh();
    const start = performance.now();
    const origin = seedU;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / FLOW_MS);
      const next = origin + (1 - origin) * flowEase(t);
      setU(next);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (!covered.current) {
        covered.current = true;
        onCovered();
        sfxFold();
        setStage("open");
      }
    };
    raf = requestAnimationFrame(tick);
    const done = window.setTimeout(() => onDone(), FLOW_MS + OPEN_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [onCovered, onDone, seedU]);

  const dest = destOf(u, from, view.current);
  const points = flowPoints(u, from, dest.x, dest.y);
  const vw = view.current.w;
  const vh = view.current.h;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 overflow-hidden" data-title-dive={stage} data-flow={u.toFixed(2)}>
      {stage === "flow" ? (
        <svg width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`} className="absolute inset-0 h-full w-full" aria-hidden>
          <PaperSheet points={points} u={u} />
        </svg>
      ) : (
        <>
          <motion.div
            className="absolute inset-y-0 left-0 w-1/2 bg-paper shadow-[-12px_0_24px_rgba(12,20,40,0.12)_inset]"
            initial={{ x: 0 }}
            animate={{ x: "-100%" }}
            transition={{ duration: OPEN_MS / 1000, ease: ease.emphasized }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 w-1/2 bg-paper shadow-[12px_0_24px_rgba(12,20,40,0.12)_inset]"
            initial={{ x: 0 }}
            animate={{ x: "100%" }}
            transition={{ duration: OPEN_MS / 1000, ease: ease.emphasized }}
          />
        </>
      )}
    </div>
  );
}
