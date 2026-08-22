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

/** Slow at the top (thick paper), faster through the waist, settle as a dart. */
export function flowEase(t: number) {
  const x = Math.max(0, Math.min(1, t));
  if (x < 0.45) return 0.55 * (x / 0.45) ** 1.65;
  const r = (x - 0.45) / 0.55;
  return 0.55 + 0.45 * (1 - (1 - r) ** 2);
}

function cardPts(r: CardRect): Pt[] {
  const { x, y, w, h } = r;
  const cx = x + w / 2;
  return [
    { x: x + 24, y },
    { x: cx, y },
    { x: x + w - 24, y },
    { x: x + w, y: y + 26 },
    { x: x + w, y: y + h * 0.64 },
    { x: x + w - 20, y: y + h },
    { x: cx, y: y + h },
    { x: x + 20, y: y + h },
    { x: x, y: y + h * 0.64 },
    { x: x, y: y + 26 },
  ];
}

function glassPts(r: CardRect): Pt[] {
  const { x, y, w, h } = r;
  const cx = x + w / 2;
  const neck = Math.max(11, w * 0.045);
  const drip = h * 0.28;
  return [
    { x: x + w * 0.28, y: y + 10 },
    { x: cx, y: y + 6 },
    { x: x + w * 0.72, y: y + 10 },
    { x: x + w * 0.7, y: y + h * 0.3 },
    { x: cx + neck, y: y + h * 0.58 },
    { x: cx + 30, y: y + h + drip * 0.42 },
    { x: cx, y: y + h + drip },
    { x: cx - 30, y: y + h + drip * 0.42 },
    { x: cx - neck, y: y + h * 0.58 },
    { x: x + w * 0.3, y: y + h * 0.3 },
  ];
}

function dartPts(cx: number, cy: number): Pt[] {
  const w = 78;
  const h = 98;
  return [
    { x: cx - 8, y: cy - h / 2 + 12 },
    { x: cx, y: cy - h / 2 },
    { x: cx + 8, y: cy - h / 2 + 12 },
    { x: cx + 10, y: cy - h * 0.1 },
    { x: cx + w / 2, y: cy - 2 },
    { x: cx + 15, y: cy + h * 0.2 },
    { x: cx, y: cy + h / 2 },
    { x: cx - 15, y: cy + h * 0.2 },
    { x: cx - w / 2, y: cy - 2 },
    { x: cx - 10, y: cy - h * 0.1 },
  ];
}

export function destOf(u: number, from: CardRect, view: { w: number; h: number }) {
  const t = smooth(Math.max(0, (u - 0.18) / 0.82));
  return {
    x: lerp(from.x + from.w / 2, view.w / 2, t),
    y: lerp(from.y + from.h + 36, view.h - 70, t),
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

export function pointsToPath(pts: Pt[], tension = 6): string {
  const n = pts.length;
  if (n < 3) return "";
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    d += ` C ${p1.x + (p2.x - p0.x) / tension} ${p1.y + (p2.y - p0.y) / tension} ${p2.x - (p3.x - p1.x) / tension} ${p2.y - (p3.y - p1.y) / tension} ${p2.x} ${p2.y}`;
  }
  return `${d} Z`;
}

export function creaseOf(pts: Pt[]): string {
  const top = pts[1]!;
  const nose = pts[6]!;
  return `M ${top.x} ${top.y} L ${nose.x} ${nose.y}`;
}
