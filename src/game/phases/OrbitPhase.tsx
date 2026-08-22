import { useRef, useState, type RefObject } from "react";
import { useDrag } from "@use-gesture/react";
import { cn } from "@/lib/utils";
import { sfxDrop, sfxPickup } from "../audio";
import { Blob } from "../components/Blob";
import { Guide } from "../components/Guide";
import { Craft, PullCommit } from "../continuum";
import { closenessOf, clampToRing, EMOTION_MAP, mixBlobColor, nearOf, untangle } from "../emotions";
import { rafThrottle, writePct } from "../follow";
import { useGame } from "../store";
import { CENTER, MIN_RADIUS } from "../types";
import type { EmotionId, TokenPos } from "../types";

function ShapeMark({ id }: { id: EmotionId }) {
  const e = EMOTION_MAP[id];
  const cls = "h-4 w-4 border-2 border-current";
  if (e.shape === "square") return <span className={cn(cls, "rounded-md")} />;
  if (e.shape === "diamond") return <span className={cn(cls, "rotate-45 rounded-sm")} />;
  if (e.shape === "pill") return <span className={cn(cls, "h-3.5 w-6 rounded-full")} />;
  return <span className={cn(cls, "rounded-full")} />;
}

export function OrbitPhase() {
  const tokens = useGame((s) => s.tokens);
  const commitOrbit = useGame((s) => s.commitOrbit);
  const fp = useGame((s) => s.fingerprint);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<EmotionId | null>(null);
  const [gather, setGather] = useState(0);
  const owned = nearOf(fp, 0.42);
  const color = mixBlobColor(fp.length ? fp : tokens.map((t) => ({ id: t.id, closeness: closenessOf(t) })));
  const mood = owned[0]?.closeness ?? 0.4;
  const heldToken = held ? tokens.find((t) => t.id === held) : null;
  const heldClose = heldToken ? closenessOf(heldToken) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Guide title="把靠近你的留下" body="拖近中心，就是你。把「你」往下带，才算带走。" />
      <div className="flex min-h-0 flex-1 items-center justify-center px-2 py-1">
        <div
          ref={fieldRef}
          data-orbit-field
          className="relative aspect-square w-full max-w-[min(100%,26rem)] touch-none select-none"
        >
          <Craft className="pointer-events-none absolute inset-[6%] rounded-full bg-paper/70" />
          <div
            className={cn(
              "pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed transition-[border-color] duration-(--motion-fast) ease-(--ease-out)",
              owned.length ? "border-coral/50" : "border-ink/20",
            )}
            style={{
              top: `${CENTER.y}%`,
              width: `${MIN_RADIUS * 2}%`,
              height: `${MIN_RADIUS * 2}%`,
            }}
            aria-hidden
          />
          <div
            className="absolute z-[15]"
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
              <Blob color={color} size={58} mood={mood} label="你" />
            </PullCommit>
          </div>
          {tokens.map((t) => (
            <Token
              key={t.id}
              token={t}
              active={held === t.id}
              near={closenessOf(t) >= 0.42}
              gather={gather}
              fieldRef={fieldRef}
              onHold={() => setHeld(t.id)}
              onFree={() => setHeld(null)}
            />
          ))}
        </div>
      </div>
      <p className="min-h-5 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1 text-center text-xs text-ink/50">
        {held && heldClose >= 0.42
          ? EMOTION_MAP[held].hint
          : owned.length
            ? `${owned.map((f) => EMOTION_MAP[f.id].label).join("、")} 靠近了。把「你」往下拉。`
            : "先把一块拖近自己"}
      </p>
    </div>
  );
}

function Token({
  token,
  active,
  near,
  gather,
  fieldRef,
  onHold,
  onFree,
}: {
  token: TokenPos;
  active: boolean;
  near: boolean;
  gather: number;
  fieldRef: RefObject<HTMLDivElement | null>;
  onHold: () => void;
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
    ({ xy, first, last, currentTarget }) => {
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
      flush.current();
      if (last) {
        sfxDrop();
        onFree();
        useGame.getState().setTokens(untangle(useGame.getState().tokens));
      }
    },
    { preventScroll: true, pointer: { capture: true }, threshold: 0, filterTaps: false },
  );

  const g = near ? gather : gather * 0.15;
  const gx = (CENTER.x - token.x) * g * 0.55;
  const gy = (CENTER.y - token.y) * g * 0.55;
  const scale = near ? 1 - gather * 0.22 : 1 - gather * 0.06;

  return (
    <button
      type="button"
      aria-label={e.label}
      {...bind()}
      className={cn(
        "absolute z-10 flex w-16 touch-none flex-col items-center gap-0.5",
        active && "z-20",
      )}
      style={{
        left: `${token.x}%`,
        top: `${token.y}%`,
        opacity: (0.55 + close * 0.45) * (near ? 1 : 1 - gather * 0.45),
        transform: `translate(-50%, -50%) translate(${gx}%, ${gy}%) scale(${active ? 1.1 : scale})`,
      }}
    >
      <span
        className={cn(
          "grid size-11 place-items-center shadow-lg",
          !active && e.shape !== "diamond" && gather < 0.08 && "token-float",
        )}
        style={{
          background: e.color,
          color: e.ink,
          borderRadius: e.shape === "circle" || e.shape === "pill" ? "999px" : "14px",
          transform: e.shape === "diamond" ? "rotate(45deg)" : undefined,
          boxShadow: near ? `0 0 0 3px color-mix(in oklab, ${e.color} 45%, transparent)` : undefined,
        }}
      >
        <span style={{ transform: e.shape === "diamond" ? "rotate(-45deg)" : undefined }}>
          <ShapeMark id={token.id} />
        </span>
      </span>
      <span className="max-w-[3.6rem] truncate rounded-full bg-paper/95 px-1.5 py-0.5 text-[10px] leading-none text-ink shadow-sm">
        {e.label}
      </span>
    </button>
  );
}
