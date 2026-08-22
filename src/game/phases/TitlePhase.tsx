import { startPad, unlockAudio } from "../audio";
import { Craft, PullCommit } from "../continuum";
import { useGame } from "../store";

export function TitlePhase() {
  const startNew = useGame((s) => s.startNew);
  const goArchive = useGame((s) => s.goArchive);
  const journeys = useGame((s) => s.journeys);

  function enter() {
    unlockAudio();
    startPad();
    startNew();
  }

  return (
    <div className="flex flex-1 flex-col items-center px-5 pt-10 text-center">
      <PullCommit
        testId="title"
        enabled
        sign={1}
        threshold={56}
        hint="松开，进房间"
        onCommit={enter}
        className="relative w-[min(92%,22rem)]"
      >
        <Craft className="rounded-3xl bg-paper px-6 py-8 shadow-[0_22px_60px_rgba(36,48,68,0.18)]">
          <h1 className="font-display text-[clamp(1.7rem,6.4vw,2.45rem)] font-normal leading-none tracking-[0.18em] text-ink">
            纸上的回声
          </h1>
          <p className="font-latin mt-3 text-[0.68rem] italic tracking-[0.42em] text-ink/40">Paper Echo</p>
          <p className="mx-auto mt-5 max-w-[17rem] text-[0.875rem] font-normal leading-relaxed tracking-[0.04em] text-ink/70 break-keep">
            把靠近你的留下来，折成会回来的<span className="whitespace-nowrap">纸飞机</span>。
          </p>
          <p className="mt-6 text-[0.65rem] tracking-[0.22em] text-ink/35">往下拉</p>
        </Craft>
      </PullCommit>
      {journeys.length ? (
        <PullCommit
          testId="title-drawer"
          enabled
          sign={-1}
          threshold={42}
          hint="松开，开信柜"
          onCommit={goArchive}
          className="relative mt-auto mb-8 w-40"
        >
          <div className="rounded-t-2xl bg-paper/90 px-4 py-3 text-xs tracking-[0.2em] text-ink/50 shadow-md">
            信柜 {journeys.length}
          </div>
        </PullCommit>
      ) : (
        <div className="mt-auto pb-16" />
      )}
    </div>
  );
}
