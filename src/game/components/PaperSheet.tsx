import {
  cornerRadius,
  creaseOf,
  halfPath,
  pointsToPath,
  wingFolds,
  type Pt,
} from "../paperFlow";

export function PaperSheet({
  points,
  u,
  half,
  className,
}: {
  points: Pt[];
  u: number;
  half?: "left" | "right";
  className?: string;
}) {
  const outline = half ? halfPath(points, half) : pointsToPath(points, cornerRadius(u));
  const folds = u > 0.5 ? wingFolds(points) : [];
  const shade = Math.max(0, (u - 0.32) / 0.45);

  return (
    <g className={className}>
      <path
        d={outline}
        fill="#f0e6d2"
        style={{ filter: "drop-shadow(0 8px 0 #cbbda3) drop-shadow(0 14px 16px rgba(12,20,40,0.2))" }}
      />
      {half ? null : (
        <path d={halfPath(points, "left")} fill="#e4d6bb" opacity={shade * 0.55} />
      )}
      <path
        d={creaseOf(points)}
        fill="none"
        stroke="#c4b394"
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={Math.max(0, (u - 0.22) / 0.45)}
      />
      {folds.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="#c4b394"
          strokeWidth={1}
          strokeLinecap="round"
          opacity={(u - 0.5) / 0.32}
        />
      ))}
    </g>
  );
}
