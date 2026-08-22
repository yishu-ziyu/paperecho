import { useEffect, useId, useMemo, useRef, useState } from "react";
import { NOTIF_BLUE } from "../bloub/decor";
import { BotEngine, type BotFrame, type Look } from "../bloub/engine";
import { EXPRESSION_BY_ID } from "../bloub/expressions";
import { DEMI_VIEWBOX, RAYON } from "../bloub/repere";
import { SHAPE_BY_ID, mixHex } from "../bloub/skins";
import { POSES, type StateId } from "../bloub/states";

/**
 * React host for the bloub engine.
 * The engine stays a pure function of time; this file only owns the clock and SVG.
 */
export function BloubBot({
  size = 64,
  shape = "cercle",
  color = "#0a0a0c",
  expression = "neutre",
  state = "idle",
  paper = "#f0e6d2",
  look = null,
  tight = true,
  title,
  className,
}: {
  size?: number;
  shape?: string;
  color?: string;
  expression?: string;
  state?: StateId;
  paper?: string;
  look?: { x: number; y: number } | null;
  /** Crop the ring margin. Idle faces don't need the 158-unit orbit box. */
  tight?: boolean;
  title?: string | null;
  className?: string;
}) {
  const reactId = useId();
  const uid = useMemo(() => reactId.replace(/[^a-zA-Z0-9]/g, ""), [reactId]);
  const maskId = `bot-mask-${uid}`;
  const reduce = useMemo(
    () => globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    [],
  );

  const radii = SHAPE_BY_ID.get(shape)?.radii ?? null;
  const expr = EXPRESSION_BY_ID.get(expression) ?? null;
  const frozenAt = reduce ? (POSES[state] ?? 1) : null;

  const engine = useRef<BotEngine | null>(null);
  if (!engine.current) engine.current = new BotEngine(RAYON, state, radii, expr);

  const clock = useRef(0);
  const [frame, setFrame] = useState<BotFrame>(() => engine.current!.sample(frozenAt ?? 0));

  useEffect(() => {
    const bot = engine.current!;
    const now = clock.current;
    bot.setState(state, now);
    bot.setShape(radii, now);
    bot.setExpression(expr, now);
    if (look) {
      bot.setLook(
        {
          yaw: Math.max(-1, Math.min(1, look.x)) * 16,
          pitch: 10 - Math.max(-1, Math.min(1, look.y)) * 13,
          mix: 1,
          spin: 0,
          wander: 0,
        } satisfies Look,
        now,
      );
    } else {
      bot.setLook(null, now);
    }
    if (frozenAt !== null) setFrame(bot.sample(frozenAt));
  }, [state, radii, expr, look, frozenAt]);

  useEffect(() => {
    if (frozenAt !== null) return;
    let raf = 0;
    let last = 0;
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0;
      last = ms;
      clock.current += dt;
      setFrame(engine.current!.sample(clock.current));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frozenAt]);

  const vb = tight ? 122 : DEMI_VIEWBOX;
  const ink = color;
  const label = title === undefined ? "bot" : title;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-vb} ${-vb} ${vb * 2} ${vb * 2}`}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-vb} y={-vb} width={vb * 2} height={vb * 2}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="#000" />
          ))}
          {frame.notch ? <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" /> : null}
        </mask>
        {frame.arcs.map((arc) => (
          <linearGradient
            key={arc.id}
            id={`${uid}-${arc.id}`}
            gradientUnits="userSpaceOnUse"
            x1={arc.grad.x1}
            y1={arc.grad.y1}
            x2={arc.grad.x2}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((c, i) => (
              <stop key={i} offset={i / Math.max(arc.grad.stops.length - 1, 1)} stopColor={c} />
            ))}
          </linearGradient>
        ))}
      </defs>
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`b${arc.id}`}
            d={arc.back}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>
      {frame.dotsBehind ? <Dots dots={frame.dots} ink={ink} paper={paper} scale={RAYON} /> : null}
      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill={paper} />
        <g mask={`url(#${maskId})`}>
          <rect x={-vb} y={-vb} width={vb * 2} height={vb * 2} fill={ink} />
        </g>
      </g>
      {!frame.dotsBehind ? <Dots dots={frame.dots} ink={ink} paper={paper} scale={RAYON} /> : null}
      {frame.notif ? <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} /> : null}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`f${arc.id}`}
            d={arc.front}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>
    </svg>
  );
}

function Dots({
  dots,
  ink,
  paper,
  scale,
}: {
  dots: BotFrame["dots"];
  ink: string;
  paper: string;
  scale: number;
}) {
  return (
    <g>
      {dots.map((dot, i) => {
        const fill = dot.color ?? (dot.depth === undefined ? ink : mixHex(paper, ink, dot.depth));
        if (dot.d) {
          return (
            <path
              key={i}
              d={dot.d}
              fill={fill}
              opacity={dot.opacity}
              transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${scale})`}
            />
          );
        }
        return <circle key={i} cx={dot.x} cy={dot.y} r={dot.r} fill={fill} opacity={dot.opacity} />;
      })}
    </g>
  );
}
