import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useCameraSway } from "../camera";
import type { Phase } from "../types";
import { Starfield } from "./Starfield";

const STILL: Record<Phase, string | null> = {
  title: "/scenes/title.jpg",
  orbit: "/scenes/room.jpg",
  mirror: "/scenes/room.jpg",
  fold: "/scenes/room.jpg",
  throw: "/scenes/sky.jpg",
  flight: "/scenes/sky.jpg",
  encounter: "/scenes/echo.jpg",
  return: "/scenes/echo.jpg",
  archive: "/scenes/drawer.jpg",
};

const VIDEO: Partial<Record<Phase, string>> = {
  orbit: "/scenes/room.mp4",
  mirror: "/scenes/room.mp4",
  fold: "/scenes/room.mp4",
  flight: "/scenes/flight.mp4",
};

function layerKey(phase: Phase, video?: string, still?: string | null) {
  return video || still || (phase === "throw" || phase === "flight" ? "night" : "void");
}

export function Scene({
  phase,
  children,
  className,
  closeUp = false,
}: {
  phase: Phase;
  children: ReactNode;
  className?: string;
  /** 纸飞机拆开后再推近，避免在幕布后面就把地球放大。 */
  closeUp?: boolean;
}) {
  const night = phase === "flight" || phase === "throw" || phase === "title";
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
    phase === "orbit" || phase === "mirror" || phase === "fold";
  const sway = phase !== "throw" && phase !== "flight";
  const zoom = sway && closeUp;
  const camRef = useCameraSway(sway, zoom);
  return (
    <div
      className={cn("relative isolate h-dvh overflow-hidden bg-navy text-ink", className)}
      style={sway ? { perspective: "1200px" } : undefined}
    >
      <div
        ref={camRef}
        className="pointer-events-none absolute inset-0 origin-center will-change-transform"
        style={{ transformStyle: "preserve-3d" }}
      >
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
                poster={phase === "flight" ? "/scenes/sky.jpg" : still || "/scenes/room.jpg"}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : still ? (
              <img
                src={still}
                alt=""
                crossOrigin="anonymous"
                className={cn(
                  "absolute inset-0 h-full w-full object-cover",
                  indoor && "object-[center_42%]",
                  phase === "title" && "object-[center_58%]",
                  phase === "encounter" && "object-[center_28%]",
                )}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
        <div
          className={cn(
            "pointer-events-none absolute inset-0 transition-[background] duration-500 ease-[cubic-bezier(0.2,0,0,1)]",
            phase === "title"
              ? "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-navy)_18%,transparent)_0%,transparent_38%,color-mix(in_oklab,var(--color-navy)_72%,transparent)_100%)]"
              : night
                ? phase === "flight"
                  ? "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-navy)_28%,transparent)_0%,color-mix(in_oklab,var(--color-navy)_18%,transparent)_48%,color-mix(in_oklab,var(--color-navy)_62%,transparent)_100%)]"
                  : "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-navy)_32%,transparent)_0%,color-mix(in_oklab,var(--color-navy)_40%,transparent)_55%,var(--color-navy)_100%)]"
                : indoor
                  ? "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-navy)_32%,transparent)_0%,color-mix(in_oklab,var(--color-navy)_14%,transparent)_38%,color-mix(in_oklab,var(--color-navy)_52%,transparent)_100%)]"
                  : "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-navy)_22%,transparent)_0%,color-mix(in_oklab,var(--color-navy)_18%,transparent)_40%,color-mix(in_oklab,var(--color-navy)_55%,transparent)_100%)]",
          )}
        />
      </div>
      {night ? <Starfield /> : null}
      <div className="relative z-10 flex h-dvh min-h-0 flex-col">{children}</div>
    </div>
  );
}
