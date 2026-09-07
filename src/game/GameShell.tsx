import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { resumeAudio, setMuted, startPad, suspendAudio, unlockAudio } from "./audio";
import { Hud } from "./components/Hud";
import { JudgePanel } from "./components/JudgePanel";
import { Scene } from "./components/Scene";
import { TitleDive, type CardRect } from "./components/TitleDive";
import { ArchivePhase } from "./phases/ArchivePhase";
import { EncounterPhase } from "./phases/EncounterPhase";
import { FlightPhase } from "./phases/FlightPhase";
import { FoldPhase } from "./phases/FoldPhase";
import { OrbitPhase } from "./phases/OrbitPhase";
import { ReturnPhase } from "./phases/ReturnPhase";
import { ThrowPhase } from "./phases/ThrowPhase";
import { TitlePhase } from "./phases/TitlePhase";
import { phaseFrame } from "./phaseMotion";
import { pulseHeartbeat } from "./heartbeat";
import { hydrateLocalState, useGame } from "./store";
import { speakDay } from "./voice";

/**
 * Continuum: chrome may overlap, the craft morphs via layoutId.
 * Overlay the phases (absolute) so sync-presence cannot split the column
 * and layoutId always interpolates in the same viewport box.
 */
export function GameShell() {
  const phase = useGame((s) => s.phase);
  const startNew = useGame((s) => s.startNew);
  const muted = useGame((s) => s.muted);
  const reduce = useReducedMotion();
  const frame = phaseFrame(phase, reduce);
  const [diveFrom, setDiveFrom] = useState<CardRect | null>(null);
  const [seedU, setSeedU] = useState(0);
  const diving = Boolean(diveFrom);

  // 水合必须是第一个 effect：SSR 安全默认值先落，本地真值（journeys/快照/静音）在
  // 任何后续 effect 读取 store 之前就位，heartbeat 才能看到恢复出的 journeys。
  useEffect(() => {
    hydrateLocalState();
  }, []);

  // 静音真相在 store；落到音频图只是副作用。
  useEffect(() => {
    setMuted(muted);
  }, [muted]);

  // 页面切走整体静音，回来解冻；对局在后台不空响。
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) suspendAudio();
      else resumeAudio();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    (window as Window & { __echoGame?: typeof useGame }).__echoGame = useGame;
    void pulseHeartbeat(new Date(), useGame.getState().journeys, undefined, speakDay);
    if (!import.meta.env.DEV) return;
    const jump = new URLSearchParams(window.location.search).get("phase");
    if (jump === "orbit") useGame.setState({ phase: "orbit" });
    if (jump === "throw") useGame.setState({ phase: "throw", folds: 2, region: null });
    if (jump === "fold") {
      useGame.setState({
        phase: "fold",
        folds: 0,
        extraLine: "群里只回了收到，灯还开着。",
        selectedMirror: "群里只回了收到，灯还开着。",
      });
    }
    if (jump === "flight") {
      useGame.setState({
        phase: "flight",
        folds: 2,
        searching: true,
        echo: null,
        searchNote: "寻找世另我ing",
        throwPower: 0.7,
      });
    }
  }, []);

  const launch = useCallback(
    (from: CardRect, u: number) => {
      // 音频图可能此刻才创建，把当前静音偏好先落上去。
      setMuted(useGame.getState().muted);
      unlockAudio();
      startPad();
      if (reduce) {
        startNew();
        return;
      }
      setSeedU(u);
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
    <Scene phase={phase} closeUp={phase !== "title" && !diving}>
      {phase !== "title" && !diving ? <Hud /> : null}
      <JudgePanel />
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={phase}
            data-slide={phase === "archive" ? "cabinet" : undefined}
            className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
            initial={diving ? false : frame.initial}
            animate={{
              ...frame.animate,
              pointerEvents: diving ? "none" : "auto",
            }}
            exit={diving ? { opacity: 1 } : frame.exit}
            transition={diving ? { duration: 0 } : frame.transition}
            style={{ zIndex: phase === "archive" ? 20 : 1 }}
          >
            {phase === "title" && <TitlePhase diving={diving} onLaunch={launch} />}
            {phase === "orbit" && <OrbitPhase />}
            {phase === "fold" && <FoldPhase />}
            {phase === "throw" && <ThrowPhase />}
            {phase === "flight" && <FlightPhase />}
            {phase === "encounter" && <EncounterPhase />}
            {phase === "return" && <ReturnPhase />}
            {phase === "archive" && <ArchivePhase />}
          </motion.div>
        </AnimatePresence>
        {diveFrom ? <TitleDive from={diveFrom} seedU={seedU} onCovered={cover} onDone={finish} /> : null}
      </div>
    </Scene>
  );
}
