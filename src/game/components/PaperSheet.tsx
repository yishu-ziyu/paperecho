import { creaseOf, pointsToPath, type Pt } from "../paperFlow";

export function PaperSheet({
  points,
  u,
  className,
}: {
  points: Pt[];
  u: number;
  className?: string;
}) {
  const tension = u < 0.35 ? 8.5 : u > 0.82 ? 5.2 : 6.2;
  return (
    <g className={className}>
      <path
        d={pointsToPath(points, tension)}
        fill="#f0e6d2"
        style={{ filter: "drop-shadow(0 10px 0 #cbbda3) drop-shadow(0 16px 18px rgba(12,20,40,0.22))" }}
      />
      <path
        d={creaseOf(points)}
        fill="none"
        stroke="#c4b394"
        strokeWidth={1.3}
        strokeLinecap="round"
        opacity={Math.max(0, (u - 0.22) / 0.55)}
      />
    </g>
  );
}
