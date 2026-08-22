import { cn } from "@/lib/utils";

export function Plane({
  className,
  flying,
  charged,
}: {
  className?: string;
  flying?: boolean;
  charged?: boolean;
}) {
  return (
    <div
      className={cn("pointer-events-none relative", flying && "plane-fly", className)}
      aria-hidden
    >
      {charged ? <span className="plane-charge" /> : null}
      <svg viewBox="0 0 80 40" className="relative h-full w-full drop-shadow-md">
        <path
          d="M4 22 L76 8 L42 22 L76 32 L4 22 Z"
          fill="#F7F1E6"
          stroke="#243044"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M42 22 L28 28 L4 22" fill="#E07A5F" opacity="0.85" />
        <path d="M42 22 L55 14 L76 8" fill="#3D9B8F" opacity="0.55" />
      </svg>
    </div>
  );
}
