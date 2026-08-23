import { useId } from "react";
import { cn } from "@/lib/utils";

const BURN = "#3A2A22";
const BURN_PAPER = "#4A3A32";

/**
 * Same cream sheet as Fold / TitleDive. Nose to the right.
 */
export function Plane({
  className,
  flying,
  charged,
  scorched = 0,
}: {
  className?: string;
  flying?: boolean;
  charged?: boolean;
  scorched?: 0 | 1 | 2;
}) {
  const uid = useId().replace(/:/g, "");
  const top = scorched >= 1 ? BURN_PAPER : `url(#${uid}-top)`;
  const bot = scorched >= 2 ? BURN : `url(#${uid}-bot)`;
  const fold = scorched >= 1 ? BURN_PAPER : `url(#${uid}-fold)`;
  return (
    <div className={cn("pointer-events-none relative", flying && "plane-fly", className)} aria-hidden>
      {charged ? <span className="plane-charge" /> : null}
      <svg viewBox="0 0 168 80" className="paper-plane relative h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`${uid}-top`} x1="20" y1="8" x2="150" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fff6e8" />
            <stop offset="55%" stopColor="#f0e6d2" />
            <stop offset="100%" stopColor="#e8d8b8" />
          </linearGradient>
          <linearGradient id={`${uid}-bot`} x1="20" y1="72" x2="150" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e4d6bb" />
            <stop offset="100%" stopColor="#cbbda3" />
          </linearGradient>
          <linearGradient id={`${uid}-fold`} x1="8" y1="24" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e8dcc4" />
            <stop offset="100%" stopColor="#d4c4a4" />
          </linearGradient>
        </defs>
        <path d="M16 40 L154 40 L26 72 L10 49 Z" fill={bot} />
        <path d="M16 40 L154 40 L26 8 L10 31 Z" fill={top} />
        <path d="M10 31 L26 8 L42 40 L16 40 Z" fill={fold} />
        <path d="M10 49 L26 72 L42 40 L16 40 Z" fill={scorched >= 2 ? BURN : "#d4c4a4"} />
        <path d="M26 8 L42 40 L154 40" fill="none" stroke="#c4b394" strokeWidth="1.05" />
        <path d="M26 72 L42 40 L154 40" fill="none" stroke="#c4b394" strokeWidth="1.05" />
        <path d="M16 40 L154 40" fill="none" stroke="#c4b394" strokeWidth="1.55" strokeLinecap="round" />
        <path d="M10 31 L16 40 L10 49" fill="none" stroke="#c4b394" strokeWidth="1" strokeLinejoin="round" />
        <path d="M26 8 L154 40 L42 40 Z" fill="#fff8ee" opacity="0.22" />
      </svg>
    </div>
  );
}
