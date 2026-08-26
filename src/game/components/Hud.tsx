import { Archive, ChevronLeft, HelpCircle, Volume2, VolumeX } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { setMuted } from "../audio";
import { useGame } from "../store";
import { CAN_BACK, JOURNEY } from "../types";

export function Hud() {
  const muted = useGame((s) => s.muted);
  const goArchive = useGame((s) => s.goArchive);
  const goBack = useGame((s) => s.goBack);
  const openGuide = useGame((s) => s.openGuide);
  const setMutedFlag = useGame((s) => s.setMutedFlag);
  const phase = useGame((s) => s.phase);
  const leftFrom = useGame((s) => s.leftFrom);
  const journeys = useGame((s) => s.journeys);
  const night = true;
  const finished = phase === "archive" && !leftFrom && journeys.length > 0;
  const step = finished ? JOURNEY.length : JOURNEY.indexOf(phase);
  const showBack = CAN_BACK.includes(phase);
  const quiet = "text-paper/75";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goBack]);

  return (
    <header className="relative flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      {showBack ? (
        <button
          type="button"
          className={cn("grid size-11 place-items-center rounded-full", quiet)}
          aria-label="返回"
          onClick={goBack}
        >
          <ChevronLeft className="size-5" />
        </button>
      ) : (
        <span className="size-11" />
      )}

      <ol
        className="pointer-events-none absolute left-1/2 top-[max(1.35rem,calc(env(safe-area-inset-top)+0.85rem))] flex -translate-x-1/2 items-center gap-1.5"
        aria-label="旅程进度"
      >
        {JOURNEY.map((id, i) => {
          const current = i === step;
          const done = step >= 0 && i < step;
          return (
            <li key={id}>
              <span
                className={cn(
                  "block size-1.5 rounded-full transition-[background-color,transform] duration-(--motion-fast) ease-(--ease-out)",
                  current && "scale-125",
                  current
                    ? night
                      ? "bg-paper"
                      : "bg-coral"
                    : done
                      ? night
                        ? "bg-paper/55"
                        : "bg-ink/35"
                      : night
                        ? "bg-paper/20"
                        : "bg-ink/15",
                )}
                aria-current={current ? "step" : undefined}
              />
              <span className="sr-only">{id}</span>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center">
        <button
          type="button"
          className={cn("grid size-11 place-items-center rounded-full", quiet)}
          aria-label="首夜引导"
          onClick={openGuide}
        >
          <HelpCircle className="size-5" />
        </button>
        <button
          type="button"
          className={cn("grid size-11 place-items-center rounded-full", quiet)}
          aria-label={muted ? "打开声音" : "静音"}
          onClick={() => {
            setMuted(!muted);
            setMutedFlag(!muted);
          }}
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
        {journeys.length > 0 && phase !== "archive" ? (
          <button
            type="button"
            className={cn("grid size-11 place-items-center rounded-full", quiet)}
            aria-label="信柜"
            onClick={goArchive}
          >
            <Archive className="size-5" />
          </button>
        ) : null}
      </div>
    </header>
  );
}
