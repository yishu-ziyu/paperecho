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
import { sfxCharge, sfxSnap, sfxThrow, sfxWhoosh } from "../audio";
import { Globe } from "../components/Globe";
import { Guide } from "../components/Guide";
import { Plane } from "../components/Plane";
import { CRAFT_ID } from "../continuum";
import {
  FIRE_THRESHOLD,
  FULL_THRESHOLD,
  MAX_PULL_PX,
  powerOf,
  rubberY,
  spring,
  squashX,
} from "../motion";
import { REGIONS } from "../stories";
import { useGame } from "../store";
import type { RegionId } from "../types";

/**
 * Slingshot throw — continuous dynamic motion, not a timed clip.
 *
 * Pull maps to the finger (Apple Dynamic Motion A). Past the charge line,
 * iOS rubber-band resistance grows. Release projects momentum into the
 * launch spring (FaceTime PIP), so a flick flies faster than a slow pull.
 * Weak pulls snap back with ~80% damping — the gesture had leftover energy.
 */
export function ThrowPhase() {
  const region = useGame((s) => s.region);
  const pickRegion = useGame((s) => s.pickRegion);
  const launch = useGame((s) => s.launch);
  const echo = useGame((s) => s.echo);
  const reduce = useReducedMotion();
  const start = useRef<{ x: number; y: number } | null>(null);
  const last = useRef({ p: 0, x: 0, y: 0 });
  const chargedOnce = useRef(false);
  const hinted = useRef(false);
  const hintTimer = useRef(0);
  const chargeRef = useRef(0);
  const draggingRef = useRef(false);
  const thrownRef = useRef(false);
  const restRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [thrown, setThrown] = useState(false);
  const [facing, setFacing] = useState<RegionId | null>(null);
  const [full, setFull] = useState(false);
  const y = useMotionValue(0);
  const x = useMotionValue(0);
  const rot = useMotionValue(0);
  const power = useMotionValue(0);
  const stretch = useMotionValue(1);
  const fade = useMotionValue(1);
  const bandY = useMotionValue(0);
  const bandX = useMotionValue(0);
  const globeScale = useMotionValue(1);
  const globeY = useMotionValue(0);
  const punch = useMotionValue(0);
  const scaleX = useTransform(stretch, squashX);
  const leftD = useTransform([bandY, bandX], slingPath(-42));
  const rightD = useTransform([bandY, bandX], slingPath(42));
  const bandOpacity = useTransform(power, [0, 0.06, 1], [0, 0.7, 1]);
  const bandWidth = useTransform(power, [0, 1], [1.6, 3.4]);
  const aimed = region ?? facing;
  const place = REGIONS.find((r) => r.id === (region || facing));

  const destRef = useRef<RegionId | null>(null);
  destRef.current = region ?? facing;

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
    if (reduce || thrown || dragging || !aimed || hinted.current) return;
    hintTimer.current = window.setTimeout(() => {
      if (Math.abs(y.get()) > 2 || start.current || thrownRef.current) return;
      hinted.current = true;
      void animate(y, 18, { type: "spring", stiffness: 260, damping: 16 }).then(() => {
        if (!start.current && !thrownRef.current) void animate(y, 0, spring.snap);
      });
    }, 1600);
    return () => window.clearTimeout(hintTimer.current);
  }, [reduce, thrown, dragging, aimed, y]);

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
    const aim = aimPoint();

    const go = () => {
      void animate(bandY, 0, spring.snap);
      void animate(bandX, 0, spring.snap);
      void animate(power, 0, { duration: 0.32, ease: [0.3, 0, 0.8, 0.15] });
      void animate(stretch, 0.78, { duration: 0.28, ease: [0.3, 0, 0.8, 0.15] });
      void animate(y, aim.y, { ...spring.launch, velocity: launchVel });
      void animate(x, aim.x, { ...spring.launch, velocity: incomingX * 0.55 });
      void animate(rot, 18 + last.current.x * -0.08, spring.launch);
      void animate(fade, 0.2, { duration: 0.55, ease: [0.3, 0, 0.8, 0.15], delay: 0.22 });
      void animate(globeScale, 1.05, spring.parent);
      void animate(globeY, -8, spring.parent);
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
      y: globe.top + globe.height * 0.4 - (rest.top + rest.height / 2),
    };
  }

  const cue = thrown
    ? "在飞"
    : full
      ? "松手"
      : reduce && aimed
        ? "点飞机投出"
        : aimed
          ? "拉满再放"
          : "先转地球";

  return (
    <motion.div className="relative flex min-h-0 flex-1 flex-col px-4" style={{ y: punch }}>
      <Guide
        tone="night"
        title={echo ? `飞向 ${echo.city}` : "转地球，拉飞机"}
        body={
          echo
            ? `${echo.name} 在窗边等。按住飞机往下拉，松手投出。`
            : "转到那个地方。没有按钮，拉满再放。"
        }
      />
      <motion.div
        ref={globeRef}
        className="mx-auto mt-1 w-[min(78vw,20rem)] flex-1 will-change-transform"
        style={{ scale: globeScale, y: globeY }}
      >
        <Globe
          selected={region}
          throwing={thrown}
          chargeRef={chargeRef}
          onPick={pickRegion}
          onFacing={setFacing}
        />
      </motion.div>
      <p className="min-h-6 text-center text-sm text-paper/80">
        {region && place
          ? echo
            ? `${place.city} · ${echo.name}`
            : `飞向 ${place.city}`
          : place
            ? `对着 ${place.city}，拉飞机`
            : "转一转，找到一个亮点"}
      </p>
      <div
        data-throw-well
        className="relative mx-auto mt-1 h-40 w-full max-w-md touch-none overflow-visible"
        onPointerDown={(e) => {
          if (thrownRef.current) return;
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
          <circle cx="78" cy="30" r="3.8" className="sling-post" />
          <circle cx="162" cy="30" r="3.8" className="sling-post" />
          <motion.path d={leftD} className="sling-band" style={{ opacity: bandOpacity, strokeWidth: bandWidth }} />
          <motion.path d={rightD} className="sling-band" style={{ opacity: bandOpacity, strokeWidth: bandWidth }} />
        </svg>
        {thrown ? (
          <>
            <Trail x={x} y={y} rot={rot} scaleX={scaleX} stretch={stretch} fade={fade} offset={18} opacity={0.22} />
            <Trail x={x} y={y} rot={rot} scaleX={scaleX} stretch={stretch} fade={fade} offset={36} opacity={0.12} />
            <Trail x={x} y={y} rot={rot} scaleX={scaleX} stretch={stretch} fade={fade} offset={54} opacity={0.06} />
          </>
        ) : null}
        <motion.div
          ref={restRef}
          layoutId={thrown ? undefined : CRAFT_ID}
          data-craft=""
          className="absolute left-1/2 top-2 h-14 w-24 will-change-transform"
          style={{ x, y, rotate: rot, scaleX, scaleY: stretch, opacity: fade, marginLeft: -48 }}
        >
          <Plane className="h-full w-full" charged={full && !thrown} />
        </motion.div>
        <div className="pointer-events-none absolute bottom-3 left-1/2 w-36 -translate-x-1/2">
          <div className="h-1 overflow-hidden rounded-full bg-paper/20">
            <motion.div className="h-full origin-left rounded-full bg-coral" style={{ scaleX: power }} />
          </div>
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
      className="pointer-events-none absolute left-1/2 top-2 h-14 w-24"
      style={{ x, y: trailed, rotate: rot, scaleX, scaleY: stretch, opacity: ghost, marginLeft: -48 }}
    >
      <Plane className="h-full w-full" />
    </motion.div>
  );
}
