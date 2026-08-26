import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Guide } from "../components/Guide";
import { LetterPop } from "../components/LetterPop";
import { Plane } from "../components/Plane";
import { Craft, CRAFT_ID, PullCommit } from "../continuum";
import { useGame } from "../store";

/** 从某时刻起已过的整秒数；等待开始时计时，结束返回 0。 */
function useElapsed(since: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [since]);
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
}

function FlightWaitMark() {
  return (
    <div className="flight-wait-stage">
      <p data-flight-wait className="flight-wait-mark">
        <span className="flight-wait-fill">
          <LetterPop text="寻找世另我" />
          <span className="flight-wait-ing">
            <LetterPop text="ing" start={5} />
          </span>
        </span>
      </p>
    </div>
  );
}

export function FlightPhase() {
  const searching = useGame((s) => s.searching);
  const note = useGame((s) => s.searchNote);
  const echo = useGame((s) => s.echo);
  const arrive = useGame((s) => s.arrive);
  const abortFlight = useGame((s) => s.abortFlight);
  const waitingSince = useGame((s) => s.waitingSince);
  const power = useGame((s) => s.throwPower);
  const reduce = useReducedMotion();
  const found = !searching && Boolean(echo);
  const cruise = 7.8 - Math.min(0.95, power) * 2.2;
  const title = note || (found && echo ? `到了 ${echo.city}` : "飞机在找一个相似的人");
  const body = found ? "往下拉" : undefined;
  const elapsed = useElapsed(searching ? waitingSince : 0);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-between overflow-hidden px-4 py-8">
      {found ? <Guide tone="night" title={title} body={body} /> : null}

      <div
        data-flight-sky
        className="relative flex min-h-0 w-full flex-1 flex-col items-center overflow-hidden"
      >
        <motion.div
          className="pointer-events-none absolute left-[8%] top-[38%] h-10 w-[42%] rounded-full bg-paper/10 blur-md"
          animate={reduce ? undefined : { x: ["0%", "18%", "0%"], opacity: [0.08, 0.16, 0.08] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute right-[4%] top-[52%] h-8 w-[34%] rounded-full bg-paper/[0.08] blur-md"
          animate={reduce ? undefined : { x: ["0%", "-22%", "0%"], opacity: [0.06, 0.12, 0.06] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
        />

        <div
          className={
            found
              ? "relative z-[1] flex min-h-0 w-full flex-1 items-center justify-center"
              : "relative z-[1] flex min-h-0 w-full flex-1 flex-col items-center"
          }
        >
          {!found ? (
            <div className="mt-[max(0.4rem,env(safe-area-inset-top))] w-full shrink-0 text-center">
              <FlightWaitMark />
              {searching ? (
                <div className="mt-3 flex flex-col items-center gap-2.5">
                  <p className="text-xs tracking-[0.2em] text-paper/55">
                    {elapsed > 0 ? `已等 ${elapsed} 秒` : "正在找"}
                  </p>
                  <button
                    type="button"
                    onClick={abortFlight}
                    className="rounded-full border border-paper/25 px-4 py-1.5 text-xs tracking-[0.18em] text-paper/70 transition-[background-color,color] duration-(--motion-fast) hover:bg-paper/10 hover:text-paper"
                  >
                    不找了，回地球
                  </button>
                </div>
              ) : null}
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
            >
              <Craft className="h-24 w-20">
                <Plane className="h-full w-full" />
              </Craft>
            </PullCommit>
          ) : (
            <div className="flex min-h-0 w-full flex-1 items-center justify-center">
              <motion.div
                layoutId={CRAFT_ID}
                data-craft=""
                className="pointer-events-none h-24 w-20 will-change-transform"
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
