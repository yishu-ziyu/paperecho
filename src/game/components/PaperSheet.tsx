import { cornerRadius, creaseOf, pointsToPath, wingFolds, type Pt } from "../paperFlow";

export function PaperSheet({
  points,
  u,
  className,
}: {
  points: Pt[];
  u: number;
  className?: string;
}) {
  return (
    <g className={className}>
      <path
        d={pointsToPath(points, cornerRadius(u))}
        fill="#f0e6d2"
        style={{ filter: "drop-shadow(0 8px 0 #cbbda3) drop-shadow(0 14px 16px rgba(12,20,40,0.2))" }}
      />
      <path
        d={creaseOf(points)}
        fill="none"
        stroke="#c4b394"
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={Math.max(0, (u - 0.28) / 0.5)}
      />
      {u > 0.62
        ? wingFolds(points).map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="#c4b394"
              strokeWidth={1}
              strokeLinecap="round"
              opacity={(u - 0.62) / 0.3}
            />
          ))
        : null}
    </g>
  );
}
