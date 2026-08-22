import { cn } from "@/lib/utils";

export function Guide({
  title,
  body,
  tone = "day",
}: {
  title: string;
  body?: string;
  tone?: "day" | "night";
}) {
  const night = tone === "night";
  return (
    <div
      className={cn(
        "pointer-events-none mx-auto max-w-md px-4 py-2 text-center",
        night
          ? "rounded-2xl bg-navy/55 text-paper"
          : "rounded-2xl bg-paper/92 text-ink shadow-[0_10px_28px_rgba(36,48,68,0.08)]",
      )}
    >
      <h2
        className={cn(
          "font-display text-[clamp(1.05rem,3vw,1.35rem)] font-normal leading-snug tracking-[0.1em] break-keep",
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
