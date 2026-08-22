import { cn } from "@/lib/utils";
import { sfxPaper } from "../audio";
import { Guide } from "../components/Guide";
import { useWellDrag } from "../continuum";
import { useGame } from "../store";

export function MirrorPhase() {
  const candidates = useGame((s) => s.candidates);
  const pickMirror = useGame((s) => s.pickMirror);

  const drag = useWellDrag<string>((id) => {
    sfxPaper();
    window.setTimeout(() => pickMirror(id), 180);
  }, { floor: true });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4">
      <Guide title="谁的这句话，最像你今晚" body="往下拖到桌上。认领，不是点选。" />
      <ul className="mx-auto mt-2 flex min-h-0 w-full max-w-md flex-1 flex-col justify-center gap-2 overflow-y-auto py-2">
        {candidates.map((story, i) => (
          <li key={story.id}>
            <button
              type="button"
              onPointerDown={drag.grab(story.id, `${story.name} · ${story.opening}`)}
              className={cn(
                "w-full touch-none rounded-2xl bg-paper px-4 py-2.5 text-left shadow-[0_10px_28px_rgba(36,48,68,0.1)]",
                drag.holding === story.id && "scale-[1.02] shadow-xl",
              )}
              style={{ transform: `rotate(${i === 1 ? -1.2 : i === 2 ? 1.3 : 0.4}deg)` }}
            >
              <span className="block text-[0.65rem] tracking-[0.14em] text-ink/40">
                {story.city} · {story.name}
              </span>
              <span className="mt-1 block text-sm leading-snug text-ink line-clamp-2">{story.opening}</span>
            </button>
          </li>
        ))}
      </ul>
      <div
        ref={drag.wellRef}
        data-drop="mirror"
        className={cn(
          "mx-auto mb-[max(0.5rem,env(safe-area-inset-bottom))] grid h-[4.5rem] w-full max-w-md shrink-0 place-items-center rounded-t-3xl text-sm transition-[background-color,box-shadow] duration-(--motion-fast) ease-(--ease-out)",
          drag.over
            ? "bg-coral/25 text-coral shadow-[inset_0_0_0_2px_var(--color-coral)]"
            : "bg-paper/90 text-ink/45",
        )}
      >
        {drag.over && drag.holding ? "松开，认领这句" : "拖到桌上"}
      </div>
      <div
        ref={drag.ghostRef}
        className="pointer-events-none fixed left-0 top-0 z-40 max-w-[80%] rounded-xl bg-paper px-4 py-3 text-sm text-ink shadow-xl will-change-transform"
        style={{ opacity: 0 }}
      />
    </div>
  );
}
