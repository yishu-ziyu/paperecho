import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { sfxCharge, sfxFold, unlockAudio } from "../audio";
import { Guide } from "../components/Guide";
import { Plane } from "../components/Plane";
import { CRAFT_ID } from "../continuum";
import { spring } from "../motion";
import { clampHeading, headingToward, rubberAxis } from "../planeLook";
import { useGame } from "../store";

function liftOf(deg: number) {
  return Math.sin((Math.max(0, Math.min(180, deg)) * Math.PI) / 180);
}

function flapShadow(deg: number) {
  const k = liftOf(deg);
  const down = 1 - k;
  return `drop-shadow(${(-10 * k).toFixed(1)}px ${(8 + 14 * k).toFixed(1)}px ${(6 + 20 * k).toFixed(1)}px rgba(12,20,40,${(0.1 + 0.32 * k).toFixed(2)})) drop-shadow(0 ${(3.5 * down).toFixed(1)}px 0 rgba(80,64,40,${(0.2 * down).toFixed(2)}))`;
}

function FoldingSheet({
  body,
  folds,
  pull,
  busy,
  reduce,
}: {
  body: string;
  folds: number;
  pull: MotionValue<number>;
  busy: boolean;
  reduce: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const foldsRef = useRef(folds);
  foldsRef.current = folds;
  const [box, setBox] = useState({ w: 320, h: 224, s: 128 });
  const idleR = useMotionValue(reduce ? 8 : 14);
  const idleL = useMotionValue(10);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setBox({ w, h, s: Math.round(Math.min(w, h) * 0.46) });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (reduce || busy || folds !== 0) {
      idleR.stop();
      idleR.set(folds === 0 && reduce ? 8 : 0);
      return;
    }
    const ctrl = animate(idleR, [12, 24, 12], { duration: 2.6, repeat: Infinity, ease: "easeInOut" });
    return () => ctrl.stop();
  }, [busy, folds, idleR, reduce]);

  useEffect(() => {
    if (reduce || busy || folds !== 1) {
      idleL.stop();
      idleL.set(0);
      return;
    }
    const ctrl = animate(idleL, [10, 20, 10], { duration: 2.5, repeat: Infinity, ease: "easeInOut" });
    return () => ctrl.stop();
  }, [busy, folds, idleL, reduce]);

  const angleR = useTransform([pull, idleR], ([p, i]: number[]) => {
    if (foldsRef.current >= 1) return 180;
    const live = Math.max(0, Math.min(1, p)) * 180;
    if (reduce) return live;
    return Math.min(180, live + (p > 0.02 ? 0 : i));
  });
  const angleL = useTransform([pull, idleL], ([p, i]: number[]) => {
    if (foldsRef.current === 0) return 0;
    const live = Math.max(0, Math.min(1, p)) * 180;
    if (reduce) return live;
    return Math.min(180, live + (p > 0.02 ? 0 : i));
  });
  const rotR = useTransform(angleR, (a) => `rotate3d(1, 1, 0, ${-a}deg)`);
  const rotL = useTransform(angleL, (a) => `rotate3d(-1, 1, 0, ${a}deg)`);
  const shadowR = useTransform(angleR, flapShadow);
  const shadowL = useTransform(angleL, flapShadow);
  const castR = useTransform(angleR, liftOf);
  const castL = useTransform(angleL, liftOf);
  const creaseR = useTransform(angleR, (a) => Math.max(0, (a - 100) / 80));
  const creaseL = useTransform(angleL, (a) => Math.max(0, (a - 100) / 80));
  const frontOpR = useTransform(angleR, (a) => (a < 92 ? 1 : 0));
  const frontOpL = useTransform(angleL, (a) => (a < 92 ? 1 : 0));
  const back3dOpR = useTransform(angleR, (a) => (a < 88 ? 1 : 0));
  const back3dOpL = useTransform(angleL, (a) => (a < 88 ? 1 : 0));
  const landOpR = useTransform(angleR, (a) => (a < 88 ? 0 : Math.min(1, (a - 88) / 52)));
  const landOpL = useTransform(angleL, (a) => (a < 88 ? 0 : Math.min(1, (a - 88) / 52)));

  const { w, s } = box;
  const clip =
    folds >= 1
      ? `polygon(${s}px 0, calc(100% - ${s}px) 0, 100% ${s}px, 100% 100%, 0 100%, 0 ${s}px)`
      : `polygon(0 0, calc(100% - ${s}px) 0, 100% ${s}px, 100% 100%, 0 100%)`;
  const letter = (
    <p className="text-sm leading-relaxed text-ink/70">{body || <span className="italic text-ink/45">一张空白。也可以寄出。</span>}</p>
  );

  return (
    <div
      ref={rootRef}
      className="fold-sheet relative h-full w-full"
      data-fold={folds}
      style={{ ["--fold-s" as string]: `${s}px` }}
    >
      <div className="fold-base" style={{ clipPath: clip }}>
        <div className="absolute inset-4">{letter}</div>
      </div>
      <motion.div
        className="fold-cast fold-cast-tr"
        style={{ width: s, height: s, opacity: castR }}
        aria-hidden
      />
      <motion.div
        className="fold-hinge fold-hinge-tr"
        style={{ width: s, height: s, transform: rotR, zIndex: 3 }}
      >
        <motion.div className="fold-flap fold-flap-front" style={{ filter: shadowR, opacity: frontOpR }}>
          <div className="fold-letter-clone" style={{ width: w, left: -(w - s) }}>
            {letter}
          </div>
          {folds === 0 ? <span className="fold-grab fold-grab-tr" /> : null}
        </motion.div>
        <motion.div className="fold-flap fold-flap-back" style={{ opacity: back3dOpR }} />
      </motion.div>
      <motion.div className="fold-land fold-land-tr" style={{ width: s, height: s, opacity: landOpR, z: 2 }} aria-hidden />
      <motion.div className="fold-crease fold-crease-tr" style={{ width: s, height: s, opacity: creaseR }} aria-hidden />
      {folds >= 1 ? (
        <>
          <motion.div
            className="fold-cast fold-cast-tl"
            style={{ width: s, height: s, opacity: castL }}
            aria-hidden
          />
          <motion.div
            className="fold-hinge fold-hinge-tl"
            style={{ width: s, height: s, transform: rotL, zIndex: 3 }}
          >
            <motion.div className="fold-flap fold-flap-front fold-flap-tl" style={{ filter: shadowL, opacity: frontOpL }}>
              <div className="fold-letter-clone" style={{ width: w, left: 0 }}>
                {letter}
              </div>
              <span className="fold-grab fold-grab-tl" />
            </motion.div>
            <motion.div className="fold-flap fold-flap-back fold-flap-tl" style={{ opacity: back3dOpL }} />
          </motion.div>
          <motion.div className="fold-land fold-land-tl" style={{ width: s, height: s, opacity: landOpL, z: 2 }} aria-hidden />
          <motion.div className="fold-crease fold-crease-tl" style={{ width: s, height: s, opacity: creaseL }} aria-hidden />
        </>
      ) : null}
    </div>
  );
}

export function FoldPhase() {
  const folds = useGame((s) => s.folds);
  const foldOnce = useGame((s) => s.foldOnce);
  const goThrow = useGame((s) => s.goThrow);
  const letterChips = useGame((s) => s.letterChips);
  const extraLine = useGame((s) => s.extraLine);
  const mirror = useGame((s) => s.selectedMirror);
  const start = useRef<{ x: number; y: number } | null>(null);
  const grabOrigin = useRef({ x: 0, y: 0 });
  const foldRef = useRef(folds);
  const dragging = useRef(false);
  const leavingRef = useRef(false);
  const locking = useRef(false);
  const armedOnce = useRef(false);
  const restRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  foldRef.current = folds;
  const reduce = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const pull = useMotionValue(0);
  const planeX = useMotionValue(0);
  const planeY = useMotionValue(0);
  const heading = useMotionValue(0);
  const hintOpacity = useTransform(pull, [0, 0.42, 1], [0.1, 1, 1]);
  const body = extraLine.trim() || letterChips.slice(0, 3).join(" · ") || mirror || "";

  function windowDelta() {
    const rest = restRef.current?.getBoundingClientRect();
    const win = windowRef.current?.getBoundingClientRect();
    if (!rest || !win) return { dx: 0, dy: -80 };
    return {
      dx: win.left + win.width / 2 - (rest.left + rest.width / 2),
      dy: win.top + win.height / 2 - (rest.top + rest.height / 2),
    };
  }

  useEffect(() => {
    if (folds < 2) return;
    const { dx, dy } = windowDelta();
    void animate(heading, clampHeading(headingToward(dx, dy), 22), spring.settle);
  }, [folds, heading]);

  useEffect(() => {
    if (folds < 2 || reduce || leaving) return;
    function onHover(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      if (dragging.current || leavingRef.current) return;
      const rest = restRef.current?.getBoundingClientRect();
      if (!rest) return;
      const dx = e.clientX - (rest.left + rest.width / 2);
      const dy = e.clientY - (rest.top + rest.height / 2);
      heading.set(clampHeading(headingToward(dx, dy), 36));
      planeX.set(rubberAxis(dx * 0.14, 22));
      planeY.set(rubberAxis(dy * 0.1, 16));
    }
    window.addEventListener("pointermove", onHover, { passive: true });
    return () => window.removeEventListener("pointermove", onHover);
  }, [folds, reduce, leaving, heading, planeX, planeY]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current || !start.current) return;
      if (foldRef.current >= 2) {
        if (leavingRef.current) return;
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;
        planeX.set(rubberAxis(grabOrigin.current.x + dx, 88));
        planeY.set(rubberAxis(grabOrigin.current.y + dy, 170));
        heading.set(clampHeading(headingToward(dx, dy), 52));
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
        setBusy(false);
        if (leavingRef.current) return;
        const aim = windowDelta();
        const up = -planeY.get();
        const nearWindow = Math.hypot(aim.dx, aim.dy) < 64;
        if (up > 40 || nearWindow) {
          leavingRef.current = true;
          setLeaving(true);
          void animate(planeX, planeX.get() + aim.dx, spring.launch);
          void animate(planeY, planeY.get() + aim.dy - 28, spring.launch);
          void animate(heading, clampHeading(headingToward(aim.dx, aim.dy), 28), spring.launch);
          window.setTimeout(() => {
            if (useGame.getState().phase === "fold") goThrow();
          }, 480);
        } else {
          void animate(planeX, 0, spring.settle);
          void animate(planeY, 0, spring.settle);
          const rest = windowDelta();
          void animate(heading, clampHeading(headingToward(rest.dx, rest.dy), 22), spring.settle);
        }
        return;
      }
      const v = pull.get();
      if (v > 0.42) {
        locking.current = true;
        sfxFold();
        void animate(pull, 1, spring.snap).then(() => {
          foldOnce();
          pull.set(0);
          setArmed(false);
          armedOnce.current = false;
          locking.current = false;
          setBusy(false);
        });
      } else {
        setArmed(false);
        armedOnce.current = false;
        setBusy(false);
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
  }, [foldOnce, goThrow, heading, planeX, planeY, pull]);

  function arm(x: number, y: number) {
    if (leavingRef.current || locking.current) return;
    unlockAudio();
    pull.stop();
    setBusy(true);
    planeX.stop();
    planeY.stop();
    heading.stop();
    grabOrigin.current = { x: planeX.get(), y: planeY.get() };
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
        <div ref={windowRef} className="relative mx-auto mt-2 h-20 w-full max-w-md overflow-hidden">
          <div className="absolute left-1/2 top-[-2.2rem] h-[5.5rem] w-[5.5rem] -translate-x-1/2 rounded-[28%] bg-paper/16 shadow-[inset_0_0_0_3px_color-mix(in_oklab,var(--color-paper)_22%,transparent)]" />
          <p className="relative z-[1] pt-8 text-center text-xs tracking-[0.2em] text-paper/70">窗</p>
        </div>
      ) : null}
      <div className="relative mx-auto mt-4 flex w-full max-w-md flex-1 items-center justify-center overflow-visible" style={{ perspective: 720 }}>
        <div className="flex w-full justify-center">
          {folds >= 2 ? (
            <motion.div
              ref={restRef}
              layoutId={CRAFT_ID}
              data-craft=""
              data-pull="window"
              className="h-28 w-24 touch-none cursor-grab will-change-transform active:cursor-grabbing"
              style={{ x: planeX, y: planeY, rotate: heading }}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                arm(e.clientX, e.clientY);
              }}
            >
              <Plane className="h-full w-full" />
            </motion.div>
          ) : (
            <motion.div
              layoutId={CRAFT_ID}
              data-craft=""
              data-pull="fold"
              className="relative h-56 w-[min(88%,20rem)] cursor-grab touch-none overflow-visible active:cursor-grabbing"
              style={{ transformStyle: "preserve-3d" }}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                arm(e.clientX, e.clientY);
              }}
            >
              <FoldingSheet body={body} folds={folds} pull={pull} busy={busy} reduce={Boolean(reduce)} />
              <motion.span
                className="pointer-events-none absolute bottom-3 left-1/2 z-[4] -translate-x-1/2 text-[0.65rem] tracking-[0.18em] text-coral"
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
