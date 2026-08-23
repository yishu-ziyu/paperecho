import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { sfxCharge, sfxFold, unlockAudio } from "../audio";
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
  const extraLine = useGame((s) => s.extraLine);
  const mirror = useGame((s) => s.selectedMirror);
  const start = useRef<{ x: number; y: number } | null>(null);
  const foldRef = useRef(folds);
  const dragging = useRef(false);
  const leavingRef = useRef(false);
  const armedOnce = useRef(false);
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
  const hintOpacity = useTransform(pull, [0, 0.42, 1], [0.1, 1, 1]);
  const body = extraLine.trim() || letterChips.slice(0, 3).join(" · ") || mirror;

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
      const nextArmed = v > 0.42;
      if (nextArmed && !armedOnce.current) {
        armedOnce.current = true;
        sfxCharge();
        navigator.vibrate?.(10);
      }
      if (!nextArmed) armedOnce.current = false;
      setArmed(nextArmed);
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
        armedOnce.current = false;
      } else {
        setArmed(false);
        armedOnce.current = false;
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
    unlockAudio();
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
        <div className="relative mx-auto mt-2 h-20 w-full max-w-md overflow-hidden">
          <div className="absolute left-1/2 top-[-2.2rem] h-[5.5rem] w-[5.5rem] -translate-x-1/2 rounded-[28%] bg-paper/16 shadow-[inset_0_0_0_3px_color-mix(in_oklab,var(--color-paper)_22%,transparent)]" />
          <p className="relative z-[1] pt-8 text-center text-xs tracking-[0.2em] text-paper/70">窗</p>
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
              className="clay relative h-56 w-[min(88%,20rem)] origin-top-right cursor-grab touch-none active:cursor-grabbing"
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
              <motion.div
                className="pointer-events-none absolute inset-4 text-sm leading-relaxed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
              >
                {body ? (
                  <p className="text-ink/70">{body}</p>
                ) : (
                  <p className="italic text-ink/45">一张空白。也可以寄出。</p>
                )}
              </motion.div>
              <motion.span
                className="pointer-events-none absolute right-3 top-3 size-4 rounded-full"
                style={{
                  background: cornerBg,
                  boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-coral) 80%, transparent)",
                }}
              />
              <motion.span
                className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[0.65rem] tracking-[0.18em] text-coral"
                style={{ opacity: hintOpacity }}
              >
                {armed ? "松开，折住" : "往对角拉"}
              </motion.span>
            </motion.div>
          )}
        </div>
      </div>
      <p className="pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-paper/55">
        {folds >= 2 ? (leaving ? "飞向窗边" : "往上送") : armed ? "继续拉" : "没有按钮。用手折。"}
      </p>
    </div>
  );
}
