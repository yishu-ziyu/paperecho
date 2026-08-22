import { useRef, useState, type RefObject } from "react";
import { useDrag } from "@use-gesture/react";
import { cn } from "@/lib/utils";
import { sfxDrop, sfxPickup } from "../audio";
import { EmotionCreature } from "../components/EmotionCreature";
import { Guide } from "../components/Guide";
import { Craft, PullCommit } from "../continuum";
import { closenessOf, clampToRing, EMOTION_MAP, mixBlobColor, nearOf, untangle } from "../emotions";
import { rafThrottle, writePct } from "../follow";
import { useGame } from "../store";
import { CENTER, MAX_RADIUS, MIN_RADIUS } from "../types";
import type { EmotionId, TokenPos } from "../types";

export function OrbitPhase() {
  const tokens = useGame((s) => s.tokens);
  const commitOrbit = useGame((s) => s.commitOrbit);
  const fp = useGame((s) => s.fingerprint);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<EmotionId | null>(null);
  const [gather, setGather] = useState(0);
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);
  const owned = nearOf(fp, 0.42);
  const color = mixBlobColor(fp.length ? fp : tokens.map((t) => ({ id: t.id, closeness: closenessOf(t) })));
  const heldToken = held ? tokens.find((t) => t.id === held) : null;
  const heldClose = heldToken ? closenessOf(heldToken) : 0;
  const pad = (MIN_RADIUS + 4) * 2;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Guide title="把靠近你的留下" body="拖近中心，就是你。把「你」往下带，才算带走。" />
      <div className="flex min-h-0 flex-1 items-center justify-center px-2 py-1">
        <div
          ref={fieldRef}
          data-orbit-field
          className="relative aspect-square w-full max-w-[min(100%,26rem)] touch-none select-none"
        >
          <div
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-paper/25"
            style={{
              top: `${CENTER.y}%`,
              width: `${MAX_RADIUS * 2}%`,
              height: `${MAX_RADIUS * 2}%`,
            }}
            aria-hidden
          />
          <Craft
            className="pointer-events-none absolute rounded-full bg-paper/55 shadow-[0_10px_28px_rgba(12,20,40,0.22)] ring-1 ring-paper/40"
            style={{
              left: `${CENTER.x}%`,
              top: `${CENTER.y}%`,
              width: `${pad}%`,
              height: `${pad}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
          <div
            className={cn(
              "pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed transition-[border-color] duration-(--motion-fast) ease-(--ease-out)",
              owned.length ? "border-coral/55" : "border-ink/25",
            )}
            style={{
              top: `${CENTER.y}%`,
              width: `${MIN_RADIUS * 2}%`,
              height: `${MIN_RADIUS * 2}%`,
            }}
            aria-hidden
          />
          <div
            className="absolute z-30"
            style={{ left: `${CENTER.x}%`, top: `${CENTER.y}%`, transform: "translate(-50%, -50%)" }}
          >
            <PullCommit
              testId="you"
              enabled={owned.length > 0}
              sign={1}
              threshold={56}
              hint="松开，带着走"
              disabledHint="先把一块拖近自己"
              onProgress={setGather}
              onCommit={commitOrbit}
              className="relative"
            >
              <EmotionCreature
                id="you"
                color={color}
                awake={owned.length > 0}
                gather={gather}
                size={58}
                label="你"
                title="你"
              />
            </PullCommit>
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
        </div>
      </div>
      <p className="min-h-5 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1 text-center text-xs text-paper/70">
        {held && heldClose >= 0.42
          ? EMOTION_MAP[held].hint
          : owned.length
            ? `${owned.map((f) => EMOTION_MAP[f.id].label).join("、")} 靠近了`
            : ""}
      </p>
    </div>
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
  const last = useRef({ x: 0, y: 0 });
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
      const placed = clampToRing(raw.x, raw.y, token.id);
      writePct(currentTarget as HTMLElement, placed.x, placed.y);
      live.current = placed;
      if (first) {
        onHold();
        sfxPickup();
      }
      onGaze({ x: delta[0] / 18, y: delta[1] / 18 });
      last.current = { x: delta[0], y: delta[1] };
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
      className={cn("absolute z-10 flex w-14 touch-none flex-col items-center", active && "z-40")}
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
      <EmotionCreature id={token.id} awake={awake} held={active} gather={g} gaze={gaze} size={active ? 58 : 52} />
      <span className="pointer-events-none absolute top-[calc(100%+2px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-paper/92 px-1.5 py-0.5 text-[10px] leading-none text-ink shadow-sm">
        {e.label}
      </span>
    </button>
  );
}
