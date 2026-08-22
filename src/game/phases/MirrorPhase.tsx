import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { sfxPaper } from "../audio";
import { Guide } from "../components/Guide";
import { TokenFace } from "../components/TokenFace";
import { Craft, useWellDrag } from "../continuum";
import { EMOTION_MAP, ownedOf } from "../emotions";
import { spring } from "../motion";
import { useGame } from "../store";

export function MirrorPhase() {
  const candidates = useGame((s) => s.candidates);
  const pickMirror = useGame((s) => s.pickMirror);
  const fingerprint = useGame((s) => s.fingerprint);
  const matchedBy = useGame((s) => s.matchedBy);
  const owned = ownedOf(fingerprint, 0.42);

  const drag = useWellDrag<string>((id) => {
    sfxPaper();
    window.setTimeout(() => pickMirror(id), 180);
  }, { floor: true });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4">
      <Guide title="谁的这句话，最像你今晚" body="这些是你带来的。往下拖一句到桌上——认领，不是点选。" />
      <ul className="mx-auto mt-2 flex gap-2">
        {owned.map((f) => {
          const e = EMOTION_MAP[f.id];
          return (
            <motion.li
              key={f.id}
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={spring.settle}
              className="grid size-9 place-items-center rounded-full"
              style={{ background: e.color, color: e.ink }}
              title={e.label}
            >
              <span
                className="grid size-6 place-items-center rounded-full bg-paper text-ink"
                style={{ ["--face-hole" as string]: "var(--color-paper)" }}
              >
                <TokenFace id={f.id} awake size={22} />
              </span>
            </motion.li>
          );
        })}
      </ul>
      <ul className="mx-auto mt-2 flex min-h-0 w-full max-w-md flex-1 flex-col justify-center gap-2 overflow-y-auto py-2">
        {candidates.map((story, i) => {
          const feel = matchedBy[story.id];
          const e = feel ? EMOTION_MAP[feel] : null;
          return (
            <li key={story.id}>
              <button
                type="button"
                onPointerDown={drag.grab(story.id, `${story.name} · ${story.opening}`)}
                className={cn(
                  "clay-sm relative w-full touch-none rounded-2xl px-4 py-2.5 text-left",
                  drag.holding === story.id && "scale-[1.02] shadow-xl",
                )}
                style={{
                  transform: `rotate(${i === 1 ? -1.2 : i === 2 ? 1.3 : 0.4}deg)`,
                  boxShadow: e ? `inset 3px 0 0 ${e.color}` : undefined,
                }}
              >
                <span className="block text-[0.65rem] tracking-[0.14em] text-ink/40">
                  {story.city} · {story.name}
                  {e ? ` · ${e.label}` : ""}
                </span>
                <span className="mt-1 block text-sm leading-snug text-ink line-clamp-2">{story.opening}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <Craft>
        <div
          ref={drag.wellRef}
          data-drop="mirror"
          className={cn(
            "mx-auto mb-[max(0.5rem,env(safe-area-inset-bottom))] grid h-[4.5rem] w-full max-w-md shrink-0 place-items-center rounded-t-3xl bg-paper text-sm transition-[background-color,box-shadow] duration-(--motion-fast) ease-(--ease-out)",
            drag.over
              ? "bg-coral/25 text-coral shadow-[inset_0_0_0_2px_var(--color-coral)]"
              : "text-ink/50",
          )}
        >
          {drag.over && drag.holding ? "松开，认领这句" : "拖到桌上"}
        </div>
      </Craft>
      <div
        ref={drag.ghostRef}
        className="pointer-events-none fixed left-0 top-0 z-40 max-w-[80%] rounded-xl bg-paper px-4 py-3 text-sm text-ink shadow-xl will-change-transform"
        style={{ opacity: 0 }}
      />
    </div>
  );
}
