import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { Phase } from "../types";
import { Starfield } from "./Starfield";

const STILL: Record<Phase, string | null> = {
  title: null,
  orbit: "/scenes/room.jpg",
  mirror: "/scenes/room.jpg",
  compose: "/scenes/room.jpg",
  fold: "/scenes/room.jpg",
  throw: null,
  flight: null,
  encounter: "/scenes/echo.jpg",
  return: "/scenes/echo.jpg",
  archive: "/scenes/drawer.jpg",
};

const VIDEO: Partial<Record<Phase, string>> = {
  title: "/scenes/room.mp4",
  flight: "/scenes/flight.mp4",
};

function layerKey(phase: Phase, video?: string, still?: string | null) {
  return video || still || (phase === "throw" || phase === "flight" ? "night" : "void");
}

export function Scene({ phase, children, className }: { phase: Phase; children: ReactNode; className?: string }) {
  const night = phase === "flight" || phase === "throw";
  const [allowVideo, setAllowVideo] = useState(true);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setAllowVideo(!q.matches);
    apply();
    q.addEventListener("change", apply);
    return () => q.removeEventListener("change", apply);
  }, []);
  const video = allowVideo ? VIDEO[phase] : undefined;
  const still = STILL[phase];
  const indoor =
    phase === "orbit" || phase === "mirror" || phase === "compose" || phase === "fold";
  return (
    <div className={cn("relative isolate h-dvh overflow-hidden bg-navy text-ink", className)}>
      <div className="pointer-events-none absolute inset-0">
        <AnimatePresence initial={false}>
          <motion.div
            key={layerKey(phase, video, still)}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.2, 0, 0, 1] }}
          >
            {video ? (
              <video
                src={video}
                autoPlay
                muted
                loop
                playsInline
                poster={phase === "flight" ? "/scenes/sky.jpg" : "/scenes/room.jpg"}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : still ? (
              <img
                src={still}
                alt=""
                crossOrigin="anonymous"
                className={cn(
                  "absolute inset-0 h-full w-full object-cover",
                  indoor && "object-[center_82%]",
                )}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-[background] duration-500 ease-[cubic-bezier(0.2,0,0,1)]",
          night
            ? phase === "flight"
              ? "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-navy)_35%,transparent)_0%,color-mix(in_oklab,var(--color-navy)_25%,transparent)_50%,color-mix(in_oklab,var(--color-navy)_70%,transparent)_100%)]"
              : "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-navy)_42%,transparent)_0%,color-mix(in_oklab,var(--color-navy)_55%,transparent)_55%,var(--color-navy)_100%)]"
            : phase === "title"
              ? "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-paper)_55%,transparent)_0%,color-mix(in_oklab,var(--color-paper)_18%,transparent)_42%,color-mix(in_oklab,var(--color-paper)_72%,transparent)_100%)]"
              : "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-paper)_84%,transparent)_0%,color-mix(in_oklab,var(--color-paper)_62%,transparent)_42%,color-mix(in_oklab,var(--color-paper)_88%,transparent)_100%)]",
        )}
      />
      {night ? <Starfield /> : null}
      <div className="relative z-10 flex h-dvh min-h-0 flex-col">{children}</div>
    </div>
  );
}
