export type CardRect = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mix(a: Pt[], b: Pt[], t: number): Pt[] {
  return a.map((p, i) => ({
    x: lerp(p.x, b[i]!.x, t),
    y: lerp(p.y, b[i]!.y, t),
  }));
}

function smooth(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function flowEase(t: number) {
  const x = Math.max(0, Math.min(1, t));
  if (x < 0.5) return 0.4 * (x / 0.5) ** 1.25;
  const r = (x - 0.5) / 0.5;
  return 0.4 + 0.6 * (1 - (1 - r) ** 1.55);
}

/**
 * 8 points, mirrored pairs: 0-1 top, 2-7 upper sides, 3-6 lower sides, 4-5 bottom.
 * 4 and 5 meet at the nose.
 */
function cardPts(r: CardRect): Pt[] {
  const { x, y, w, h } = r;
  const rad = Math.min(22, w / 6, h / 8);
  return [
    { x: x + rad, y },
    { x: x + w - rad, y },
    { x: x + w, y: y + rad },
    { x: x + w, y: y + h - rad },
    { x: x + w - rad, y: y + h },
    { x: x + rad, y: y + h },
    { x: x, y: y + h - rad },
    { x: x, y: y + rad },
  ];
}

function glassPts(r: CardRect): Pt[] {
  const { x, y, w, h } = r;
  const cx = x + w / 2;
  const inset = w * 0.07;
  const waist = w * 0.23;
  const foot = w * 0.38;
  return [
    { x: x + inset, y: y + 6 },
    { x: x + w - inset, y: y + 6 },
    { x: x + w - inset, y: y + h * 0.2 },
    { x: cx + waist, y: y + h * 0.5 },
    { x: cx + foot, y: y + h + 12 },
    { x: cx - foot, y: y + h + 12 },
    { x: cx - waist, y: y + h * 0.5 },
    { x: x + inset, y: y + h * 0.2 },
  ];
}

function dartPts(cx: number, cy: number): Pt[] {
  return [
    { x: cx - 3, y: cy - 36 },
    { x: cx + 3, y: cy - 36 },
    { x: cx + 30, y: cy + 0 },
    { x: cx + 28, y: cy + 6 },
    { x: cx + 1, y: cy + 40 },
    { x: cx - 1, y: cy + 40 },
    { x: cx - 28, y: cy + 6 },
    { x: cx - 30, y: cy + 0 },
  ];
}

export function destOf(u: number, from: CardRect, view: { w: number; h: number }) {
  const t = smooth(Math.max(0, (u - 0.28) / 0.72));
  return {
    x: lerp(from.x + from.w / 2, view.w / 2, t),
    y: lerp(from.y + from.h + 18, view.h - 72, t),
  };
}

export function flowPoints(u: number, from: CardRect, destX: number, destY: number): Pt[] {
  const t = Math.max(0, Math.min(1, u));
  const card = cardPts(from);
  const glass = glassPts(from);
  const dart = dartPts(destX, destY);
  if (t <= 0.4) return mix(card, glass, smooth(t / 0.4));
  return mix(glass, dart, smooth((t - 0.4) / 0.6));
}

export function cornerRadius(u: number) {
  return lerp(22, 0, Math.max(0, Math.min(1, u * 1.15)));
}

export function pointsToPath(pts: Pt[], radius: number): string {
  const n = pts.length;
  if (n < 3) return "";
  if (radius < 0.85) {
    return `M ${pts[0]!.x} ${pts[0]!.y} ${pts
      .slice(1)
      .map((p) => `L ${p.x} ${p.y}`)
      .join(" ")} Z`;
  }
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!;
    const curr = pts[i]!;
    const next = pts[(i + 1) % n]!;
    const d1 = dist(curr, prev) || 1;
    const d2 = dist(curr, next) || 1;
    const rad = Math.min(radius, d1 * 0.4, d2 * 0.4);
    const a = {
      x: curr.x + ((prev.x - curr.x) / d1) * rad,
      y: curr.y + ((prev.y - curr.y) / d1) * rad,
    };
    const b = {
      x: curr.x + ((next.x - curr.x) / d2) * rad,
      y: curr.y + ((next.y - curr.y) / d2) * rad,
    };
    if (i === 0) parts.push(`M ${a.x} ${a.y}`);
    else parts.push(`L ${a.x} ${a.y}`);
    parts.push(`Q ${curr.x} ${curr.y} ${b.x} ${b.y}`);
  }
  return `${parts.join(" ")} Z`;
}

export function creaseOf(pts: Pt[]): string {
  const top = { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 };
  const nose = { x: (pts[4]!.x + pts[5]!.x) / 2, y: (pts[4]!.y + pts[5]!.y) / 2 };
  return `M ${top.x} ${top.y} L ${nose.x} ${nose.y}`;
}

export function wingFolds(pts: Pt[]): [string, string] {
  const mid = {
    x: (pts[0]!.x + pts[1]!.x + pts[4]!.x + pts[5]!.x) / 4,
    y: (pts[0]!.y + pts[1]!.y + pts[4]!.y + pts[5]!.y) / 4,
  };
  return [
    `M ${pts[2]!.x} ${pts[2]!.y} L ${mid.x} ${mid.y}`,
    `M ${pts[7]!.x} ${pts[7]!.y} L ${mid.x} ${mid.y}`,
  ];
}
