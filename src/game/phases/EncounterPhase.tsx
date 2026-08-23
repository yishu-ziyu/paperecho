import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { sfxDrop } from "../audio";
import { LetterPop } from "../components/LetterPop";
import { Plane } from "../components/Plane";
import { Craft } from "../continuum";
import { isNewPersonalDetail } from "../agent/exchange";
import { spring } from "../motion";
import { useGame } from "../store";

const TILT = [-2.2, 1.6, -1.1, 2.4, -1.8, 1.2];
const DEPTH = ["发生的事", "当时的感觉", "后来改了什么"] as const;

function encounterGuide(opts: {
  name: string;
  sealing: boolean;
  waiting: boolean;
  bloom: boolean;
  closeness: number;
  silentTurns: number;
  round: number;
  lastYouSpecific: boolean;
}): string {
  const { name, sealing, waiting, bloom, closeness, silentTurns, round, lastYouSpecific } = opts;
  if (sealing) return "纸正在折回来。";
  if (waiting) {
    return lastYouSpecific
      ? `${name} 接到你刚那件了，在写自己一件平行的。`
      : `${name} 还停在这一件上。下次落到具体的事，他才会往下讲。`;
  }
  if (!bloom) return "他先说完这一句。你再回。";
  if (round === 0) {
    return `${name} 先说了自己这边发生的事。你也说一件具体的，他才会把当时的感觉交出来。`;
  }
  if (closeness >= 3) return "两边都说到后来改了什么。再写一句，这张就要折回去了。";
  if (silentTurns === 0) return "你刚那件他接上了。再说一件自己的，还能换他下一句。";
  return "刚才那句他没接到新的事。落到一件具体的——物件、动作、时间都行。";
}

export function EncounterPhase() {
  const echo = useGame((s) => s.echo);
  const round = useGame((s) => s.round);
  const reply = useGame((s) => s.reply);
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
  const firstEchoSeen = useRef(false);
  const [waitOut, setWaitOut] = useState(false);

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

  const firstEchoIndex = recall.findIndex((t) => t.who === "echo");
  const sealing = waiting && round >= 3;
  const showWait = waiting && !sealing && firstEchoIndex < 0;

  useLayoutEffect(() => {
    if (firstEchoIndex < 0) {
      firstEchoSeen.current = false;
      setWaitOut(false);
      return;
    }
    if (firstEchoSeen.current || reduce) {
      firstEchoSeen.current = true;
      setWaitOut(false);
      return;
    }
    firstEchoSeen.current = true;
    setWaitOut(true);
    const t = window.setTimeout(() => setWaitOut(false), 240);
    return () => window.clearTimeout(t);
  }, [firstEchoIndex, reduce]);

  if (!echo) return null;

  const canSpeak = bloom && !waiting && !sealing;
  const youLines = recall.filter((t) => t.who === "you").map((t) => t.text);
  const lastYou = youLines.at(-1) ?? "";
  const priorYou = youLines.slice(0, -1);
  const lastEcho = recall.filter((t) => t.who === "echo").at(-1)?.text ?? "";
  const lastYouSpecific = Boolean(lastYou) && isNewPersonalDetail(lastYou, priorYou, lastEcho);
  const draft = own.trim();
  const draftReady = draft.length >= 4;
  const draftSpecific = draftReady && isNewPersonalDetail(draft, youLines, lastEcho);
  const closeness = exchange.unlocked;
  const guide = encounterGuide({
    name: echo.name,
    sealing,
    waiting,
    bloom,
    closeness,
    silentTurns: exchange.silentTurns,
    round,
    lastYouSpecific,
  });

  function sendOwn() {
    if (!draftReady || waiting) return;
    place(draft);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4">
      <header className="mx-auto w-full max-w-md px-1 pt-1 text-center">
        <p className="text-[0.65rem] tracking-[0.22em] text-paper/55">今晚对上的人</p>
        <h2 className="mt-1 font-display text-[clamp(1.15rem,3.2vw,1.55rem)] font-semibold tracking-[0.06em] text-paper">
          <LetterPop text={echo.name} />
          <span className="mx-2 text-paper/35">·</span>
          <span className="font-sans text-[0.92em] font-medium tracking-normal text-paper/80">
            <LetterPop text={echo.city} start={echo.name.length + 1} />
          </span>
        </h2>
        <ol className="mt-2 flex items-center justify-center gap-1.5" aria-label={`说到${DEPTH[closeness - 1]}`}>
          {[1, 2, 3].map((n) => (
            <li
              key={n}
              title={DEPTH[n - 1]}
              className={cn(
                "size-1.5 rounded-full transition-[background-color,transform] duration-(--motion-fast) ease-(--ease-out)",
                n <= closeness ? "scale-110 bg-paper" : "bg-paper/25",
              )}
            />
          ))}
        </ol>
        <p className="mt-2 text-xs leading-relaxed text-paper/60">{guide}</p>
      </header>

      <div className="mx-auto mt-3 flex min-h-0 w-full max-w-md flex-1 flex-col">
        <Craft className="relative flex min-h-0 flex-1 flex-col">
          <div
            data-drop="encounter"
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl bg-paper/40 px-3 py-3"
          >
            <div className="pointer-events-none absolute right-3 top-3 h-10 w-9 opacity-80">
              <Plane className="h-full w-full" scorched={scorch} />
            </div>
            <ul ref={listRef} className="mt-auto flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2 pt-8">
              {recall.map((t, i) => {
                const firstSpoken = t.who === "echo" && i === firstEchoIndex;
                const popIn = firstSpoken && !reduce;
                const tilt = TILT[i % TILT.length]! * (t.who === "you" ? 1 : -1);
                const inked = t.who === "echo" && closeness >= 2;
                const card = (
                  <>
                    {t.who === "echo" ? (
                      <p className="mb-1 text-[0.65rem] tracking-[0.18em] text-ink/35">{echo.name}</p>
                    ) : (
                      <p className="mb-1 text-right text-[0.65rem] tracking-[0.18em] text-ink/35">你</p>
                    )}
                    {t.text}
                  </>
                );
                if (popIn) {
                  return (
                    <li key={`${i}-${t.who}`} className="relative w-[86%] self-start" style={{ rotate: `${tilt}deg` }}>
                      {waitOut ? (
                        <span className="enc-slot enc-wait is-out pointer-events-none absolute left-0 top-0 w-32 bg-paper/85 px-4 py-4 shadow-sm">
                          <span className="mb-2 block h-1 w-16 bg-ink/15" />
                          <span className="block h-1 w-10 bg-ink/10" />
                        </span>
                      ) : null}
                      <div className="enc-slot enc-spoken clay-sm px-4 py-3 text-sm leading-relaxed">{card}</div>
                    </li>
                  );
                }
                return (
                  <motion.li
                    key={`${i}-${t.who}`}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0, rotate: tilt }}
                    transition={spring.settle}
                    className={cn(
                      "clay-sm w-[86%] px-4 py-3 text-sm leading-relaxed",
                      t.who === "you" ? "self-end" : "self-start",
                      inked && "text-ink",
                    )}
                  >
                    {card}
                  </motion.li>
                );
              })}
              {showWait ? (
                <li
                  className={cn("enc-slot w-32 self-start bg-paper/85 px-4 py-4 shadow-sm", !reduce && "enc-wait")}
                  style={{ rotate: "-1.6deg" }}
                >
                  <span className="mb-2 block h-1 w-16 bg-ink/15" />
                  <span className="block h-1 w-10 bg-ink/10" />
                </li>
              ) : null}
            </ul>
            <p className="pt-1 text-center text-[0.65rem] tracking-[0.2em] text-ink/35">
              {sealing ? "回信在折" : "桌上"}
            </p>
          </div>
        </Craft>

        <div className="grid w-full gap-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
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
                <p className="text-[0.7rem] leading-relaxed text-ink/45">
                  再落到一件具体的事上，他才会把下一句交出来。
                </p>
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
            <p className="py-3 text-center text-sm text-paper/70">等他写完这一句。</p>
          ) : (
            <p className="py-3 text-center text-sm text-paper/60">先听完这一张。</p>
          )}
        </div>
      </div>
    </div>
  );
}
