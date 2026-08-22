import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Hud } from "./components/Hud";
import { JudgePanel } from "./components/JudgePanel";
import { Scene } from "./components/Scene";
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

  useEffect(() => {
    (window as Window & { __echoGame?: typeof useGame }).__echoGame = useGame;
  }, []);

  return (
    <Scene phase={phase}>
      {phase !== "title" ? <Hud /> : null}
      <JudgePanel />
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={phase}
            className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, pointerEvents: "auto" }}
            exit={{ opacity: 0, pointerEvents: "none" }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          >
            {phase === "title" && <TitlePhase />}
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
      </div>
    </Scene>
  );
}
