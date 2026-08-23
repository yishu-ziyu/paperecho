import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { sfxCharge, sfxPaper, unlockAudio } from "../audio";
import { Guide } from "../components/Guide";
import { Plane } from "../components/Plane";
import { Craft } from "../continuum";
import { ease, spring } from "../motion";
import { useGame } from "../store";

export function ReturnPhase() {
  const echo = useGame((s) => s.echo);
  const scorch = useGame((s) => s.scorch);
  const saveReturn = useGame((s) => s.saveReturn);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const fade = useMotionValue(1);
  const hintOpacity = useTransform(y, [0, 28, 108], [0.12, 0.85, 1]);
  const start = useRef<number | null>(null);
  const dragging = useRef(false);
  const crossedOpen = useRef(false);
  const crossedFile = useRef(false);
  const [open, setOpen] = useState(false);
  const [filing, setFiling] = useState(false);
  const [swallow, setSwallow] = useState(false);
  const [wing, setWing] = useState(true);
  const [depth, setDepth] = useState(0);
  const locked = useRef(false);
  const openRef = useRef(false);
  const letterRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  openRef.current = open;

  useEffect(() => {
    const t = window.setTimeout(() => {
      setWing(false);
    }, 620);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current || start.current == null || locked.current) return;
      const raw = Math.max(0, e.clientY - start.current);
      y.set(Math.min(170, raw));
      const nextFile = raw > 108;
      const nextOpen = raw > 28;
      if (nextOpen && !crossedOpen.current) {
        crossedOpen.current = true;
        sfxPaper();
        navigator.vibrate?.(8);
      }
      if (nextFile && !crossedFile.current) {
        crossedFile.current = true;
        sfxCharge();
        navigator.vibrate?.(16);
      }
      if (raw < 18) crossedOpen.current = false;
      if (raw < 90) crossedFile.current = false;
      setFiling(nextFile);
      setDepth(nextFile ? 2 : nextOpen ? 1 : 0);
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      start.current = null;
      if (locked.current) return;
      const dist = y.get();
      if (dist > 108) {
        locked.current = true;
        setFiling(true);
        setSwallow(true);
        const letter = letterRef.current?.getBoundingClientRect();
        const drawer = drawerRef.current?.getBoundingClientRect();
        const dy =
          drawer && letter
            ? drawer.top + drawer.height * 0.28 - (letter.top + letter.height / 2)
            : 160;
        void animate(y, y.get() + dy, spring.settle);
        void animate(scale, 0.62, spring.settle);
        void animate(fade, 0, { duration: 0.26, delay: 0.12, ease: ease.exit });
        window.setTimeout(() => {
          if (useGame.getState().phase === "return") saveReturn();
        }, 380);
        return;
      }
      if (dist > 28) {
        setOpen(true);
        setDepth(1);
        void animate(y, 36, spring.settle);
        return;
      }
      setDepth(openRef.current ? 1 : 0);
      void animate(y, openRef.current ? 36 : 0, spring.snap);
    }
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onUp, { capture: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
    };
  }, [saveReturn, y, scale, fade]);

  if (!echo) return null;

  const hint = depth >= 2 ? "松开，放进信柜" : depth >= 1 || open ? (open ? "再往下，进抽屉" : "松开，拆开") : "往下拉";

  return (
    <div className="flex flex-1 flex-col items-center px-4">
      <Guide
        title={open ? `${echo.name} 的回信` : "把回信拉开"}
        body="往下拉"
      />
      <Craft className="relative mx-auto mt-8 w-full max-w-md">
        <motion.div
          ref={letterRef}
          data-pull="return"
          className="clay relative origin-center touch-none p-6 text-left"
          style={{ y, scale, opacity: fade, rotate: open ? 0 : -6, height: 224 }}
          onPointerDown={(e) => {
            if (locked.current || wing) return;
            e.preventDefault();
            unlockAudio();
            y.stop();
            start.current = e.clientY - y.get();
            dragging.current = true;
            crossedOpen.current = y.get() > 28;
            crossedFile.current = y.get() > 108;
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
        >
          {wing ? (
            <motion.div
              className="flex h-full flex-col items-center justify-center"
              initial={{ y: -140, opacity: 0, scale: 0.7 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={spring.parent}
            >
              <Plane className="h-16 w-14" scorched={scorch} />
              <p className="mt-3 text-xs tracking-[0.2em] text-ink/40">折回来了</p>
            </motion.div>
          ) : open ? (
            <motion.p
              className="text-sm leading-relaxed text-ink"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            >
              {echo.returnLetter}
            </motion.p>
          ) : (
            <motion.div
              className="flex h-full flex-col justify-between"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-xs tracking-widest text-ink/40">{echo.city}</p>
              <p className="font-display text-xl">未拆的回声</p>
              <p className="text-xs text-ink/40">往下拉</p>
            </motion.div>
          )}
          <motion.span
            className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.65rem] tracking-[0.18em] text-coral"
            style={{ opacity: hintOpacity }}
          >
            {hint}
          </motion.span>
        </motion.div>
      </Craft>
      <motion.div
        ref={drawerRef}
        data-drop="drawer"
        className={`mt-auto mb-8 grid h-16 w-56 place-items-center rounded-t-3xl text-[0.65rem] tracking-[0.22em] ${
          filing ? "bg-coral/25 text-coral" : "bg-ink/10 text-ink/40"
        }`}
        animate={
          swallow
            ? { scaleY: [1, 1.16, 1], scaleX: [1, 1.07, 1] }
            : { scale: filing ? 1.05 : 1 }
        }
        transition={swallow ? { duration: 0.36, ease: [0.2, 0, 0, 1] } : spring.settle}
      >
        {filing ? "松开，放进信柜" : "抽屉"}
      </motion.div>
    </div>
  );
}
