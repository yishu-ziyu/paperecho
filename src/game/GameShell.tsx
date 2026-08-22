import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { startPad, unlockAudio } from "./audio";
import { Hud } from "./components/Hud";
import { JudgePanel } from "./components/JudgePanel";
import { Scene } from "./components/Scene";
import { TitleDive, type CardRect } from "./components/TitleDive";
import { ArchivePhase } from "./phases/ArchivePhase";
import { ComposePhase } from "./phases/ComposePhase";
import { EncounterPhase } from "./phases/EncounterPhase";
import { FlightPhase } from "./phases/FlightPhase";
import { FoldPhase } from "./phases/FoldPhase";
import { MirrorPhase } from "./phases/MirrorPhase";
import { OrbitPhase } from "./phases/OrbitPhase";
import { ReturnPhase } from "./phases/ReturnPhase";
import { ThrowPhase } from "./phases/ThrowPhase";
import { TitlePhase } from "./phases/TitlePhase";
import { useGame } from "./store";

/**
 * Continuum: chrome may overlap, the craft morphs via layoutId.
 * Overlay the phases (absolute) so sync-presence cannot split the column
 * and layoutId always interpolates in the same viewport box.
 */
export function GameShell() {
  const phase = useGame((s) => s.phase);
  const startNew = useGame((s) => s.startNew);
  const reduce = useReducedMotion();
  const [diveFrom, setDiveFrom] = useState<CardRect | null>(null);
  const diving = Boolean(diveFrom);

  useEffect(() => {
    (window as Window & { __echoGame?: typeof useGame }).__echoGame = useGame;
  }, []);

  const launch = useCallback(
    (from: CardRect) => {
      unlockAudio();
      startPad();
      if (reduce) {
        startNew();
        return;
      }
      setDiveFrom(from);
    },
    [reduce, startNew],
  );

  const cover = useCallback(() => {
    startNew();
  }, [startNew]);

  const finish = useCallback(() => {
    setDiveFrom(null);
  }, []);

  return (
    <Scene phase={phase}>
      {phase !== "title" && !diving ? <Hud /> : null}
      <JudgePanel />
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={phase}
            className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
            initial={diving ? false : { opacity: 0 }}
            animate={{ opacity: 1, pointerEvents: diving ? "none" : "auto" }}
            exit={diving ? { opacity: 1 } : { opacity: 0, pointerEvents: "none" }}
            transition={{ duration: diving ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
          >
            {phase === "title" && <TitlePhase diving={diving} onLaunch={launch} />}
            {phase === "orbit" && <OrbitPhase />}
            {phase === "mirror" && <MirrorPhase />}
            {phase === "compose" && <ComposePhase />}
            {phase === "fold" && <FoldPhase />}
            {phase === "throw" && <ThrowPhase />}
            {phase === "flight" && <FlightPhase />}
            {phase === "encounter" && <EncounterPhase />}
            {phase === "return" && <ReturnPhase />}
            {phase === "archive" && <ArchivePhase />}
          </motion.div>
        </AnimatePresence>
        {diveFrom ? <TitleDive from={diveFrom} onCovered={cover} onDone={finish} /> : null}
      </div>
    </Scene>
  );
}
