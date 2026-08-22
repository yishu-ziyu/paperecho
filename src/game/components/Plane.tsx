import { cn } from "@/lib/utils";

/** Stepped voxel dart — MagicaVoxel cream clay, nose to the right. */
const S = 6;

type Part = "body" | "left" | "right" | "nose";
type Cell = { x: number; y: number; z: number; part: Part };

function build(): Cell[] {
  const cells: Cell[] = [];
  for (let x = 0; x <= 10; x++) cells.push({ x, y: 2, z: 0, part: x >= 9 ? "nose" : "body" });
  for (let x = 4; x <= 9; x++) cells.push({ x, y: 2, z: 1, part: x >= 9 ? "nose" : "body" });
  for (let x = 2; x <= 7; x++) {
    cells.push({ x, y: 1, z: 0, part: "left" });
    cells.push({ x, y: 3, z: 0, part: "right" });
  }
  for (let x = 3; x <= 6; x++) {
    cells.push({ x, y: 0, z: 0, part: "left" });
    cells.push({ x, y: 4, z: 0, part: "right" });
  }
  return cells;
}

const VOXELS = build();

const TOP = "#FFF6E8";
const LEFT = "#B7A686";
const RIGHT = "#E0CFA8";
const BURN = "#3A2A22";

function iso(x: number, y: number, z: number) {
  return { px: (x - y) * S, py: (x + y) * (S * 0.5) - z * S };
}

function cube(x: number, y: number, z: number) {
  const { px, py } = iso(x, y, z);
  const s = S;
  return {
    top: `M ${px} ${py - s} L ${px + s} ${py - s + s / 2} L ${px} ${py} L ${px - s} ${py - s / 2} Z`,
    left: `M ${px - s} ${py - s / 2} L ${px} ${py} L ${px} ${py + s} L ${px - s} ${py + s / 2} Z`,
    right: `M ${px + s} ${py - s / 2} L ${px} ${py} L ${px} ${py + s} L ${px + s} ${py + s / 2} Z`,
  };
}

const BOX = (() => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of VOXELS) {
    const { px, py } = iso(c.x, c.y, c.z);
    minX = Math.min(minX, px - S);
    maxX = Math.max(maxX, px + S);
    minY = Math.min(minY, py - S);
    maxY = Math.max(maxY, py + S);
  }
  const pad = 4;
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
})();

export function Plane({
  className,
  flying,
  charged,
  scorched = 0,
}: {
  className?: string;
  flying?: boolean;
  charged?: boolean;
  scorched?: 0 | 1 | 2;
}) {
  const cells = [...VOXELS].sort((a, b) => a.x + a.y - (b.x + b.y) || a.z - b.z);
  return (
    <div className={cn("pointer-events-none relative", flying && "plane-fly", className)} aria-hidden>
      {charged ? <span className="plane-charge" /> : null}
      <svg viewBox={BOX} className="vox-plane relative h-full w-full overflow-visible">
        {cells.map((c, i) => {
          const burn =
            (scorched >= 1 && c.part === "right" && c.x >= 6) ||
            (scorched >= 2 && c.part === "left" && c.x <= 3);
          const p = cube(c.x, c.y, c.z);
          return (
            <g key={i}>
              <path d={p.left} fill={burn ? BURN : LEFT} />
              <path d={p.right} fill={burn ? BURN : RIGHT} />
              <path d={p.top} fill={burn ? "#4A3A32" : TOP} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
