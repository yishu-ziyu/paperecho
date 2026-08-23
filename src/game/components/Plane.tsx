import { useId } from "react";
import { cn } from "@/lib/utils";

const BURN = "#3A2A22";
const BURN_PAPER = "#4A3A32";

/**
 * Folded dart, same cream sheet as Fold / TitleDive.
 * Nose points up in local SVG space; parents rotate heading on top.
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
  const leftWing = scorched >= 1 ? BURN_PAPER : `url(#${uid}-left)`;
  const rightWing = scorched >= 1 ? BURN_PAPER : `url(#${uid}-right)`;
  const leftBody = scorched >= 2 ? BURN : `url(#${uid}-body-l)`;
  const rightBody = scorched >= 2 ? BURN : `url(#${uid}-body-r)`;
  const ink = scorched >= 1 ? "#2c221c" : "#c4b394";
  return (
    <div className={cn("pointer-events-none relative", flying && "plane-fly", className)} aria-hidden>
      {charged ? <span className="plane-charge" /> : null}
      <svg viewBox="0 0 100 96" className="paper-plane relative h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`${uid}-left`} x1="18" y1="18" x2="58" y2="78" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fff6e8" />
            <stop offset="55%" stopColor="#f0e6d2" />
            <stop offset="100%" stopColor="#e2d3b6" />
          </linearGradient>
          <linearGradient id={`${uid}-right`} x1="82" y1="16" x2="48" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#efe4cc" />
            <stop offset="60%" stopColor="#e0d0b0" />
            <stop offset="100%" stopColor="#cbbda3" />
          </linearGradient>
          <linearGradient id={`${uid}-body-l`} x1="42" y1="20" x2="50" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#efe3c8" />
            <stop offset="100%" stopColor="#d4c4a4" />
          </linearGradient>
          <linearGradient id={`${uid}-body-r`} x1="58" y1="18" x2="50" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e4d6bb" />
            <stop offset="100%" stopColor="#c4b394" />
          </linearGradient>
        </defs>
        <path d="M50 8 L90 62 L62 58 Z" fill={rightWing} />
        <path d="M50 8 L10 62 L38 58 Z" fill={leftWing} />
        <path d="M50 8 L62 58 L70 90 L50 68 Z" fill={rightBody} />
        <path d="M50 8 L38 58 L30 90 L50 68 Z" fill={leftBody} />
        <path d="M38 58 L50 68 L62 58" fill="none" stroke={ink} strokeWidth="1.05" strokeLinejoin="round" />
        <path d="M50 8 L50 68" fill="none" stroke={ink} strokeWidth="1.45" strokeLinecap="round" />
        <path d="M10 62 L38 58 L50 8" fill="none" stroke={ink} strokeWidth="1" />
        <path d="M90 62 L62 58 L50 8" fill="none" stroke={ink} strokeWidth="1" />
        <path d="M38 58 L30 90" fill="none" stroke={ink} strokeWidth="0.9" />
        <path d="M62 58 L70 90" fill="none" stroke={ink} strokeWidth="0.9" />
        <path d="M50 8 L76 48 L62 58 Z" fill="#fff8ee" opacity="0.28" />
      </svg>
    </div>
  );
}
