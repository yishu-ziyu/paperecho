import { useReducedMotion } from "motion/react";

/** Quiet once-through letter pop — yui540 stagger, no loop. */
export function LetterPop({
  text,
  start = 0,
  className,
}: {
  text: string;
  start?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <>
      {[...text].map((ch, i) => (
        <span
          key={`${start}-${i}-${ch}`}
          className={reduce ? className : className ? `${className} letter-pop` : "letter-pop"}
          style={{ ["--i" as string]: start + i }}
        >
          {ch === " " ? "\u00a0" : ch}
        </span>
      ))}
    </>
  );
}
