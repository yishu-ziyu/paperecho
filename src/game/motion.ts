/**
 * Motion tokens for 纸飞机.
 *
 * Continuum rule (the whole game):
 *   Interface behavior is continuous. The hand never lets go of an object
 *   into a button. Card → desk → sheet → plane → letter is one craft
 *   (layoutId echo-craft). Phase chrome may crossfade; the craft morphs.
 *
 * Mapped from the connected Notion system — not invented:
 * - Apple HIG Motion / Dynamic Motion（持续行为，弹簧，动量投射）
 * - Material 3 Easing & Duration Specs
 * - UX in Motion Manifesto（12 原则里本关用到的 8 条）
 * - NN/g Role of Animation（反馈 / 状态 / 示能，克制）
 *
 * Two knobs for springs, per Apple Dynamic Motion:
 *   damping  — 1 = no overshoot, ~0.8 = gesture had momentum
 *   response — how fast it reaches the target (stiffness/mass)
 */

export const CHARGE_PX = 118;
export const MAX_PULL_PX = 168;
export const FIRE_THRESHOLD = 0.22;
export const FULL_THRESHOLD = 0.86;

/** iOS rubber-band: resistance grows as you pass the charge line. */
export function rubberY(raw: number, dim = 52, constant = 0.55) {
  const d = Math.max(0, raw);
  if (d <= CHARGE_PX) return d;
  const extra = d - CHARGE_PX;
  return CHARGE_PX + (extra * dim * constant) / (dim + constant * extra);
}

export function powerOf(pullY: number) {
  return Math.min(1, pullY / CHARGE_PX);
}

/** Volume-preserving squash. stretchY > 1 → thinner in X. */
export function squashX(stretchY: number) {
  return 1 / Math.max(0.72, stretchY);
}

export const spring = {
  /** 100% damping — click / settle / no leftover bounce. */
  settle: { type: "spring", stiffness: 280, damping: 34, mass: 0.85 } as const,
  /** ~80% damping — snap-back after a pull that had momentum. */
  snap: { type: "spring", stiffness: 380, damping: 22, mass: 0.7 } as const,
  /** Launch: keep incoming velocity, leave the screen. */
  launch: { type: "spring", stiffness: 78, damping: 16, mass: 0.58 } as const,
  /** Globe / HUD parenting — follows the plane, slightly delayed. */
  parent: { type: "spring", stiffness: 160, damping: 18, mass: 0.9 } as const,
  /** Charged tick / small UI. */
  tick: { type: "spring", stiffness: 520, damping: 28, mass: 0.45 } as const,
};

/** Material 3 cubic-beziers — for CSS / non-physics transitions. */
export const ease = {
  emphasized: [0.2, 0, 0, 1] as const,
  enter: [0.05, 0.7, 0.1, 1] as const,
  exit: [0.3, 0, 0.8, 0.15] as const,
  standard: [0.2, 0, 0, 1] as const,
};

export const dur = {
  enter: 0.4,
  exit: 0.2,
  emphasis: 0.5,
  short: 0.2,
};
