/** SVG dart nose points up. 0° = toward −Y (the window). */

export function headingToward(dx: number, dy: number, deadzone = 8): number {
  if (Math.hypot(dx, dy) < deadzone) return 0;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

export function clampHeading(deg: number, max = 48): number {
  return Math.max(-max, Math.min(max, deg));
}

export function rubberAxis(raw: number, limit: number, dim = 52, constant = 0.55): number {
  const sign = raw < 0 ? -1 : 1;
  const d = Math.abs(raw);
  if (d <= limit) return raw;
  const extra = d - limit;
  return sign * (limit + (extra * dim * constant) / (dim + constant * extra));
}
