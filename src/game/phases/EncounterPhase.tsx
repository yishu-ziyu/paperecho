import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Guide } from "../components/Guide";
import { Craft, useWellDrag } from "../continuum";
import { playerHand } from "../emotions";
import { spring } from "../motion";
import { sfxDrop } from "../audio";
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
  const [own, setOwn] = useState("");
  const [wantOwn, setWantOwn] = useState(false);
  const [bloom, setBloom] = useState(false);

  const drag = useWellDrag<string>((text) => {
    if (waiting || !text.trim()) return;
    sfxDrop();
    window.setTimeout(() => {
      reply(text.trim());
      setOwn("");
      setWantOwn(false);
    }, 160);
  });

  useEffect(() => {
    const heard = recall.some((t) => t.who === "echo");
    if (!heard) {
      setBloom(false);
      return;
    }
    const t = window.setTimeout(() => setBloom(true), 700);
    return () => window.clearTimeout(t);
  }, [recall, round]);

  if (!echo) return null;
  const used = [extra, ...letterChips, ...recall.map((t) => t.text)];
  const options = (suggestions.length ? suggestions : playerHand(fingerprint, chips, used)).slice(0, 3);

  return (
    <div className="flex flex-1 flex-col px-4">
      <Guide
        title={`${echo.name}  ·  ${echo.city}`}
        body={
          waiting
            ? round >= 3
              ? "纸正在折回来。"
              : "对方在写自己的夜。"
            : bloom
              ? "被说中了的话，拖到桌上。"
              : "先听。先别急着说。"
        }
      />
      <div className="mx-auto mt-2 flex w-full max-w-md flex-1 flex-col">
        <Craft className="flex min-h-0 flex-1 flex-col">
          <div
            ref={drag.wellRef}
            data-drop="encounter"
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-2xl px-3 py-3 transition-[background-color,box-shadow] duration-(--motion-fast) ease-(--ease-out)",
              drag.over ? "bg-coral/15 shadow-[inset_0_0_0_2px_var(--color-coral)]" : "bg-paper/35",
            )}
          >
            <ul className="mt-auto flex flex-col gap-2 pb-2">
              {recall.map((t, i) => (
                <motion.li
                  key={`${i}-${t.who}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0, rotate: TILT[i % TILT.length]! * (t.who === "you" ? 1 : -1) }}
                  transition={spring.settle}
                  className={cn(
                    "w-[86%] bg-paper px-4 py-3 text-sm leading-relaxed text-ink shadow-md",
                    t.who === "you" ? "self-end" : "self-start",
                  )}
                >
                  {t.who === "echo" ? (
                    <p className="mb-1 text-[0.65rem] tracking-[0.18em] text-ink/35">{echo.name}</p>
                  ) : null}
                  {t.text}
                </motion.li>
              ))}
              {waiting && round < 3 ? (
                <li className="w-28 self-start bg-paper/80 px-4 py-5 shadow-sm" style={{ rotate: "-1.6deg" }}>
                  <span className="block h-1 w-14 bg-ink/15" />
                </li>
              ) : null}
            </ul>
            <p className="pt-1 text-center text-[0.65rem] tracking-[0.2em] text-ink/35">
              {drag.over ? "松开，放到桌上" : bloom ? "拖到这叠纸上" : "桌上"}
            </p>
          </div>
        </Craft>
        <div className="grid w-full gap-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          {bloom && !waiting
            ? options.map((o, i) => (
                <button
                  key={o}
                  type="button"
                  className={cn(
                    "echo-opt min-h-11 touch-none bg-paper px-4 py-3 text-left text-sm text-ink shadow-sm",
                    i % 2 === 0 ? "-rotate-1" : "rotate-1",
                    drag.holding === o && "scale-[1.02] shadow-md",
                  )}
                  onPointerDown={drag.grab(o, o)}
                >
                  {o}
                </button>
              ))
            : null}
          {bloom && !waiting && wantOwn ? (
            <div className="grid gap-2">
              <input
                value={own}
                onChange={(e) => setOwn(e.target.value.slice(0, 28))}
                placeholder="你自己的一句"
                className="min-h-11 w-full bg-paper px-3 text-sm outline-none"
                autoFocus
              />
              {own.trim() ? (
                <button
                  type="button"
                  className="echo-opt min-h-11 touch-none bg-paper px-4 py-3 text-left text-sm text-ink shadow-sm"
                  onPointerDown={drag.grab(own.trim(), own.trim())}
                >
                  拖这句到桌上
                </button>
              ) : null}
            </div>
          ) : bloom && !waiting ? (
            <button type="button" className="min-h-11 text-sm text-ink/45" onClick={() => setWantOwn(true)}>
              还有一句只有你能写的
            </button>
          ) : null}
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
