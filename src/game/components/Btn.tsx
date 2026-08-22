import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "paper";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-11 px-5 py-2.5 font-medium tracking-wide",
        "transition-[transform,opacity] duration-(--motion-quick) ease-(--ease-out)",
        "disabled:opacity-40 disabled:pointer-events-none",
        "active:scale-[0.96]",
        variant === "primary" &&
          "rounded-full bg-coral text-paper shadow-[0_8px_24px_color-mix(in_oklab,var(--color-coral)_28%,transparent)]",
        variant === "ghost" && "rounded-full text-ink/70",
        variant === "paper" && "rounded-xl bg-paper text-ink shadow-sm",
        className,
      )}
    >
      {children}
    </button>
  );
}
