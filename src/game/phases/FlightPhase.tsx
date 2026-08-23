import { motion, useReducedMotion } from "motion/react";
import { Guide } from "../components/Guide";
import { LetterPop } from "../components/LetterPop";
import { Plane } from "../components/Plane";
import { Craft, CRAFT_ID, PullCommit } from "../continuum";
import { useGame } from "../store";

/**
 * Title-page 字标 language (LetterPop + clip-up) with the night-search line,
 * split so it reads as a stacked mark instead of a caption under a bar.
 */
function FlightWaitMark() {
  const reduce = useReducedMotion();
  return (
    <div
      data-flight-wait
      className="pointer-events-none px-5 text-center"
      style={{ ["--pop-delay" as string]: "80ms" }}
    >
      <h1
        className="font-display text-[clamp(2.4rem,12vw,3.8rem)] font-bold leading-[0.88] tracking-wide text-paper"
        style={{ textShadow: "0 2px 0 #d5c7ab, 0 4px 0 #c3b394, 0 10px 18px rgba(10, 16, 32, 0.45)" }}
      >
        <span className="block">
          <LetterPop text="在夜里" />
        </span>
        <span className="block">
          <LetterPop text="找一个" start={3} />
        </span>
      </h1>
      <p className="clip-up-mask mx-auto mt-4 font-display text-[1.05rem] tracking-[0.28em] text-paper/70">
        <span className={reduce ? undefined : "clip-up"}>也说过类似话的人</span>
      </p>
    </div>
  );
}

export function FlightPhase() {
  const searching = useGame((s) => s.searching);
  const note = useGame((s) => s.searchNote);
  const echo = useGame((s) => s.echo);
  const arrive = useGame((s) => s.arrive);
  const power = useGame((s) => s.throwPower);
  const reduce = useReducedMotion();
  const found = !searching && Boolean(echo);
  const cruise = 7.8 - Math.min(0.95, power) * 2.2;
  const title = note || (found && echo ? `到了 ${echo.city}` : "飞机在找一个相似的人");
  const body = found ? "把飞机往下拉，落到桌上。" : undefined;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-between overflow-hidden px-4 py-8">
      {found ? <Guide tone="night" title={title} body={body} /> : null}

      <div
        data-flight-sky
        className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
      >
        <motion.div
          className="pointer-events-none absolute left-[8%] top-[38%] h-10 w-[42%] rounded-full bg-paper/10 blur-md"
          animate={reduce ? undefined : { x: ["0%", "18%", "0%"], opacity: [0.25, 0.4, 0.25] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute right-[4%] top-[52%] h-8 w-[34%] rounded-full bg-paper/[0.08] blur-md"
          animate={reduce ? undefined : { x: ["0%", "-22%", "0%"], opacity: [0.18, 0.32, 0.18] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
        />

        {!found ? (
          <div className="pointer-events-none absolute inset-x-0 top-[6%] z-0">
            <FlightWaitMark />
          </div>
        ) : null}

        {found ? (
          <PullCommit
            testId="flight"
            enabled
            sign={1}
            threshold={48}
            hint="松开，落到桌上"
            commitBehavior="morph"
            onCommit={arrive}
            className="relative z-[1]"
          >
            <Craft className="h-20 w-40">
              <Plane className="h-full w-full" />
            </Craft>
          </PullCommit>
        ) : (
          <motion.div
            layoutId={CRAFT_ID}
            data-craft=""
            className="pointer-events-none relative z-[1] mt-16 h-20 w-40 will-change-transform"
            initial={{ x: 0, y: 28, rotate: -10, scale: 0.72, opacity: 0.5 }}
            animate={
              reduce
                ? { opacity: 1, scale: 0.9 }
                : {
                    x: [0, 48, -24, 32],
                    y: [18, -22, 10, 4],
                    rotate: [-10, 8, -6, 4],
                    scale: 0.9,
                    opacity: 1,
                  }
            }
            transition={
              reduce ? { duration: 0.01 } : { duration: cruise, repeat: Infinity, ease: "easeInOut" }
            }
          >
            <span className="plane-trail" />
            <Plane className="h-full w-full" />
          </motion.div>
        )}
      </div>
    </div>
  );
}
