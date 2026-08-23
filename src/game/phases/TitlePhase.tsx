import { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { startPad, unlockAudio } from "../audio";
import { LetterPop } from "../components/LetterPop";
import { PaperSheet } from "../components/PaperSheet";
import type { CardRect } from "../components/TitleDive";
import { PullCommit } from "../continuum";
import { flowPoints } from "../paperFlow";
import { useGame } from "../store";

export function TitlePhase({
  diving = false,
  onLaunch,
}: {
  diving?: boolean;
  onLaunch: (from: CardRect, u: number) => void;
}) {
  const goArchive = useGame((s) => s.goArchive);
  const journeys = useGame((s) => s.journeys);
  const reduce = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef(0);
  const [pull, setPull] = useState(0);
  const [box, setBox] = useState({ w: 320, h: 352 });

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function enter() {
    const r = cardRef.current?.getBoundingClientRect();
    if (!r) {
      unlockAudio();
      startPad();
      useGame.getState().startNew();
      return;
    }
    onLaunch({ x: r.left, y: r.top, w: r.width, h: r.height }, pullRef.current * 0.4);
  }

  const u = pull * 0.4;
  const local: CardRect = { x: 10, y: 8, w: Math.max(40, box.w - 20), h: Math.max(40, box.h - 16) };
  const points = flowPoints(u, local);

  return (
    <div className="flex flex-1 flex-col items-center px-5 pt-8 text-center">
      <PullCommit
        testId="title"
        enabled={!diving}
        sign={1}
        threshold={56}
        hint="松开，进房间"
        commitBehavior="morph"
        onProgress={(t) => {
          pullRef.current = t;
          setPull(t);
        }}
        onCommit={enter}
        className="relative w-[min(92%,22rem)]"
      >
        <div ref={cardRef} className="relative h-[22rem] w-full overflow-visible">
          {!diving ? (
            <svg
              width={box.w}
              height={box.h + 80}
              viewBox={`0 0 ${box.w} ${box.h + 80}`}
              className="pointer-events-none absolute top-0 left-0 overflow-visible"
              aria-hidden
            >
              <PaperSheet points={points} u={u} />
            </svg>
          ) : null}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center px-6 py-8"
            style={{ ["--pop-delay" as string]: "2s" }}
            animate={{ opacity: diving ? 0 : Math.max(0, 1 - pull * 1.35) }}
            transition={{ duration: 0.1 }}
          >
            <h1
              className="font-latin text-[clamp(2.6rem,13vw,4.4rem)] font-bold leading-[0.84] tracking-wide text-ink"
              style={{ textShadow: "0 2px 0 #d9ccb4, 0 5px 0 #cbbda3, 0 12px 18px rgba(26,39,68,0.2)" }}
            >
              <span className="block">
                <LetterPop text="PAPER" />
              </span>
              <span className="block">
                <LetterPop text="ECHO" start={5} />
              </span>
            </h1>
            <p className="clip-up-mask mt-4 font-display text-[1.05rem] tracking-[0.28em] text-ink/70">
              <span className={reduce ? undefined : "clip-up"}>纸上的回声</span>
            </p>
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
          enabled={!diving}
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
