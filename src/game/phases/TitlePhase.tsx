import { motion } from "motion/react";
import { startPad, unlockAudio } from "../audio";
import { Craft, PullCommit } from "../continuum";
import { useGame } from "../store";

export function TitlePhase() {
  const phase = useGame((s) => s.phase);
  const startNew = useGame((s) => s.startNew);
  const goArchive = useGame((s) => s.goArchive);
  const journeys = useGame((s) => s.journeys);
  const gone = phase !== "title";

  function enter() {
    unlockAudio();
    startPad();
    startNew();
  }

  return (
    <div className="flex flex-1 flex-col items-center px-5 pt-8 text-center">
      <PullCommit
        testId="title"
        enabled
        sign={1}
        threshold={56}
        hint="松开，进房间"
        commitBehavior="morph"
        onCommit={enter}
        className="relative w-[min(92%,22rem)]"
      >
        <div className="relative">
          <Craft className="h-[22rem] w-full rounded-3xl bg-paper/85 clay" />
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center px-6 py-8"
            animate={{ opacity: gone ? 0 : 1 }}
            transition={{ duration: 0.15 }}
          >
            <h1
              className="font-latin text-[clamp(2.6rem,13vw,4.4rem)] font-bold leading-[0.84] tracking-wide text-ink"
              style={{ textShadow: "0 2px 0 #d9ccb4, 0 5px 0 #cbbda3, 0 12px 18px rgba(26,39,68,0.2)" }}
            >
              PAPER
              <span className="block">ECHO</span>
            </h1>
            <p className="mt-4 font-display text-[1.05rem] tracking-[0.28em] text-ink/70">纸上的回声</p>
            <p className="mx-auto mt-4 max-w-[16rem] text-[0.82rem] font-medium leading-relaxed tracking-[0.04em] text-ink/55">
              把靠近你的留下来，折成会回来的纸飞机。
            </p>
            <p className="mt-6 text-[0.7rem] tracking-[0.28em] text-ink/35">往下拉</p>
          </motion.div>
        </div>
      </PullCommit>
      {journeys.length ? (
        <PullCommit
          testId="title-drawer"
          enabled
          sign={1}
          threshold={36}
          hint="松开，开信柜"
          onCommit={goArchive}
          className="relative mt-auto mb-10 w-40 pb-2"
        >
          <div className="clay-sm rounded-t-2xl px-4 py-3 text-xs tracking-[0.2em] text-ink/55">
            信柜 {journeys.length}
          </div>
        </PullCommit>
      ) : (
        <div className="mt-auto pb-16" />
      )}
    </div>
  );
}
