import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { sfxCharge, unlockAudio } from "./audio";
import { hideGhost, landGhost, moveGhost } from "./follow";
import { spring } from "./motion";

/** One physical object the hand keeps holding: card → desk → sheet → plane → letter. */
export const CRAFT_ID = "echo-craft";

export function Craft({
  children,
  className,
  layout = true,
  style,
}: {
  children?: ReactNode;
  className?: string;
  layout?: boolean;
  style?: CSSProperties;
}) {
  return (
    <motion.div
      layoutId={layout ? CRAFT_ID : undefined}
      data-craft=""
      className={className}
      style={style}
      transition={spring.settle}
      exit={{ opacity: 1 }}
    >
      {children}
    </motion.div>
  );
}

function rubber(raw: number, limit: number) {
  const d = Math.max(0, raw);
  if (d <= limit) return d;
  const extra = d - limit;
  return limit + (extra * 36 * 0.55) / (36 + 0.55 * extra);
}

/**
 * Apple Dynamic Motion: the finger is the object.
 * Pull past a threshold, release, momentum carries the commit.
 * Weak pull snaps back. Reduced-motion falls back to a tap.
 */
export function PullCommit({
  enabled,
  axis = "y",
  sign = 1,
  threshold = 64,
  onCommit,
  onProgress,
  hint,
  children,
  className,
  testId,
  disabledHint,
  commitBehavior = "fly",
}: {
  enabled: boolean;
  axis?: "x" | "y";
  sign?: 1 | -1;
  threshold?: number;
  onCommit: () => void;
  onProgress?: (t: number) => void;
  hint?: string;
  disabledHint?: string;
  children: ReactNode;
  className?: string;
  testId: string;
  commitBehavior?: "fly" | "morph";
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const progress = useMotionValue(0);
  const hintOpacity = progress;
  const start = useRef<{ x: number; y: number } | null>(null);
  const locked = useRef(false);
  const dragging = useRef(false);
  const armedOnce = useRef(false);
  const [armed, setArmed] = useState(false);
  const commitRef = useRef(onCommit);
  const progressRef = useRef(onProgress);
  const enabledRef = useRef(enabled);
  const behaviorRef = useRef(commitBehavior);
  commitRef.current = onCommit;
  progressRef.current = onProgress;
  enabledRef.current = enabled;
  behaviorRef.current = commitBehavior;

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current || !start.current || locked.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      const raw = (axis === "y" ? dy : dx) * sign;
      const mapped = rubber(raw, threshold * 1.45);
      if (axis === "y") {
        y.set(mapped * sign);
        x.set(dx * 0.1);
      } else {
        x.set(mapped * sign);
        y.set(dy * 0.1);
      }
      const t = Math.min(1, mapped / threshold);
      progress.set(t);
      progressRef.current?.(t);
      const nextArmed = mapped > threshold;
      if (nextArmed && !armedOnce.current && enabledRef.current) {
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
      if (locked.current) return;
      const dist = Math.abs(axis === "y" ? y.get() : x.get());
      if (enabledRef.current && dist > threshold) {
        locked.current = true;
        setArmed(false);
        if (behaviorRef.current === "morph") {
          commitRef.current();
          void animate(x, 0, spring.settle);
          void animate(y, 0, spring.settle);
          progress.set(0);
        } else {
          const fly = threshold * 2.6 * sign;
          void animate(axis === "y" ? y : x, fly, spring.launch);
          window.setTimeout(() => commitRef.current(), 240);
        }
        return;
      }
      setArmed(false);
      armedOnce.current = false;
      progress.set(0);
      progressRef.current?.(0);
      void animate(x, 0, spring.snap);
      void animate(y, 0, spring.snap);
    }
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onUp, { capture: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
    };
  }, [axis, sign, threshold, x, y, progress]);

  return (
    <motion.div
      data-pull={testId}
      role="button"
      tabIndex={0}
      aria-disabled={!enabled}
      aria-label={enabled ? hint || "拉动以继续" : disabledHint || hint || "拉动以继续"}
      className={cn("relative touch-none select-none", className)}
      style={{ x, y }}
      onPointerDown={(e) => {
        if (e.button != null && e.button !== 0) return;
        if (locked.current) return;
        e.preventDefault();
        unlockAudio();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        x.stop();
        y.stop();
        start.current = { x: e.clientX, y: e.clientY };
        dragging.current = true;
      }}
      onClick={() => {
        if (reduce && enabled && !locked.current) {
          locked.current = true;
          onCommit();
        }
      }}
      onKeyDown={(e) => {
        if (!enabled || locked.current) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          locked.current = true;
          onCommit();
        }
      }}
    >
      {children}
      <motion.span
        className={cn(
          "pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.65rem] tracking-[0.18em]",
          armed ? "text-coral" : "text-paper/70",
        )}
        style={{ opacity: hintOpacity }}
      >
        {enabled ? hint ?? "松开" : disabledHint ?? "还不行"}
      </motion.span>
    </motion.div>
  );
}

/** Drag a chip/card onto a well. Window-level so the finger can leave the card. */
export function useWellDrag<T>(onDrop: (value: T) => void, opts?: { floor?: boolean }) {
  const wellRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const held = useRef<T | null>(null);
  const overRef = useRef(false);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const floor = Boolean(opts?.floor);
  const [holding, setHolding] = useState<T | null>(null);
  const [over, setOver] = useState(false);

  function hit(x: number, y: number) {
    const r = wellRef.current?.getBoundingClientRect();
    if (r && x >= r.left - 16 && x <= r.right + 16 && y >= r.top - 16 && y <= r.bottom + 16) {
      return true;
    }
    return floor && y > window.innerHeight - 150;
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (held.current == null) return;
      moveGhost(ghostRef.current, e.clientX, e.clientY);
      const next = hit(e.clientX, e.clientY);
      if (overRef.current === next) return;
      overRef.current = next;
      setOver(next);
    }
    function onUp(e: PointerEvent) {
      const value = held.current;
      held.current = null;
      setHolding(null);
      if (value != null && hit(e.clientX, e.clientY)) {
        landGhost(ghostRef.current, wellRef.current);
        dropRef.current(value);
      } else {
        hideGhost(ghostRef.current);
      }
      overRef.current = false;
      setOver(false);
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

  function grab(value: T, label: string) {
    return (e: ReactPointerEvent) => {
      if (e.button != null && e.button !== 0) return;
      held.current = value;
      setHolding(value);
      if (ghostRef.current) ghostRef.current.textContent = label;
      moveGhost(ghostRef.current, e.clientX, e.clientY);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    };
  }

  return { wellRef, ghostRef, holding, over, grab };
}
