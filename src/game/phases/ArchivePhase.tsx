import { Guide } from "../components/Guide";
import { Plane } from "../components/Plane";
import { Craft, PullCommit } from "../continuum";
import { useGame } from "../store";

export function ArchivePhase() {
  const journeys = useGame((s) => s.journeys);
  const reading = useGame((s) => s.reading);
  const openJourney = useGame((s) => s.openJourney);
  const startNew = useGame((s) => s.startNew);
  const archival = useGame((s) => s.archival);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4">
      <Guide title="会回来的那些句子" body={journeys.length ? "刷新以后还在。抽出一张空白，再折一架。" : undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {reading ? (
          <Craft className="mx-auto mt-4 w-full max-w-md">
            <article className="rounded-2xl bg-paper/95 p-5 shadow-lg">
              <p className="text-xs text-ink/45">
                {reading.echo.name} · {reading.echo.city}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">{reading.letter}</p>
              <p className="mt-4 font-display text-lg leading-snug text-ink">{reading.returnLetter}</p>
            </article>
          </Craft>
        ) : null}
        {journeys.length === 0 ? (
          <div className="mx-auto mt-10 flex w-full max-w-sm flex-col items-center text-center">
            <Plane className="h-16 w-28 opacity-80" />
            <p className="mt-5 text-sm leading-relaxed text-ink/60">还没有回信。抽出一张空白。</p>
          </div>
        ) : (
          <ul className="mx-auto mt-4 w-full max-w-md space-y-2 pb-2">
            {journeys.map((j) => (
              <li key={j.id}>
                <button
                  type="button"
                  onClick={() => openJourney(j)}
                  className="flex w-full items-center justify-between rounded-xl bg-paper/85 px-4 py-3 text-left"
                >
                  <span>
                    <span className="block font-medium">{j.echo.name}</span>
                    <span className="text-xs text-ink/50">{j.echo.city}</span>
                  </span>
                  <span className="text-xs text-ink/40">{new Date(j.createdAt).toLocaleDateString()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {archival.length > 0 ? (
          <section className="mx-auto mt-4 w-full max-w-md pb-4">
            <p className="mb-2 text-xs tracking-widest text-ink/40">还记得的事</p>
            <ul className="flex flex-col gap-1.5">
              {archival.slice(0, 6).map((m) => (
                <li key={m.id} className="text-sm leading-relaxed text-ink/60">
                  {m.memory}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <PullCommit
        testId="archive"
        enabled
        sign={-1}
        threshold={36}
        hint="松开，抽出一张"
        onCommit={startNew}
        className="relative mx-auto mb-[max(0.5rem,env(safe-area-inset-bottom))] w-full max-w-xs shrink-0"
      >
        <div className="rounded-t-2xl bg-paper px-5 py-5 text-center shadow-[0_-8px_28px_rgba(36,48,68,0.12)]">
          <p className="font-display text-lg text-ink">空白的一张</p>
          <p className="mt-1 text-[0.65rem] tracking-[0.2em] text-ink/40">往上抽</p>
        </div>
      </PullCommit>
    </div>
  );
}
