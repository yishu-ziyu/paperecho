import { cn } from "@/lib/utils";

export function Blob({
  color,
  size = 88,
  mood = 0.5,
  lookX = 0,
  lookY = 0,
  className,
  label,
}: {
  color: string;
  size?: number;
  mood?: number;
  lookX?: number;
  lookY?: number;
  className?: string;
  label?: string;
}) {
  const eyeY = 0.38 + (1 - mood) * 0.04;
  const lid = Math.max(0.12, 0.22 - mood * 0.08);
  return (
    <div
      className={cn("relative flex flex-col items-center", className)}
      style={{ width: size }}
    >
      <div
        className="blob-breathe relative"
        style={{ width: size, height: size * 1.18 }}
      >
        <div
          className="absolute left-1/2 top-[8%] h-[62%] w-[72%] -translate-x-1/2 rounded-full"
          style={{ background: color }}
        />
        <div
          className="absolute bottom-0 left-1/2 h-[52%] w-[86%] -translate-x-1/2 rounded-[45%]"
          style={{ background: color }}
        />
        <div
          className="absolute left-[28%] rounded-full bg-ink"
          style={{
            width: size * 0.1,
            height: size * lid,
            top: `${eyeY * 100}%`,
            transform: `translate(${lookX * 4}px, ${lookY * 3}px)`,
          }}
        />
        <div
          className="absolute right-[28%] rounded-full bg-ink"
          style={{
            width: size * 0.1,
            height: size * lid,
            top: `${eyeY * 100}%`,
            transform: `translate(${lookX * 4}px, ${lookY * 3}px)`,
          }}
        />
        <div
          className="absolute left-1/2 h-[3px] w-[18%] -translate-x-1/2 rounded-full bg-ink/70"
          style={{
            top: `${(eyeY + 0.18) * 100}%`,
            transform: `translateX(-50%) rotate(${(mood - 0.5) * 18}deg)`,
          }}
        />
      </div>
      {label ? (
        <span className="mt-1 font-display text-sm text-ink/70">{label}</span>
      ) : null}
    </div>
  );
}
