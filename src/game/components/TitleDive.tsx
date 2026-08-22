import { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { sfxFold, sfxWhoosh } from "../audio";
import { ease } from "../motion";
import { dartBoxOf, flowEase, flowPoints, type CardRect } from "../paperFlow";
import { PaperSheet } from "./PaperSheet";

export type { CardRect };

const FLOW_MS = 1120;
const OPEN_MS = 560;

/**
 * Same sheet: card → pointed fold → dart that grows toward the lens,
 * then the dart splits on its crease.
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
  const clip = useId();

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

  const flow = stage === "open" ? 1 : u;
  const box = dartBoxOf(flow, from, view.current);
  const points = flowPoints(flow, from, box);
  const vw = view.current.w;
  const vh = view.current.h;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 overflow-hidden" data-title-dive={stage} data-flow={flow.toFixed(2)}>
      {stage === "flow" ? (
        <svg width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`} className="absolute inset-0 h-full w-full" aria-hidden>
          <PaperSheet points={points} u={flow} />
        </svg>
      ) : (
        <svg width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`} className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <clipPath id={`${clip}-L`}>
              <rect x={0} y={0} width={vw / 2} height={vh} />
            </clipPath>
            <clipPath id={`${clip}-R`}>
              <rect x={vw / 2} y={0} width={vw / 2} height={vh} />
            </clipPath>
          </defs>
          <motion.g
            clipPath={`url(#${clip}-L)`}
            initial={{ x: 0 }}
            animate={{ x: -vw / 2 }}
            transition={{ duration: OPEN_MS / 1000, ease: ease.emphasized }}
          >
            <PaperSheet points={points} u={1} half="left" />
          </motion.g>
          <motion.g
            clipPath={`url(#${clip}-R)`}
            initial={{ x: 0 }}
            animate={{ x: vw / 2 }}
            transition={{ duration: OPEN_MS / 1000, ease: ease.emphasized }}
          >
            <PaperSheet points={points} u={1} half="right" />
          </motion.g>
        </svg>
      )}
    </div>
  );
}
