import { cn } from "@/lib/utils";

export function Guide({
  title,
  body,
  tone = "day",
  className,
}: {
  title: string;
  body?: string;
  tone?: "day" | "night";
  className?: string;
}) {
  const night = tone === "night";
  return (
    <div
      className={cn(
        "pointer-events-none mx-auto max-w-md px-4 py-2 text-center",
        night
          ? "rounded-2xl bg-navy/55 text-paper"
          : "clay-sm rounded-2xl",
        className,
      )}
    >
      <h2
        className={cn(
          "font-display text-[clamp(1.05rem,3vw,1.4rem)] font-semibold leading-snug tracking-[0.06em] break-keep",
          night ? "text-paper" : "text-ink",
        )}
      >
        {title}
      </h2>
      {body ? (
        <p className={cn("mx-auto mt-1 max-w-sm text-xs leading-relaxed", night ? "text-paper/65" : "text-ink/55")}>
          {body}
        </p>
      ) : null}
    </div>
  );
}
