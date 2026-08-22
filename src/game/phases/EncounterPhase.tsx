import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { sfxDrop } from "../audio";
import { Plane } from "../components/Plane";
import { Craft, useWellDrag } from "../continuum";
import { isNewPersonalDetail } from "../agent/exchange";
import { playerHand } from "../emotions";
import { spring } from "../motion";
import { useGame } from "../store";

const TILT = [-2.2, 1.6, -1.1, 2.4, -1.8, 1.2];

export function EncounterPhase() {
  const echo = useGame((s) => s.echo);
  const round = useGame((s) => s.round);
  const fingerprint = useGame((s) => s.fingerprint);
  const chips = useGame((s) => s.chips);
  const letterChips = useGame((s) => s.letterChips);
  const extra = useGame((s) => s.extraLine);
  const reply = useGame((s) => s.reply);
  const suggestions = useGame((s) => s.suggestions);
  const waiting = useGame((s) => s.waitingEcho);
  const recall = useGame((s) => s.recall);
  const scorch = useGame((s) => s.scorch);
  const exchange = useGame((s) => s.exchange);
  const reduce = useReducedMotion();
  const [own, setOwn] = useState("");
  const [bloom, setBloom] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const composing = useRef(false);
  const lastPlaced = useRef(0);

  const drag = useWellDrag<string>((text) => place(text));

  function place(text: string) {
    const line = text.trim();
    if (waiting || !line) return;
    const now = performance.now();
    if (now - lastPlaced.current < 420) return;
    lastPlaced.current = now;
    sfxDrop();
    window.setTimeout(() => {
      reply(line);
      setOwn("");
    }, 120);
  }

  useEffect(() => {
    const heard = recall.some((t) => t.who === "echo");
    if (!heard) {
      setBloom(false);
      return;
    }
    if (reduce || round > 0) {
      setBloom(true);
      return;
    }
    const t = window.setTimeout(() => setBloom(true), 640);
    return () => window.clearTimeout(t);
  }, [recall, round, reduce]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [recall, waiting, reduce]);

  if (!echo) return null;

  const used = [extra, ...letterChips, ...recall.map((t) => t.text)];
  const options = (suggestions.length ? suggestions : playerHand(fingerprint, chips, used)).slice(0, 3);
  const sealing = waiting && round >= 3;
  const canSpeak = bloom && !waiting && !sealing;
  const priorYou = recall.filter((t) => t.who === "you").map((t) => t.text);
  const lastEcho = recall.filter((t) => t.who === "echo").at(-1)?.text ?? "";
  const draft = own.trim();
  const draftReady = draft.length >= 4;
  const draftSpecific = draftReady && isNewPersonalDetail(draft, priorYou, lastEcho);
  const closeness = exchange.unlocked;

  function sendOwn() {
    if (!draftReady || waiting) return;
    place(draft);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4">
      <header className="mx-auto w-full max-w-md px-1 pt-1 text-center">
        <p className="text-[0.65rem] tracking-[0.22em] text-paper/55">今晚对上的人</p>
        <h2 className="mt-1 font-display text-[clamp(1.15rem,3.2vw,1.55rem)] font-semibold tracking-[0.06em] text-paper">
          {echo.name}
          <span className="mx-2 text-paper/35">·</span>
          <span className="font-sans text-[0.92em] font-medium tracking-normal text-paper/80">{echo.city}</span>
        </h2>
        {echo.felt ? <p className="mt-1 text-sm leading-relaxed text-paper/70">{echo.felt}</p> : null}
        <ol className="mt-2 flex items-center justify-center gap-1.5" aria-hidden>
          {[1, 2, 3].map((n) => (
            <li
              key={n}
              className={cn(
                "size-1.5 rounded-full transition-[background-color,transform] duration-(--motion-fast) ease-(--ease-out)",
                n <= closeness ? "scale-110 bg-paper" : "bg-paper/25",
              )}
            />
          ))}
        </ol>
        <p className="mt-2 text-xs leading-relaxed text-paper/60">
          {sealing
            ? "纸正在折回来。"
            : waiting
              ? `${echo.name} 在写自己的夜。`
              : bloom
                ? "被说中的话，点一下放到桌上。也可以自己写一句。"
                : "先听。先别急着说。"}
        </p>
      </header>

      <div className="mx-auto mt-3 flex min-h-0 w-full max-w-md flex-1 flex-col">
        <Craft className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={drag.wellRef}
            data-drop="encounter"
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl px-3 py-3 transition-[background-color,box-shadow] duration-(--motion-fast) ease-(--ease-out)",
              drag.over ? "bg-coral/15 shadow-[inset_0_0_0_2px_var(--color-coral)]" : "bg-paper/40",
            )}
          >
            <div className="pointer-events-none absolute right-3 top-3 h-8 w-14 opacity-80">
              <Plane className="h-full w-full" scorched={scorch} />
            </div>
            <ul ref={listRef} className="mt-auto flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2 pt-8">
              {recall.map((t, i) => (
                <motion.li
                  key={`${i}-${t.who}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0, rotate: TILT[i % TILT.length]! * (t.who === "you" ? 1 : -1) }}
                  transition={spring.settle}
                  className={cn(
                    "clay-sm w-[86%] px-4 py-3 text-sm leading-relaxed",
                    t.who === "you" ? "self-end" : "self-start",
                  )}
                >
                  {t.who === "echo" ? (
                    <p className="mb-1 text-[0.65rem] tracking-[0.18em] text-ink/35">{echo.name}</p>
                  ) : (
                    <p className="mb-1 text-right text-[0.65rem] tracking-[0.18em] text-ink/35">你</p>
                  )}
                  {t.text}
                </motion.li>
              ))}
              {waiting && !sealing ? (
                <li className="w-32 self-start bg-paper/85 px-4 py-4 shadow-sm" style={{ rotate: "-1.6deg" }}>
                  <span className="mb-2 block h-1 w-16 bg-ink/15" />
                  <span className="block h-1 w-10 bg-ink/10" />
                </li>
              ) : null}
            </ul>
            <p className="pt-1 text-center text-[0.65rem] tracking-[0.2em] text-ink/35">
              {drag.over ? "松开，放到桌上" : sealing ? "回信在折" : "桌上"}
            </p>
          </div>
        </Craft>

        <div className="grid w-full gap-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <AnimatePresence initial={false}>
            {canSpeak
              ? options.map((o, i) => (
                  <motion.button
                    key={o}
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ ...spring.settle, delay: i * 0.04 }}
                    className={cn(
                      "echo-opt clay-sm min-h-11 touch-none px-4 py-3 text-left text-sm",
                      i % 2 === 0 ? "-rotate-1" : "rotate-1",
                      drag.holding === o && "scale-[1.02] shadow-md",
                    )}
                    onPointerDown={drag.grab(o, o)}
                    onClick={() => {
                      if (drag.wasDragged()) return;
                      place(o);
                    }}
                  >
                    {o}
                  </motion.button>
                ))
              : null}
          </AnimatePresence>

          {canSpeak ? (
            <form
              className="clay-sm grid gap-2 px-3 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                sendOwn();
              }}
            >
              <label className="text-[0.65rem] tracking-[0.18em] text-ink/40">你自己的一句</label>
              <textarea
                value={own}
                rows={2}
                maxLength={72}
                placeholder="一件具体的事。物件、动作、时间都行。"
                className="min-h-14 w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-ink outline-none placeholder:text-ink/35"
                onChange={(e) => setOwn(e.target.value.slice(0, 72))}
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={() => {
                  composing.current = false;
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey) return;
                  if (e.nativeEvent.isComposing || e.keyCode === 229 || composing.current) return;
                  e.preventDefault();
                  sendOwn();
                }}
              />
              {draftReady && !draftSpecific ? (
                <p className="text-[0.7rem] leading-relaxed text-ink/45">再落到一件具体的事上，影子才会把下一句交出来。</p>
              ) : null}
              <button
                type="submit"
                disabled={!draftReady}
                className={cn(
                  "min-h-11 rounded-full px-4 text-sm tracking-[0.18em] transition-[background-color,color,opacity] duration-(--motion-fast) ease-(--ease-out)",
                  draftReady ? "bg-ink text-paper" : "bg-ink/8 text-ink/35",
                )}
                onPointerDown={(e) => e.stopPropagation()}
              >
                放到桌上
              </button>
            </form>
          ) : sealing ? (
            <p className="py-3 text-center text-sm text-paper/70">回信正在折回来。</p>
          ) : waiting ? (
            <p className="py-3 text-center text-sm text-paper/70">等对方写完这一张。</p>
          ) : (
            <p className="py-3 text-center text-sm text-paper/60">先听完这一张。</p>
          )}
        </div>
      </div>

      <div
        ref={drag.ghostRef}
        className="pointer-events-none fixed left-0 top-0 z-40 max-w-[80%] bg-paper px-4 py-3 text-sm text-ink shadow-xl will-change-transform"
        style={{ opacity: 0 }}
      />
    </div>
  );
}
