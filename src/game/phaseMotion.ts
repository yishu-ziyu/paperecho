import { dur, ease } from "./motion.ts";
import type { Phase } from "./types.ts";

export type PhaseFrame = {
  initial: { opacity: number; y: number | string };
  animate: { opacity: number; y: number | string; pointerEvents: "auto" | "none" };
  exit: { opacity: number; y: number | string; pointerEvents: "none" };
  transition: { duration: number; ease: readonly [number, number, number, number] };
};

/** Archive slides up like a drawer; other phases keep the quiet fade. */
export function phaseFrame(phase: Phase, reduce: boolean | null): PhaseFrame {
  if (reduce) {
    return {
      initial: { opacity: 0, y: 0 },
      animate: { opacity: 1, y: 0, pointerEvents: "auto" },
      exit: { opacity: 0, y: 0, pointerEvents: "none" },
      transition: { duration: dur.exit, ease: ease.emphasized },
    };
  }
  if (phase === "archive") {
    return {
      initial: { opacity: 1, y: "100%" },
      animate: { opacity: 1, y: "0%", pointerEvents: "auto" },
      exit: { opacity: 1, y: "100%", pointerEvents: "none" },
      transition: { duration: dur.emphasis, ease: ease.emphasized },
    };
  }
  return {
    initial: { opacity: 0, y: 0 },
    animate: { opacity: 1, y: 0, pointerEvents: "auto" },
    exit: { opacity: 0, y: 0, pointerEvents: "none" },
    transition: { duration: dur.exit, ease: ease.emphasized },
  };
}
