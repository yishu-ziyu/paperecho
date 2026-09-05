import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Craft, PullCommit } from "../continuum";
import { layoutCabinet, talkOf } from "../cabinet";
import { CabinetWall } from "../components/CabinetWall";
import { Guide } from "../components/Guide";
import { useGame } from "../store";

export function ArchivePhase() {
  const journeys = useGame((s) => s.journeys);
  const reading = useGame((s) => s.reading);
  const openJourney = useGame((s) => s.openJourney);
  const startNew = useGame((s) => s.startNew);
  const seekPerson = useGame((s) => s.seekPerson);
  const goBack = useGame((s) => s.goBack);
  const archival = useGame((s) => s.archival);
  const leftFrom = useGame((s) => s.leftFrom);
  const reduce = useReducedMotion();
  const board = useMemo(
    () => layoutCabinet(journeys, archival, reading?.id),
    [journeys, archival, reading?.id],
  );
  const justFiled = Boolean(reading && !leftFrom && journeys[0]?.id === reading.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-phase="archive">
      {justFiled ? (
        <Guide className="relative z-20 shrink-0 px-4" title="刚说完" />
      ) : journeys.length ? null : (
        <Guide className="relative z-20 shrink-0 px-4" title="墙还空着" />
      )}
      <div className="relative min-h-0 flex-1">
        <CabinetWall
          notes={board.notes}
          selectedKey={reading?.id}
          pinFresh={justFiled}
          onOpen={openJourney}
          onVacant={() => {
            if (reading) goBack();
          }}
        />
        <AnimatePresence>
          {reading ? (
            <motion.div
              key={reading.id}
              className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-4"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <Craft className="pointer-events-auto w-full max-w-md">
                <article className="clay rounded-2xl p-5" data-cabinet="letter">
                  <p className="font-hand text-lg leading-none text-ink">{reading.echo.name}</p>
                  <p className="mt-1 text-xs text-ink/45">{reading.echo.city}</p>
                  <ul className="mt-3 flex max-h-[42vh] flex-col gap-2 overflow-y-auto">
                    {talkOf(reading).map((turn, i) => (
                      <li
                        key={`${i}-${turn.who}`}
                        className={turn.who === "you" ? "w-[86%] self-end" : "w-[86%] self-start"}
                      >
                        <p className="clay-sm px-3 py-2 text-sm leading-relaxed text-ink">{turn.text}</p>
                      </li>
                    ))}
                  </ul>
                </article>
              </Craft>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <PullCommit
        testId="archive"
        enabled
        sign={-1}
        threshold={36}
        hint={reading ? "松开，再去找他" : "松开，抽出一张"}
        commitBehavior="morph"
        onCommit={() => {
          if (reading) seekPerson(reading.echo.name);
          else startNew();
        }}
        className="relative z-20 mx-auto mb-[max(0.5rem,env(safe-area-inset-bottom))] w-full max-w-xs shrink-0 px-4"
      >
        <Craft layout={!reading} className="clay h-[4.75rem] w-full rounded-t-2xl" />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5">
          {reading ? (
            <>
              <p className="font-display text-lg text-ink">再去找他</p>
              <p className="mt-1 text-[0.65rem] tracking-[0.2em] text-ink/40">{reading.echo.name}</p>
            </>
          ) : (
            <>
              <p className="font-display text-lg text-ink">空白的一张</p>
              <p className="mt-1 text-[0.65rem] tracking-[0.2em] text-ink/40">往上抽</p>
            </>
          )}
        </div>
      </PullCommit>
    </div>
  );
}
