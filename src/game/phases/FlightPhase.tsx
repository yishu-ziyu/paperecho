import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Guide } from "../components/Guide";
import { Plane } from "../components/Plane";
import { Craft, CRAFT_ID, PullCommit } from "../continuum";
import { dur, ease, spring } from "../motion";
import { useGame } from "../store";

export function FlightPhase() {
  const searching = useGame((s) => s.searching);
  const note = useGame((s) => s.searchNote);
  const echo = useGame((s) => s.echo);
  const arrive = useGame((s) => s.arrive);
  const power = useGame((s) => s.throwPower);
  const reduce = useReducedMotion();
  const [progress, setProgress] = useState(12);
  const found = !searching && Boolean(echo);
  const cruise = 7.8 - Math.min(0.95, power) * 2.2;
  const title = note || (found && echo ? `到了 ${echo.city}` : "飞机在找一个相似的人");
  const body = found ? "把飞机往下拉，落到桌上。" : undefined;

  useEffect(() => {
    if (found) {
      setProgress(100);
      return;
    }
    const t = window.setInterval(() => {
      setProgress((v) => (v >= 88 ? v : v + 2));
    }, 220);
    return () => window.clearInterval(t);
  }, [found]);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-between overflow-hidden px-4 py-8">
      <Guide tone="night" title={title} body={body} />

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
            className="pointer-events-none relative z-[1] h-20 w-40 will-change-transform"
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

      <div className="relative mt-auto w-52 pb-4">
        <div className="h-0.5 overflow-hidden rounded-full bg-paper/20">
          <motion.div
            data-flight-progress
            className="h-full origin-left bg-coral"
            initial={false}
            animate={{ scaleX: found ? 1 : Math.min(0.88, progress / 100) }}
            transition={found ? spring.parent : { duration: 0.2, ease: "linear" }}
          />
        </div>
        <motion.p
          key={echo ? `${echo.name}-${echo.city}` : note}
          className="mt-3 text-center text-xs text-paper/70"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur.enter, ease: ease.enter }}
        >
          {found ? "往下拉，落到桌上" : echo ? `${echo.name} · ${echo.city}` : note}
        </motion.p>
      </div>
    </div>
  );
}
