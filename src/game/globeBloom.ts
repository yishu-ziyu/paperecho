import { REGIONS, STORIES } from "./stories.ts";
import type { EmotionId, RegionId } from "./types.ts";

export type BloomMap = Record<RegionId, number>;

export function emptyBloom(v = 0): BloomMap {
  return {
    east: v,
    america: v,
    europe: v,
    africa: v,
    oceania: v,
    polar: v,
  };
}

/** 灯序：和今晚重叠最多的区先开，极夜永远最后、最暗。 */
export function bloomOrder(feels: EmotionId[]): RegionId[] {
  const score = new Map<RegionId, number>();
  const index = new Map<RegionId, number>();
  for (const [i, r] of REGIONS.entries()) {
    score.set(r.id, 0);
    index.set(r.id, i);
  }
  for (const s of STORIES) {
    const n = s.feels.filter((f) => feels.includes(f)).length;
    if (n) score.set(s.region, (score.get(s.region) ?? 0) + n);
  }
  return [...REGIONS]
    .sort((a, b) => {
      if (a.id === "polar") return 1;
      if (b.id === "polar") return -1;
      const d = (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0);
      if (d) return d;
      return (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0);
    })
    .map((r) => r.id);
}

/** 方块开花：先矮一截，再胀过，再收回。 */
export function bloomPulse(t: number) {
  const u = Math.max(0, Math.min(1, t));
  if (u <= 0) return 0;
  if (u < 0.34) return (u / 0.34) * 0.38;
  if (u < 0.68) return 0.38 + ((u - 0.34) / 0.34) * 0.9;
  return 1.28 - ((u - 0.68) / 0.32) * 0.28;
}

/** 把区投到地球画布上。背面返回 null。 */
export function projectRegion(
  lat: number,
  lng: number,
  phi: number,
  theta: number,
  width: number,
): { x: number; y: number; z: number } | null {
  const lambda = (lng * Math.PI) / 180 + phi;
  const phiLat = (lat * Math.PI) / 180;
  const cl = Math.cos(lambda);
  const sl = Math.sin(lambda);
  const cp = Math.cos(phiLat);
  const sp = Math.sin(phiLat);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const x = cp * sl;
  const y = sp * ct - cp * cl * st;
  const z = sp * st + cp * cl * ct;
  if (z < 0.08) return null;
  const r = width * 0.46;
  return { x: width / 2 + x * r, y: width / 2 - y * r, z };
}

/** 点中哪盏亮着的窗。没点中就空，不偷最近朝向。 */
export function pickMarkerAt(
  px: number,
  py: number,
  width: number,
  phi: number,
  theta: number,
  bloom: Partial<BloomMap> = {},
  maxDist = 56,
): RegionId | null {
  let best: RegionId | null = null;
  let bestD = maxDist;
  for (const r of REGIONS) {
    if ((bloom[r.id] ?? 1) < 0.45) continue;
    const p = projectRegion(r.lat, r.lng, phi, theta, width);
    if (!p) continue;
    const d = Math.hypot(px - p.x, py - p.y);
    if (d < bestD) {
      bestD = d;
      best = r.id;
    }
  }
  return best;
}
