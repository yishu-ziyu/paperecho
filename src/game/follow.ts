/** Direct-DOM follow. Pointer writes transform; React only hears about it on rAF / release. */

export function moveGhost(el: HTMLElement | null, x: number, y: number) {
  if (!el) return;
  el.style.transition = "none";
  el.style.opacity = "1";
  el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -120%)`;
}

export function hideGhost(el: HTMLElement | null) {
  if (!el) return;
  el.style.opacity = "0";
}

/** Land the ghost onto a well instead of vanishing — FLIP drop. */
export function landGhost(el: HTMLElement | null, well: HTMLElement | null) {
  if (!el) return;
  if (!well) {
    hideGhost(el);
    return;
  }
  const r = well.getBoundingClientRect();
  el.style.transition = "transform 280ms cubic-bezier(0.2, 0, 0, 1), opacity 220ms ease-out";
  el.style.transform = `translate3d(${r.left + r.width / 2}px, ${r.top + r.height / 2}px, 0) translate(-50%, -50%)`;
  window.setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "none";
  }, 280);
}

export function writePct(el: HTMLElement, x: number, y: number) {
  el.style.left = `${x}%`;
  el.style.top = `${y}%`;
}

export function rafThrottle(fn: () => void) {
  let id = 0;
  const run = () => {
    id = 0;
    fn();
  };
  return () => {
    if (id) return;
    id = requestAnimationFrame(run);
  };
}
