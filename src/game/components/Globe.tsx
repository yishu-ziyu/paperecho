import { useEffect, useRef, type MutableRefObject } from "react";
import createGlobe from "cobe";
import { cn } from "@/lib/utils";
import { bloomPulse, emptyBloom, pickMarkerAt, type BloomMap } from "../globeBloom";
import { REGIONS } from "../stories";
import type { RegionId } from "../types";

const CORAL: [number, number, number] = [0.83, 0.47, 0.35];
const LAND: [number, number, number] = [0.5, 0.61, 0.43];
const GLOW: [number, number, number] = [0.94, 0.89, 0.76];
const ORIGIN: [number, number] = [31.2, 121.5];

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function wrapDelta(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function focusOf(id: RegionId) {
  const r = REGIONS.find((x) => x.id === id)!;
  return {
    phi: (-r.lng * Math.PI) / 180,
    theta: ((r.lat * Math.PI) / 180) * 0.42,
  };
}

function nearest(phi: number, theta: number) {
  let best = REGIONS[0]!;
  let bestD = Infinity;
  for (const r of REGIONS) {
    const f = focusOf(r.id);
    const d = Math.hypot(wrapDelta(phi, f.phi), theta - f.theta);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

export function Globe({
  selected,
  throwing,
  chargeRef,
  bloomRef,
  awakeRef,
  onPick,
  onFacing,
  className,
}: {
  selected: RegionId | null;
  throwing?: boolean;
  chargeRef?: MutableRefObject<number>;
  bloomRef?: MutableRefObject<BloomMap>;
  awakeRef?: MutableRefObject<number>;
  onPick?: (id: RegionId) => void;
  onFacing?: (id: RegionId) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedRef = useRef(selected);
  const throwingRef = useRef(throwing);
  const pickRef = useRef(onPick);
  const facingRef = useRef(onFacing);
  selectedRef.current = selected;
  throwingRef.current = throwing;
  pickRef.current = onPick;
  facingRef.current = onFacing;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = canvas.offsetWidth || 320;
    let phi = 0.4;
    let theta = 0.28;
    let vel = 0;
    let drag: { x: number; y: number } | null = null;
    let moved = 0;
    let raf = 0;
    let lastFacing: RegionId | null = null;

    const globe = createGlobe(canvas, {
      devicePixelRatio: Math.min(2, window.devicePixelRatio || 1),
      width: width * 2,
      height: width * 2,
      phi,
      theta,
      dark: 0.15,
      diffuse: 1.45,
      mapSamples: 16000,
      mapBrightness: 3.4,
      mapBaseBrightness: 0.28,
      baseColor: LAND,
      markerColor: CORAL,
      glowColor: GLOW,
      scale: 1.02,
      markerElevation: 0.06,
      markers: REGIONS.map((r) => ({
        location: [r.lat, r.lng],
        size: 0.07,
        id: r.id,
      })),
      arcs: [],
      arcColor: CORAL,
      arcWidth: 0.7,
      arcHeight: 0.28,
    });

    const onResize = () => {
      width = canvas.offsetWidth || 320;
      globe.update({ width: width * 2, height: width * 2 });
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);

    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      moved = 0;
      vel = 0;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = ((e.clientX - drag.x) / width) * 2.4;
      const dy = ((e.clientY - drag.y) / width) * 1.4;
      phi -= dx;
      theta = Math.max(-0.55, Math.min(0.85, theta + dy));
      vel = -dx;
      moved += Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (drag && moved < 14) {
        const rect = canvas.getBoundingClientRect();
        const bloom = bloomRef?.current ?? emptyBloom(1);
        const hit = pickMarkerAt(
          e.clientX - rect.left,
          e.clientY - rect.top,
          rect.width,
          phi,
          theta,
          bloom,
        );
        if (hit) pickRef.current?.(hit);
      }
      drag = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    const tick = () => {
      const focusId = selectedRef.current;
      const charged = chargeRef?.current ?? 0;
      if (focusId && !drag) {
        const f = focusOf(focusId);
        phi = lerpAngle(phi, f.phi, 0.12);
        theta += (f.theta - theta) * 0.12;
      } else if (!drag && !reduce) {
        phi += 0.0028 + vel;
        vel *= 0.94;
        theta += (0.28 - theta) * 0.02;
      }
      const facing = nearest(phi, theta);
      if (facing.id !== lastFacing) {
        lastFacing = facing.id;
        facingRef.current?.(facing.id);
      }
      const focus = focusId ? REGIONS.find((r) => r.id === focusId) : null;
      const hold = throwingRef.current;
      const awake = Math.max(0, Math.min(1, awakeRef?.current ?? 1));
      const bloom = bloomRef?.current ?? emptyBloom(1);
      globe.update({
        phi,
        theta,
        dark: 0.52 - awake * 0.34,
        diffuse: 1.15 + awake * 0.35,
        mapBrightness: 1.15 + awake * 2.05 + charged * 0.7,
        mapBaseBrightness: 0.08 + awake * 0.22,
        baseColor: LAND,
        markerColor: CORAL,
        glowColor: GLOW,
        scale: hold ? 1.06 : 0.96 - charged * 0.045,
        markerElevation: 0.04 + awake * 0.04 + charged * 0.04,
        markers: REGIONS.map((r) => {
          const pop = bloomPulse(bloom[r.id] ?? 0);
          const dim = r.id === "polar" ? 0.7 : 1;
          const base =
            r.id === focusId ? 0.14 + charged * 0.05 : r.id === facing.id ? 0.1 + charged * 0.02 : 0.06;
          return {
            location: [r.lat, r.lng] as [number, number],
            size: pop <= 0.01 ? 0 : base * pop * dim,
            color: r.id === focusId || r.id === facing.id ? CORAL : undefined,
            id: r.id,
          };
        }),
        arcs:
          focus && hold
            ? [{ from: ORIGIN, to: [focus.lat, focus.lng], color: CORAL, id: "throw" }]
            : focus
              ? [{ from: ORIGIN, to: [focus.lat, focus.lng], color: CORAL, id: "aim" }]
              : [],
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      globe.destroy();
    };
  }, [chargeRef, bloomRef, awakeRef]);

  return (
    <div className={cn("relative aspect-square w-full", className)}>
      <div className="globe-halo pointer-events-none absolute inset-[-8%] rounded-full" />
      <canvas
        ref={canvasRef}
        className="globe-canvas relative h-full w-full cursor-grab touch-none active:cursor-grabbing"
        aria-label="转动地球，点一下选择方向"
      />
    </div>
  );
}
