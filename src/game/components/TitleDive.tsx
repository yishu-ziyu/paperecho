import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { sfxFold, sfxWhoosh } from "../audio";
import { ease } from "../motion";

export type CardRect = { x: number; y: number; w: number; h: number };

const FLY_MS = 520;
const OPEN_MS = 560;

/** Flat paper dart — title paper, not the later voxel plane. */
function Dart() {
  return (
    <svg viewBox="0 0 80 96" className="h-full w-full overflow-visible" aria-hidden>
      <path d="M40 94 L4 6 L40 30 L76 6 Z" fill="#f0e6d2" />
      <path d="M40 94 L40 30 L4 6 Z" fill="#d9cbb0" />
      <path d="M40 94 L40 30 L76 6 Z" fill="#f7efe0" />
      <path d="M40 30 L40 94" stroke="#c4b394" strokeWidth="1.4" />
    </svg>
  );
}

/**
 * Title commit: the card becomes a dart, dives to the floor,
 * then the sheet splits from the center to show the room.
 */
export function TitleDive({
  from,
  onCovered,
  onDone,
}: {
  from: CardRect;
  onCovered: () => void;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<"fly" | "open">("fly");
  const startX = from.x + from.w / 2;
  const startY = from.y + from.h / 2;
  const endX = typeof window === "undefined" ? startX : window.innerWidth / 2;
  const endY = typeof window === "undefined" ? startY : window.innerHeight - 64;

  useEffect(() => {
    sfxWhoosh();
    const cover = window.setTimeout(() => {
      onCovered();
      sfxFold();
      setStage("open");
    }, FLY_MS);
    const done = window.setTimeout(() => onDone(), FLY_MS + OPEN_MS);
    return () => {
      window.clearTimeout(cover);
      window.clearTimeout(done);
    };
  }, [onCovered, onDone]);

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 overflow-hidden" data-title-dive={stage}>
      {stage === "fly" ? (
        <motion.div
          className="absolute"
          initial={{
            left: startX,
            top: startY,
            x: "-50%",
            y: "-50%",
            width: Math.min(from.w, 168),
            height: Math.min(from.h, 200),
            rotate: 8,
          }}
          animate={{
            left: endX,
            top: endY,
            width: 72,
            height: 88,
            rotate: [8, -10, 3],
          }}
          transition={{ duration: FLY_MS / 1000, ease: ease.emphasized }}
          style={{ filter: "drop-shadow(0 10px 16px rgba(12,20,40,0.28))" }}
        >
          <Dart />
        </motion.div>
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
          <motion.div
            className="absolute bottom-8 left-1/2 h-[88px] w-[72px] -translate-x-1/2"
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2, ease: ease.exit }}
          >
            <Dart />
          </motion.div>
        </>
      )}
    </div>
  );
}
