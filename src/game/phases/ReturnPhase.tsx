import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue } from "motion/react";
import { sfxPaper } from "../audio";
import { Guide } from "../components/Guide";
import { Craft } from "../continuum";
import { spring } from "../motion";
import { useGame } from "../store";

export function ReturnPhase() {
  const echo = useGame((s) => s.echo);
  const saveReturn = useGame((s) => s.saveReturn);
  const y = useMotionValue(0);
  const start = useRef<number | null>(null);
  const dragging = useRef(false);
  const [open, setOpen] = useState(false);
  const [filing, setFiling] = useState(false);
  const locked = useRef(false);
  const openRef = useRef(false);
  openRef.current = open;

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current || start.current == null || locked.current) return;
      const raw = Math.max(0, e.clientY - start.current);
      y.set(Math.min(170, raw));
      setFiling(raw > 108);
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      start.current = null;
      if (locked.current) return;
      const dist = y.get();
      if (dist > 108) {
        locked.current = true;
        sfxPaper();
        setFiling(true);
        void animate(y, 220, spring.launch);
        window.setTimeout(() => {
          if (useGame.getState().phase === "return") saveReturn();
        }, 320);
        return;
      }
      if (dist > 28) {
        if (!openRef.current) sfxPaper();
        setOpen(true);
        void animate(y, 36, spring.settle);
        return;
      }
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
  }, [saveReturn, y]);

  if (!echo) return null;

  return (
    <div className="flex flex-1 flex-col items-center px-4">
      <Guide
        title={open ? `${echo.name} 的回信` : "把回信拉开"}
        body={open ? "再往下送，滑进抽屉。" : "往下拉。拉开是一回事，放进抽屉是下一回事。"}
      />
      <Craft className="relative mx-auto mt-8 w-full max-w-md">
        <motion.div
          data-pull="return"
          className="relative origin-center touch-none bg-paper p-6 text-left shadow-xl"
          style={{ y, rotate: open ? 0 : -6, height: 224 }}
          onPointerDown={(e) => {
            if (locked.current) return;
            e.preventDefault();
            y.stop();
            start.current = e.clientY - y.get();
            dragging.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
        >
          {open ? (
            <motion.p
              className="text-sm leading-relaxed text-ink"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            >
              {echo.returnLetter}
            </motion.p>
          ) : (
            <div className="flex h-full flex-col justify-between">
              <p className="text-xs tracking-widest text-ink/40">{echo.city}</p>
              <p className="font-display text-xl">未拆的回声</p>
              <p className="text-xs text-ink/40">往下拉</p>
            </div>
          )}
        </motion.div>
      </Craft>
      <div
        data-drop="drawer"
        className={`mt-auto mb-8 grid h-16 w-56 place-items-center rounded-t-3xl text-[0.65rem] tracking-[0.22em] transition-colors duration-200 ${
          filing ? "bg-coral/25 text-coral" : "bg-ink/10 text-ink/40"
        }`}
      >
        {filing ? "松开，放进信柜" : "抽屉"}
      </div>
    </div>
  );
}
