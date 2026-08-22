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
 * Continuum: chrome crossfades, the craft (paper/plane) morphs via layoutId.
 * Never wait-mode — that would leave a hole between the hand and the object.
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
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          key={phase}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, pointerEvents: "auto" }}
          exit={{ opacity: 0, pointerEvents: "none" }}
          transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
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
    </Scene>
  );
}
