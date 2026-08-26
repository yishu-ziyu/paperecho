import { useRef, useState, type RefObject } from "react";
import { useDrag } from "@use-gesture/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { sfxDrop, sfxPaper, sfxPickup } from "../audio";
import { EmotionCreature } from "../components/EmotionCreature";
import { Craft, PullCommit } from "../continuum";
import { closenessOf, clampToRing, EMOTION_MAP, mixBlobColor, nearOf, untangle } from "../emotions";
import { rafThrottle, writePct } from "../follow";
import { ease } from "../motion";
import { useGame } from "../store";
import { CENTER, MAX_RADIUS, MIN_RADIUS } from "../types";
import type { EmotionId, TokenPos } from "../types";

const RING_CUE = ["拖一块", "靠近你"];

export function OrbitPhase() {
  const tokens = useGame((s) => s.tokens);
  const fp = useGame((s) => s.fingerprint);
  const saved = useGame((s) => s.selectedMirror);
  const commitListen = useGame((s) => s.commitListen);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<EmotionId | null>(null);
  const [gather, setGather] = useState(0);
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState(saved ?? "");
  const owned = nearOf(fp, 0.42);
  const color = mixBlobColor(fp.length ? fp : tokens.map((t) => ({ id: t.id, closeness: closenessOf(t) })));
  const heldToken = held ? tokens.find((t) => t.id === held) : null;
  const heldClose = heldToken ? closenessOf(heldToken) : 0;
  const line = draft.trim();
  const ready = owned.length > 0 && line.length >= 4;
  const showPortrait = line.length >= 4;
  const teachRing = !held && owned.length === 0;
  const demo = tokens[0];

  function send() {
    if (!ready) return;
    sfxPaper();
    commitListen(line);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-3 py-1 lg:flex-row lg:items-stretch lg:gap-8">
        <div className="flex min-h-0 w-full max-w-[min(100%,26rem)] flex-1 flex-col items-center lg:max-w-[32rem]">
          <div
            ref={fieldRef}
            data-orbit-field
            className="relative aspect-square w-full touch-none select-none"
          >
            <div
              className="pointer-events-none absolute z-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-paper/25"
              style={{
                left: `${CENTER.x}%`,
                top: `${CENTER.y}%`,
                width: `${MAX_RADIUS * 2}%`,
                height: `${MAX_RADIUS * 2}%`,
              }}
              aria-hidden
            />
            <div
              data-orbit-well
              aria-hidden
              className={cn(
                "pointer-events-none absolute z-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper",
                "shadow-[inset_0_8px_16px_rgba(12,20,40,0.2),inset_0_-1px_0_rgba(255,248,238,0.55),0_12px_28px_rgba(12,20,40,0.3)]",
                owned.length ? "ring-2 ring-coral/60" : "ring-1 ring-ink/10",
              )}
              style={{
                left: `${CENTER.x}%`,
                top: `${CENTER.y}%`,
                width: `${MIN_RADIUS * 2}%`,
                height: `${MIN_RADIUS * 2}%`,
              }}
            />
            <div
              className="absolute z-20"
              style={{ left: `${CENTER.x}%`, top: `${CENTER.y}%`, transform: "translate(-50%, -50%)" }}
            >
              <EmotionCreature
                id="you"
                color={color}
                awake={owned.length > 0}
                gather={gather}
                size={78}
                label="你"
                title="你"
                className="[&>span]:absolute [&>span]:top-full [&>span]:left-1/2 [&>span]:mt-1 [&>span]:-translate-x-1/2 [&>span]:text-base [&>span]:font-medium [&>span]:text-ink"
              />
            </div>
            {tokens.map((t) => (
              <Token
                key={t.id}
                token={t}
                active={held === t.id}
                near={closenessOf(t) >= 0.42}
                gather={gather}
                gaze={held === t.id ? gaze : null}
                fieldRef={fieldRef}
                onHold={() => setHeld(t.id)}
                onGaze={setGaze}
                onFree={() => {
                  setHeld(null);
                  setGaze(null);
                }}
              />
            ))}
            <AnimatePresence>
              {teachRing && demo ? <RingCue from={demo} /> : null}
            </AnimatePresence>
          </div>
          <p className="min-h-5 px-2 pt-1.5 text-center text-sm text-paper/90 drop-shadow-[0_1px_8px_rgba(12,20,40,0.45)]">
            {held && heldClose >= 0.42
              ? EMOTION_MAP[held].hint
              : owned.length
                ? `${owned.map((f) => EMOTION_MAP[f.id].label).join("、")} 靠近了`
                : ""}
          </p>
        </div>

        <PullCommit
          testId="listen-note"
          enabled={ready}
          sign={1}
          threshold={52}
          hint="松开，带着走"
          disabledHint={owned.length ? "先写下今晚那句" : "先把一块拖近你，再写一句"}
          tapToCommit
          showHint={false}
          onProgress={setGather}
          onCommit={send}
          className="relative w-full max-w-lg flex-1 lg:max-w-md"
        >
          <Craft>
            <div className="flex h-full min-h-56 flex-col rounded-2xl bg-paper p-6 shadow-[0_22px_56px_rgba(12,20,40,0.28)] ring-1 ring-ink/10">
              <p className="mb-2 text-xs tracking-[0.18em] text-ink/50">今晚的一张</p>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 56))}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onKeyUp={(e) => e.stopPropagation()}
                placeholder="一件具体的事。时间、物件、动作都行。"
                rows={4}
                className="min-h-28 flex-1 resize-none border-0 bg-transparent text-base leading-relaxed text-ink outline-none placeholder:text-ink/45"
              />
              <AnimatePresence>
                {showPortrait ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
                    className="mt-3 rounded-xl bg-ink/[0.04] px-3 py-2.5 text-left"
                  >
                    <p className="text-[0.7rem] tracking-[0.18em] text-ink/45">今晚的画像</p>
                    <p className="mt-1 text-base leading-relaxed text-ink">
                      {owned.length
                        ? owned.map((f) => EMOTION_MAP[f.id].label).join("、")
                        : "还没靠近"}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink/65">「{line}」</p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <div className="mt-4 flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  data-listen-go=""
                  disabled={!ready}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    send();
                  }}
                  className={cn(
                    "min-h-11 w-full rounded-full px-4 text-sm tracking-[0.18em] transition-[background-color,color,opacity] duration-(--motion-fast) ease-(--ease-out)",
                    ready
                      ? "bg-ink text-paper shadow-[0_8px_20px_rgba(12,20,40,0.22)]"
                      : "bg-ink/8 text-ink/35",
                  )}
                >
                  带着走
                </button>
                <p className="text-[0.65rem] tracking-[0.18em] text-ink/40">
                  {ready ? "点一下，或把这张纸往下拉" : owned.length ? "先写下今晚那句" : "先把一块拖近你"}
                </p>
              </div>
            </div>
          </Craft>
        </PullCommit>
      </div>
    </div>
  );
}

function RingCue({ from }: { from: TokenPos }) {
  const reduce = useReducedMotion();
  const dx = CENTER.x - from.x;
  const dy = CENTER.y - from.y;
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 overflow-hidden"
        style={{ top: `${CENTER.y + 16}%`, width: "78%" }}
      >
        <div className="flex justify-center gap-3">
          {RING_CUE.map((word, i) => (
            <span key={word} className="overflow-hidden">
              <motion.span
                className="block font-display text-[clamp(1.15rem,3.2vw,1.55rem)] font-semibold tracking-[0.12em] text-paper drop-shadow-[0_2px_10px_rgba(12,20,40,0.55)]"
                initial={reduce ? false : { y: "110%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.55, delay: 0.12 + i * 0.12, ease: ease.enter }}
              >
                {word}
              </motion.span>
            </span>
          ))}
        </div>
      </div>
      {!reduce && (
        <motion.span
          className="absolute size-2.5 rounded-full bg-paper shadow-[0_0_12px_rgba(240,230,210,0.7)]"
          style={{ left: `${from.x}%`, top: `${from.y}%` }}
          initial={{ x: "-50%", y: "-50%", opacity: 0 }}
          animate={{
            x: ["-50%", `${dx - 50}%`],
            y: ["-50%", `${dy - 50}%`],
            opacity: [0, 0.95, 0],
          }}
          transition={{ duration: 1.7, repeat: Infinity, repeatDelay: 0.55, ease: ease.emphasized }}
        />
      )}
    </motion.div>
  );
}

function Token({
  token,
  active,
  near,
  gather,
  gaze,
  fieldRef,
  onHold,
  onGaze,
  onFree,
}: {
  token: TokenPos;
  active: boolean;
  near: boolean;
  gather: number;
  gaze: { x: number; y: number } | null;
  fieldRef: RefObject<HTMLDivElement | null>;
  onHold: () => void;
  onGaze: (g: { x: number; y: number } | null) => void;
  onFree: () => void;
}) {
  const e = EMOTION_MAP[token.id];
  const close = closenessOf(token);
  const live = useRef<TokenPos>(token);
  const flush = useRef(
    rafThrottle(() => {
      const p = live.current;
      useGame.getState().setTokens(useGame.getState().tokens.map((t) => (t.id === p.id ? p : t)));
    }),
  );

  const bind = useDrag(
    ({ xy, first, last: isLast, currentTarget, delta }) => {
      const field = fieldRef.current;
      if (!field) return;
      const r = field.getBoundingClientRect();
      const raw = {
        x: ((xy[0] - r.left) / r.width) * 100,
        y: ((xy[1] - r.top) / r.height) * 100,
      };
      const placed = clampToRing(raw.x, raw.y, token.id, live.current);
      writePct(currentTarget as HTMLElement, placed.x, placed.y);
      live.current = placed;
      if (first) {
        onHold();
        sfxPickup();
      }
      onGaze({ x: delta[0] / 18, y: delta[1] / 18 });
      flush.current();
      if (isLast) {
        sfxDrop();
        onFree();
        useGame.getState().setTokens(untangle(useGame.getState().tokens));
      }
    },
    { preventScroll: true, pointer: { capture: true }, threshold: 0, filterTaps: false },
  );

  const g = near ? gather : gather * 0.1;
  const gx = (CENTER.x - token.x) * g * 0.22;
  const gy = (CENTER.y - token.y) * g * 0.22;
  const scale = near ? 1 - gather * 0.12 : 1 - gather * 0.04;
  const awake = close >= 0.42;

  return (
    <button
      type="button"
      aria-label={e.label}
      {...bind()}
      onKeyDown={(e) => {
        const field = fieldRef.current;
        if (!field) return;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -3;
        else if (e.key === "ArrowRight") dx = 3;
        else if (e.key === "ArrowUp") dy = -3;
        else if (e.key === "ArrowDown") dy = 3;
        else return;
        e.preventDefault();
        onHold();
        const placed = clampToRing(token.x + dx, token.y + dy, token.id, live.current);
        live.current = placed;
        writePct(e.currentTarget, placed.x, placed.y);
        flush.current();
      }}
      onBlur={() => onFree()}
      className={cn(
        "absolute z-10 flex w-16 touch-none flex-col items-center",
        near && "z-[25]",
        active && "z-40",
      )}
      style={{
        left: `${token.x}%`,
        top: `${token.y}%`,
        opacity: near ? 1 : 0.92 - gather * 0.35,
        transform: `translate(-50%, -50%) translate(${gx}%, ${gy}%) scale(${active ? 1.08 : scale})`,
        filter: near
          ? `drop-shadow(0 0 10px color-mix(in oklab, ${e.color} 55%, transparent))`
          : undefined,
      }}
    >
      <EmotionCreature id={token.id} awake={awake} held={active} gather={g} gaze={gaze} size={active ? 72 : 64} />
      <span className="pointer-events-none absolute top-[calc(100%+4px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-paper px-2 py-0.5 text-[11px] leading-none text-ink shadow-[0_4px_12px_rgba(12,20,40,0.28)] ring-1 ring-ink/8">
        {e.label}
      </span>
    </button>
  );
}
