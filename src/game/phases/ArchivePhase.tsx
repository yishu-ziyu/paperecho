import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Craft, PullCommit } from "../continuum";
import { layoutCabinet } from "../cabinet";
import { CabinetWall } from "../components/CabinetWall";
import { Guide } from "../components/Guide";
import { useGame } from "../store";

export function ArchivePhase() {
  const journeys = useGame((s) => s.journeys);
  const reading = useGame((s) => s.reading);
  const openJourney = useGame((s) => s.openJourney);
  const startNew = useGame((s) => s.startNew);
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
      <Guide
        className="relative z-20 shrink-0 px-4"
        title={justFiled ? "这封刚滑进来" : "会回来的那些句子"}
        body={
          justFiled
            ? "墙上是这一晚的回信。柜子记得。"
            : journeys.length
              ? "有的是便签，有的挂成信封。抽出一张空白，再折一架。"
              : "墙还空着。抽出一张空白，折一架出去。"
        }
      />
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
        {journeys.length === 0 ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-sm text-ink/50">
            还没有回信。抽出一张空白。
          </p>
        ) : null}
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
                  <p className="text-xs text-ink/45">
                    {reading.echo.name} · {reading.echo.city}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-ink/80">{reading.letter}</p>
                  <p className="mt-4 font-display text-lg leading-snug text-ink">{reading.returnLetter}</p>
                  <p className="mt-5 font-hand text-[1.7rem] leading-none text-ink/80">{reading.echo.name}</p>
                  <p className="mt-1 text-[0.65rem] tracking-[0.18em] text-ink/40">{reading.echo.city}</p>
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
        hint="松开，抽出一张"
        commitBehavior="morph"
        onCommit={startNew}
        className="relative z-20 mx-auto mb-[max(0.5rem,env(safe-area-inset-bottom))] w-full max-w-xs shrink-0 px-4"
      >
        <Craft layout={!reading} className="clay h-[4.75rem] w-full rounded-t-2xl" />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5">
          <p className="font-display text-lg text-ink">空白的一张</p>
          <p className="mt-1 text-[0.65rem] tracking-[0.2em] text-ink/40">往上抽</p>
        </div>
      </PullCommit>
    </div>
  );
}
