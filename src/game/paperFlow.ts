export type CardRect = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };
export type DartBox = { cx: number; top: number; bot: number; hw: number };

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
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
 * 10 points, clockwise from the top-inner pair:
 * 0-1 V, 2/9 trailing peaks, 3/8 wing tips, 4/7 body step, 5-6 nose.
 */
function cardPts(r: CardRect): Pt[] {
  const { x, y, w, h } = r;
  const rad = Math.min(22, w / 6, h / 8);
  const cx = x + w / 2;
  return [
    { x: cx - w * 0.14, y },
    { x: cx + w * 0.14, y },
    { x: x + w, y: y + rad },
    { x: x + w, y: y + h * 0.38 },
    { x: x + w, y: y + h * 0.72 },
    { x: x + w - rad, y: y + h },
    { x: x + rad, y: y + h },
    { x: x, y: y + h * 0.72 },
    { x: x, y: y + h * 0.38 },
    { x: x, y: y + rad },
  ];
}

/** Wide top, pointed foot — a shield, not an hourglass. */
function foldPts(r: CardRect): Pt[] {
  const { x, y, w, h } = r;
  const cx = x + w / 2;
  return [
    { x: cx - w * 0.1, y: y + 8 },
    { x: cx + w * 0.1, y: y + 8 },
    { x: x + w - w * 0.03, y: y + 10 },
    { x: x + w - w * 0.12, y: y + h * 0.34 },
    { x: cx + w * 0.16, y: y + h * 0.68 },
    { x: cx + 2.4, y: y + h + 18 },
    { x: cx - 2.4, y: y + h + 18 },
    { x: cx - w * 0.16, y: y + h * 0.68 },
    { x: x + w * 0.12, y: y + h * 0.34 },
    { x: x + w * 0.03, y: y + 10 },
  ];
}

function dartPts(box: DartBox): Pt[] {
  const { cx, top, bot, hw } = box;
  const h = Math.max(1, bot - top);
  const notch = h * 0.11;
  const wingY = top + h * 0.2;
  const stepY = top + h * 0.42;
  const stepW = hw * 0.36;
  const vW = Math.max(4, hw * 0.07);
  return [
    { x: cx - vW, y: top + notch },
    { x: cx + vW, y: top + notch },
    { x: cx + hw, y: top },
    { x: cx + hw, y: wingY },
    { x: cx + stepW, y: stepY },
    { x: cx + 1.2, y: bot },
    { x: cx - 1.2, y: bot },
    { x: cx - stepW, y: stepY },
    { x: cx - hw, y: wingY },
    { x: cx - hw, y: top },
  ];
}

function localDart(from: CardRect): DartBox {
  return {
    cx: from.x + from.w / 2,
    top: from.y + from.h * 0.06,
    bot: from.y + from.h + 56,
    hw: from.w * 0.38,
  };
}

export function dartBoxOf(u: number, from: CardRect, view: { w: number; h: number }): DartBox {
  const t = smooth(Math.max(0, (u - 0.28) / 0.72));
  const top = lerp(from.y, view.h * -0.08, t);
  const bot = lerp(from.y + from.h, view.h * 1.06, t);
  const h = Math.max(1, bot - top);
  return {
    cx: lerp(from.x + from.w / 2, view.w / 2, t),
    top,
    bot,
    hw: lerp(from.w / 2, Math.min(view.w * 0.64, h * 0.32), t),
  };
}

export function flowPoints(u: number, from: CardRect, box?: DartBox): Pt[] {
  const t = Math.max(0, Math.min(1, u));
  const card = cardPts(from);
  const fold = foldPts(from);
  const dart = dartPts(box ?? localDart(from));
  if (t <= 0.4) return mix(card, fold, smooth(t / 0.4));
  return mix(fold, dart, smooth((t - 0.4) / 0.6));
}

export function cornerRadius(u: number) {
  return lerp(22, 0, Math.max(0, Math.min(1, u * 1.2)));
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

function spine(pts: Pt[]) {
  return {
    top: mid(pts[0]!, pts[1]!),
    nose: mid(pts[5]!, pts[6]!),
  };
}

export function creaseOf(pts: Pt[]): string {
  const { top, nose } = spine(pts);
  return `M ${top.x} ${top.y} L ${nose.x} ${nose.y}`;
}

export function wingFolds(pts: Pt[]): [string, string] {
  const { top, nose } = spine(pts);
  const joint = { x: lerp(top.x, nose.x, 0.28), y: lerp(top.y, nose.y, 0.28) };
  return [
    `M ${pts[2]!.x} ${pts[2]!.y} L ${joint.x} ${joint.y}`,
    `M ${pts[9]!.x} ${pts[9]!.y} L ${joint.x} ${joint.y}`,
  ];
}

export function halfPath(pts: Pt[], side: "left" | "right"): string {
  const { top, nose } = spine(pts);
  const ring =
    side === "right"
      ? [top, pts[1]!, pts[2]!, pts[3]!, pts[4]!, pts[5]!, nose]
      : [top, pts[0]!, pts[9]!, pts[8]!, pts[7]!, pts[6]!, nose];
  return pointsToPath(ring, 0);
}
