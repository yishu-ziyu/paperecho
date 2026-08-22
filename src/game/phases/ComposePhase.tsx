import { useState } from "react";
import { motion } from "motion/react";
import { sfxDrop, sfxPickup } from "../audio";
import { Guide } from "../components/Guide";
import { Craft, PullCommit, useWellDrag } from "../continuum";
import { useGame } from "../store";

export function ComposePhase() {
  const chips = useGame((s) => s.chips);
  const letterChips = useGame((s) => s.letterChips);
  const extra = useGame((s) => s.extraLine);
  const addChip = useGame((s) => s.addChip);
  const removeChip = useGame((s) => s.removeChip);
  const setExtra = useGame((s) => s.setExtra);
  const startFold = useGame((s) => s.startFold);
  const [wantLine, setWantLine] = useState(Boolean(extra));

  const drag = useWellDrag<string>((chip) => {
    addChip(chip);
    sfxDrop();
  });

  return (
    <div className="flex flex-1 flex-col px-4">
      <Guide
        title="把碎片拼进这张纸"
        body="按住碎片，拖到纸上。纸往上拉，就开始折。"
      />
      <PullCommit
        testId="compose"
        enabled
        sign={-1}
        threshold={52}
        hint="松开，开始折"
        commitBehavior="morph"
        onCommit={startFold}
        className="relative mx-auto mt-4 w-full max-w-md flex-1"
      >
        <Craft>
          <motion.div
            ref={drag.wellRef}
            data-drop="compose"
            className="clay h-full min-h-44 rounded-2xl p-5"
            animate={{ rotate: -0.6, scale: drag.over ? 1.02 : 1 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
          >
            <p className="mb-3 text-xs tracking-[0.18em] text-ink/40">今晚的一张</p>
            <ul className="flex min-h-20 flex-wrap content-start gap-2">
              {letterChips.length === 0 ? (
                <li className="text-sm text-ink/35">{drag.over ? "松开，放进来" : "把下面的碎片拖上来。也可以直接把纸往上送。"}</li>
              ) : (
                letterChips.map((c) => (
                  <li key={c}>
                    <button
                      type="button"
                      className="rounded-full bg-sage/15 px-3 py-1.5 text-sm text-ink"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => removeChip(c)}
                    >
                      {c}
                    </button>
                  </li>
                ))
              )}
            </ul>
            {letterChips.length > 0 && !wantLine ? (
              <button
                type="button"
                className="mt-3 text-sm text-ink/45"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setWantLine(true)}
              >
                再写一句只有你能写的
              </button>
            ) : null}
            {wantLine ? (
              <input
                value={extra}
                onChange={(e) => setExtra(e.target.value.slice(0, 42))}
                placeholder="一句只有你能写的话"
                onPointerDown={(e) => e.stopPropagation()}
                className="mt-3 w-full border-0 border-b border-ink/15 bg-transparent py-2 text-sm outline-none placeholder:text-ink/30"
              />
            ) : null}
            <p className="mt-3 text-center text-[0.65rem] tracking-[0.2em] text-ink/30">往上送，去折</p>
          </motion.div>
        </Craft>
      </PullCommit>
      <div className="mx-auto mt-3 w-full max-w-md pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              disabled={letterChips.includes(c)}
              className="touch-none rounded-full clay-sm px-3 py-2 text-sm disabled:opacity-30"
              onPointerDown={(e) => {
                if (letterChips.includes(c)) return;
                sfxPickup();
                drag.grab(c, c)(e);
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={drag.ghostRef}
        className="pointer-events-none fixed left-0 top-0 z-40 rounded-full bg-paper px-3 py-2 text-sm text-ink shadow-lg will-change-transform"
        style={{ opacity: 0 }}
      />
    </div>
  );
}
