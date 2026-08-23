import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { sfxBloom, sfxCharge, sfxSnap, sfxThrow, sfxWhoosh } from "../audio";
import { Globe } from "../components/Globe";
import { Guide } from "../components/Guide";
import { Plane } from "../components/Plane";
import { CRAFT_ID } from "../continuum";
import { ownedOf } from "../emotions";
import { bloomOrder, emptyBloom, type BloomMap } from "../globeBloom";
import {
  FIRE_THRESHOLD,
  FULL_THRESHOLD,
  MAX_PULL_PX,
  ease,
  powerOf,
  rubberY,
  spring,
  squashX,
} from "../motion";
import { REGIONS } from "../stories";
import { useGame } from "../store";
import type { RegionId } from "../types";

type Beat = "dive" | "bloom" | "ready";

/**
 * Window → paper plane flies into the earth → windows bloom → slingshot.
 * Arrival is short and the globe can be turned while lights open.
 */
export function ThrowPhase() {
  const region = useGame((s) => s.region);
  const pickRegion = useGame((s) => s.pickRegion);
  const launch = useGame((s) => s.launch);
  const fingerprint = useGame((s) => s.fingerprint);
  const reduce = useReducedMotion();
  const start = useRef<{ x: number; y: number } | null>(null);
  const last = useRef({ p: 0, x: 0, y: 0 });
  const chargedOnce = useRef(false);
  const hinted = useRef(false);
  const hintTimer = useRef(0);
  const chargeRef = useRef(0);
  const draggingRef = useRef(false);
  const thrownRef = useRef(false);
  const readyRef = useRef(Boolean(reduce));
  const restRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<HTMLDivElement>(null);
  const bloomRef = useRef<BloomMap>(emptyBloom(reduce ? 1 : 0));
  const awakeRef = useRef(reduce ? 1 : 0.08);
  const [dragging, setDragging] = useState(false);
  const [thrown, setThrown] = useState(false);
  const [beat, setBeat] = useState<Beat>(reduce ? "ready" : "dive");
  const [facing, setFacing] = useState<RegionId | null>(null);
  const [full, setFull] = useState(false);
  const y = useMotionValue(reduce ? 0 : -36);
  const x = useMotionValue(0);
  const rot = useMotionValue(reduce ? 0 : -12);
  const power = useMotionValue(0);
  const stretch = useMotionValue(1);
  const fade = useMotionValue(1);
  const bandY = useMotionValue(0);
  const bandX = useMotionValue(0);
  const globeScale = useMotionValue(reduce ? 1 : 0.78);
  const globeY = useMotionValue(reduce ? 0 : 28);
  const punch = useMotionValue(0);
  const craftScale = useMotionValue(reduce ? 1 : 1.08);
  const aperture = useMotionValue(reduce ? 0 : 1);
  const gear = useMotionValue(reduce ? 1 : 0);
  const planeScaleX = useTransform([stretch, craftScale], (v) => squashX(Number(v[0])) * Number(v[1]));
  const planeScaleY = useTransform([stretch, craftScale], (v) => Number(v[0]) * Number(v[1]));
  const leftD = useTransform([bandY, bandX], slingPath(-42));
  const rightD = useTransform([bandY, bandX], slingPath(42));
  const bandOpacity = useTransform([power, gear], (v) => {
    const p = Number(v[0]);
    const g = Number(v[1]);
    if (p < 0.06) return 0.15 * g;
    return (0.7 + p * 0.3) * g;
  });
  const bandWidth = useTransform(power, [0, 1], [1.6, 3.4]);
  const aimed = region ?? facing;
  const place = REGIONS.find((r) => r.id === (region || facing));
  const feels = ownedOf(fingerprint, 0.3).map((f) => f.id);

  const destRef = useRef<RegionId | null>(null);
  destRef.current = region ?? facing;

  useEffect(() => {
    if (reduce) {
      readyRef.current = true;
      setBeat("ready");
      bloomRef.current = emptyBloom(1);
      awakeRef.current = 1;
      return;
    }

    let cancelled = false;
    let bloomTimer = 0;
    const order = bloomOrder(feels);
    sfxWhoosh();

    const wake = (from: number, to: number, ms: number) => {
      const t0 = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - t0) / ms);
        awakeRef.current = from + (to - from) * t;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const lightOne = (id: RegionId, done: () => void) => {
      const t0 = performance.now();
      const step = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - t0) / 220);
        bloomRef.current = { ...bloomRef.current, [id]: t };
        if (t < 1) requestAnimationFrame(step);
        else done();
      };
      sfxBloom();
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
      requestAnimationFrame(step);
    };

    const startBloom = () => {
      if (cancelled) return;
      setBeat("bloom");
      let i = 0;
      const next = () => {
        if (cancelled) return;
        const id = order[i++];
        if (!id) {
          readyRef.current = true;
          setBeat("ready");
          return;
        }
        lightOne(id, () => {
          bloomTimer = window.setTimeout(next, 100);
        });
      };
      next();
    };

    const dive = () => {
      const aim = aimPoint();
      wake(0.08, 0.62, 720);
      void animate(y, aim.y, spring.launch);
      void animate(x, aim.x, spring.launch);
      void animate(rot, 16, spring.launch);
      void animate(craftScale, 0.26, { duration: 0.62, ease: ease.exit });
      void animate(globeScale, 1.05, spring.parent);
      void animate(globeY, -4, spring.parent);
      void animate(aperture, 0, { duration: 0.68, ease: ease.exit, delay: 0.22 });
      window.setTimeout(() => {
        if (cancelled || useGame.getState().phase !== "throw") return;
        void animate(punch, 0, { type: "spring", stiffness: 420, damping: 22, velocity: 140 });
        void animate(y, 0, spring.parent);
        void animate(x, 0, spring.parent);
        void animate(rot, 0, spring.settle);
        void animate(craftScale, 1, spring.parent);
        void animate(gear, 1, { duration: 0.36, ease: ease.enter });
        wake(awakeRef.current, 1, 640);
        startBloom();
      }, 700);
    };

    const boot = window.requestAnimationFrame(() => {
      if (!cancelled) dive();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(boot);
      window.clearTimeout(bloomTimer);
    };
    // feels is stable enough for one arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  useMotionValueEvent(power, "change", (v) => {
    chargeRef.current = v;
    const next = v >= FULL_THRESHOLD;
    setFull((prev) => (prev === next ? prev : next));
    if (next && !chargedOnce.current && !thrownRef.current) {
      chargedOnce.current = true;
      sfxCharge();
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
    }
    if (v < 0.4) chargedOnce.current = false;
  });

  useEffect(() => {
    if (reduce || thrown || dragging || !aimed || hinted.current || beat !== "ready") return;
    hintTimer.current = window.setTimeout(() => {
      if (Math.abs(y.get()) > 2 || start.current || thrownRef.current) return;
      hinted.current = true;
      void animate(y, 18, { type: "spring", stiffness: 260, damping: 16 }).then(() => {
        if (!start.current && !thrownRef.current) void animate(y, 0, spring.snap);
      });
    }, 1600);
    return () => window.clearTimeout(hintTimer.current);
  }, [reduce, thrown, dragging, aimed, y, beat]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      pull(e.clientX, e.clientY);
    }
    function onUp() {
      if (!draggingRef.current) return;
      release();
    }
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onUp, { capture: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
    };
  }, []);

  function arm(clientX: number, clientY: number) {
    if (!readyRef.current || thrownRef.current) return;
    y.stop();
    x.stop();
    rot.stop();
    stretch.stop();
    fade.stop();
    bandY.stop();
    bandX.stop();
    start.current = { x: clientX - x.get(), y: clientY - y.get() };
    draggingRef.current = true;
    setDragging(true);
  }

  function pull(clientX: number, clientY: number) {
    if (!start.current || thrownRef.current) return;
    const rawY = Math.max(0, clientY - start.current.y);
    const rawX = clientX - start.current.x;
    const mappedY = Math.min(MAX_PULL_PX, rubberY(rawY));
    const mappedX = Math.max(-64, Math.min(64, rawX * 0.62));
    const p = powerOf(mappedY);
    y.set(mappedY);
    x.set(mappedX);
    bandY.set(mappedY);
    bandX.set(mappedX);
    rot.set(-mappedX * 0.18 - p * 8);
    power.set(p);
    stretch.set(1 + p * 0.24);
    globeScale.set(1 - p * 0.055);
    globeY.set(p * 10);
    last.current = { p, x: mappedX, y: mappedY };
  }

  function release() {
    if (!start.current) return;
    draggingRef.current = false;
    setDragging(false);
    const fromY = Math.max(Math.abs(y.get()), last.current.y);
    const p = Math.min(1, Math.max(powerOf(fromY), last.current.p));
    const dest = destRef.current;
    start.current = null;
    const tapThrow = Boolean(reduce && dest && p < FIRE_THRESHOLD);
    if ((p > FIRE_THRESHOLD || tapThrow) && dest) {
      fire(tapThrow ? Math.max(p, 0.62) : p, dest);
    } else {
      sfxSnap();
      void animate(y, 0, spring.snap);
      void animate(x, 0, spring.snap);
      void animate(bandY, 0, spring.snap);
      void animate(bandX, 0, spring.snap);
      void animate(rot, 0, spring.snap);
      void animate(stretch, 1, spring.settle);
      void animate(globeScale, 1, spring.parent);
      void animate(globeY, 0, spring.parent);
      power.set(0);
    }
  }

  function fire(p: number, dest: RegionId) {
    if (thrownRef.current) return;
    thrownRef.current = true;
    if (!region) pickRegion(dest);
    setThrown(true);
    window.clearTimeout(hintTimer.current);
    sfxThrow();
    sfxWhoosh();
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([8, 28, 18]);

    const incomingY = y.getVelocity();
    const incomingX = x.getVelocity();
    const launchVel = -(Math.max(480, Math.abs(incomingY) * 1.55) + p * 1280);

    const go = () => {
      const aim = aimPoint();
      void animate(bandY, 0, spring.snap);
      void animate(bandX, 0, spring.snap);
      void animate(power, 0, { duration: 0.32, ease: [0.3, 0, 0.8, 0.15] });
      void animate(stretch, 0.78, { duration: 0.28, ease: [0.3, 0, 0.8, 0.15] });
      void animate(craftScale, 0.22, { duration: 0.7, ease: ease.exit });
      void animate(y, aim.y, { ...spring.launch, velocity: launchVel });
      void animate(x, aim.x, { ...spring.launch, velocity: incomingX * 0.55 });
      void animate(rot, 18 + last.current.x * -0.08, spring.launch);
      void animate(globeScale, 1.08, spring.parent);
      void animate(globeY, -10, spring.parent);
      void animate(punch, 0, { type: "spring", stiffness: 420, damping: 22, velocity: 150 });
      window.setTimeout(() => {
        if (useGame.getState().phase === "throw") launch(p);
      }, reduce ? 260 : 760);
    };

    if (reduce) {
      go();
      return;
    }
    void animate(stretch, 1.3, { duration: 0.05, ease: "easeIn" }).then(go);
  }

  function aimPoint() {
    const rest = restRef.current?.getBoundingClientRect();
    const globe = globeRef.current?.getBoundingClientRect();
    if (!rest || !globe) {
      return { x: 0, y: -Math.round(Math.min(window.innerHeight * 0.38, 320)) };
    }
    return {
      x: globe.left + globe.width / 2 - (rest.left + rest.width / 2),
      y: globe.top + globe.height * 0.42 - (rest.top + rest.height / 2),
    };
  }

  const guide =
    beat === "dive"
      ? { title: "飞进地球", body: "同一架飞机，从窗穿过去。" }
      : beat === "bloom"
        ? { title: "灯是别人的窗", body: "一盏一盏开。" }
        : { title: "转地球，拉飞机", body: "转到那盏窗。拉满再放。" };

  const cue = thrown
    ? "在飞"
    : beat === "dive"
      ? "飞进去"
      : beat === "bloom"
        ? "灯在开"
        : full
          ? "松手"
          : reduce && aimed
            ? "点飞机投出"
            : aimed
              ? "拉满再放"
              : "先转地球";

  return (
    <motion.div className="relative flex min-h-0 flex-1 flex-col px-4" style={{ y: punch }}>
      <motion.div
        className="pointer-events-none absolute inset-0 z-[8]"
        style={{ opacity: aperture }}
        aria-hidden
      >
        <div className="throw-window absolute inset-0" />
      </motion.div>
      <Guide tone="night" title={guide.title} body={guide.body} />
      <motion.div
        ref={globeRef}
        className="relative mx-auto mt-1 flex w-[min(82vw,21rem)] flex-1 items-center will-change-transform"
        style={{ scale: globeScale, y: globeY }}
      >
        <div className="relative w-full">
          <motion.div
            className="throw-window-ring pointer-events-none absolute inset-[-4%] rounded-full"
            style={{ opacity: aperture }}
            aria-hidden
          />
          <Globe
            selected={region}
            throwing={thrown}
            chargeRef={chargeRef}
            bloomRef={bloomRef}
            awakeRef={awakeRef}
            onPick={pickRegion}
            onFacing={setFacing}
          />
        </div>
      </motion.div>
      <p className="min-h-6 text-center text-sm text-paper/80">
        {beat !== "ready"
          ? "\u00a0"
          : region && place
            ? `飞向 ${place.city}`
            : place
              ? `对着 ${place.city}，拉飞机`
              : "转一转，找到一个亮点"}
      </p>
      <div
        data-throw-well
        className="relative mx-auto mt-1 h-40 w-full max-w-md touch-none overflow-visible"
        onPointerDown={(e) => {
          if (thrownRef.current || !readyRef.current) return;
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          arm(e.clientX, e.clientY);
        }}
      >
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          viewBox="0 0 240 160"
          aria-hidden
        >
          <motion.circle cx="78" cy="30" r="3.8" className="sling-post" style={{ opacity: gear }} />
          <motion.circle cx="162" cy="30" r="3.8" className="sling-post" style={{ opacity: gear }} />
          <motion.path d={leftD} className="sling-band" style={{ opacity: bandOpacity, strokeWidth: bandWidth }} />
          <motion.path d={rightD} className="sling-band" style={{ opacity: bandOpacity, strokeWidth: bandWidth }} />
        </svg>
        {thrown ? (
          <>
            <Trail x={x} y={y} rot={rot} scaleX={planeScaleX} stretch={planeScaleY} fade={fade} offset={18} opacity={0.22} />
            <Trail x={x} y={y} rot={rot} scaleX={planeScaleX} stretch={planeScaleY} fade={fade} offset={36} opacity={0.12} />
            <Trail x={x} y={y} rot={rot} scaleX={planeScaleX} stretch={planeScaleY} fade={fade} offset={54} opacity={0.06} />
          </>
        ) : null}
        <motion.div
          ref={restRef}
          layoutId={CRAFT_ID}
          data-craft=""
          className="absolute left-1/2 top-1 h-20 w-36 will-change-transform"
          style={{ x, y, rotate: rot, scaleX: planeScaleX, scaleY: planeScaleY, opacity: fade, marginLeft: -72 }}
        >
          <Plane className="h-full w-full" charged={full && !thrown} />
        </motion.div>
        <div className="pointer-events-none absolute bottom-3 left-1/2 w-36 -translate-x-1/2">
          <motion.div className="h-1 overflow-hidden rounded-full bg-paper/20" style={{ opacity: gear }}>
            <motion.div className="h-full origin-left rounded-full bg-coral" style={{ scaleX: power }} />
          </motion.div>
        </div>
      </div>
      <p data-throw-cue className="pb-6 text-center text-xs text-paper/40">
        {cue}
      </p>
    </motion.div>
  );
}

function slingPath(side: number) {
  return (latest: number[]) => {
    const py = latest[0] ?? 0;
    const px = latest[1] ?? 0;
    const bx = 120 + px * 0.55;
    const by = 40 + Math.min(108, py * 0.7);
    const cpx = 120 + side * 0.35 + px * 0.2;
    const cpy = 30 + (by - 30) * 0.45;
    return `M ${120 + side} 30 Q ${cpx} ${cpy} ${bx} ${by}`;
  };
}

function Trail({
  x,
  y,
  rot,
  scaleX,
  stretch,
  fade,
  offset,
  opacity,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rot: MotionValue<number>;
  scaleX: MotionValue<number>;
  stretch: MotionValue<number>;
  fade: MotionValue<number>;
  offset: number;
  opacity: number;
}) {
  const trailed = useTransform(y, (v) => v + offset);
  const ghost = useTransform(fade, (v) => v * opacity);
  return (
    <motion.div
      className="pointer-events-none absolute left-1/2 top-1 h-20 w-36"
      style={{ x, y: trailed, rotate: rot, scaleX, scaleY: stretch, opacity: ghost, marginLeft: -72 }}
    >
      <Plane className="h-full w-full" />
    </motion.div>
  );
}
