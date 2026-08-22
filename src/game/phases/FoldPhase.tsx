import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { sfxFold } from "../audio";
import { Guide } from "../components/Guide";
import { Plane } from "../components/Plane";
import { CRAFT_ID } from "../continuum";
import { spring } from "../motion";
import { useGame } from "../store";

export function FoldPhase() {
  const folds = useGame((s) => s.folds);
  const foldOnce = useGame((s) => s.foldOnce);
  const goThrow = useGame((s) => s.goThrow);
  const letterChips = useGame((s) => s.letterChips);
  const mirror = useGame((s) => s.selectedMirror);
  const start = useRef<{ x: number; y: number } | null>(null);
  const foldRef = useRef(folds);
  const dragging = useRef(false);
  const leavingRef = useRef(false);
  foldRef.current = folds;
  const [leaving, setLeaving] = useState(false);
  const [armed, setArmed] = useState(false);
  const pull = useMotionValue(0);
  const planeY = useMotionValue(0);
  const rot = useTransform(pull, (v) => -4 + v * (foldRef.current === 0 ? 22 : -16));
  const skew = useTransform(pull, (v) => -v * 8);
  const shade = useTransform(pull, (v) => Math.min(0.4, v * 0.45 + (foldRef.current === 1 ? 0.12 : 0)));
  const crease = useTransform(pull, (v) => (foldRef.current === 0 ? v * 180 : 180));
  const shadeBg = useTransform(shade, (s) => `linear-gradient(90deg, transparent, rgba(36,48,68,${s}))`);
  const creaseY = useTransform(crease, (c) => Math.min(28, c * 0.15));
  const cornerBg = useTransform(pull, (v) => `color-mix(in oklab, var(--color-coral) ${20 + v * 80}%, transparent)`);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current || !start.current) return;
      if (foldRef.current >= 2) {
        if (leavingRef.current) return;
        const dy = e.clientY - start.current.y;
        planeY.set(Math.min(40, dy));
        return;
      }
      const dx = start.current.x - e.clientX;
      const dy = e.clientY - start.current.y;
      const v = Math.max(0, Math.min(1, (dx * 0.7 + dy) / 110));
      pull.set(v);
      setArmed(v > 0.42);
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      start.current = null;
      if (foldRef.current >= 2) {
        if (leavingRef.current) return;
        const up = -planeY.get();
        if (up > 40) {
          leavingRef.current = true;
          setLeaving(true);
          void animate(planeY, -240, spring.launch);
          window.setTimeout(() => {
            if (useGame.getState().phase === "fold") goThrow();
          }, 480);
        } else {
          void animate(planeY, 0, spring.settle);
        }
        return;
      }
      const v = pull.get();
      if (v > 0.42) {
        sfxFold();
        foldOnce();
        pull.set(0);
        setArmed(false);
      } else {
        setArmed(false);
        void animate(pull, 0, spring.snap);
      }
    }
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onUp, { capture: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
    };
  }, [foldOnce, goThrow, planeY, pull]);

  function arm(x: number, y: number) {
    if (leavingRef.current) return;
    pull.stop();
    planeY.stop();
    start.current = { x, y };
    dragging.current = true;
  }

  return (
    <div className="flex flex-1 flex-col px-4">
      <Guide
        title={folds === 0 ? "捏住右上角，折下来" : folds === 1 ? "再折一刀，成飞机" : "把飞机送到窗边"}
        body={
          folds >= 2
            ? "按住飞机，往上送到那道光。"
            : "手指按住纸，往对角拉。拉够了松手才折住。点按不算。"
        }
      />
      {folds >= 2 ? (
        <div className="relative mx-auto mt-2 h-16 w-full max-w-md overflow-hidden rounded-t-3xl">
          <div className="absolute inset-x-8 top-0 h-10 rounded-b-full bg-paper/35 blur-[1px]" />
          <p className="relative z-[1] pt-3 text-center text-xs tracking-[0.2em] text-ink/45">窗</p>
        </div>
      ) : null}
      <div className="relative mx-auto mt-4 flex w-full max-w-md flex-1 items-center justify-center" style={{ perspective: 900 }}>
        <div className="flex w-full justify-center">
          {folds >= 2 ? (
            <motion.div
              layoutId={CRAFT_ID}
              data-craft=""
              data-pull="window"
              className="touch-none cursor-grab active:cursor-grabbing"
              style={{ y: planeY }}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                arm(e.clientX, e.clientY);
              }}
            >
              <Plane className="h-24 w-44" />
            </motion.div>
          ) : (
            <motion.div
              layoutId={CRAFT_ID}
              data-craft=""
              data-pull="fold"
              className="relative h-56 w-[min(88%,20rem)] origin-top-right cursor-grab touch-none bg-paper shadow-xl active:cursor-grabbing"
              style={{
                rotate: rot,
                skewX: skew,
                clipPath:
                  folds === 1
                    ? "polygon(0 18%, 100% 0, 100% 100%, 0 100%)"
                    : "polygon(0 0, 100% 0, 100% 100%, 0 100%)",
                transformStyle: "preserve-3d",
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                arm(e.clientX, e.clientY);
              }}
            >
              <motion.div
                className="pointer-events-none absolute inset-y-0 right-0 w-1/2 origin-left"
                style={{
                  background: shadeBg,
                  rotateY: creaseY,
                }}
              />
              <div className="pointer-events-none absolute inset-4 text-sm leading-relaxed text-ink/70">
                {mirror || letterChips.slice(0, 3).join(" · ")}
              </div>
              <motion.span
                className="pointer-events-none absolute right-3 top-3 size-4 rounded-full"
                style={{
                  background: cornerBg,
                  boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-coral) 80%, transparent)",
                }}
              />
              {armed ? (
                <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[0.65rem] tracking-[0.18em] text-coral">
                  松开，折住
                </span>
              ) : null}
            </motion.div>
          )}
        </div>
      </div>
      <p className="pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-ink/35">
        {folds >= 2 ? (leaving ? "飞向窗边" : "往上送") : armed ? "继续拉" : "没有按钮。用手折。"}
      </p>
    </div>
  );
}
