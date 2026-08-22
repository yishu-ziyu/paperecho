import { useEffect, useRef } from "react";

/**
 * Promise Wall 同款镜头：鼠标在画面里走，相机用 0.08 弹簧跟上，
 * lookAt 带一点 NDC 偏转。只动背景层，不抢情绪环的拖拽。
 *
 * zoom 0 = 原景（标题屏），1 = 推近 1.12。目标变化时在 rAF 里慢慢跟上，
 * 第二幕从第一幕的构图dolly进去，而不是切相立刻放大。
 */
export function useCameraSway(enabled: boolean, zoom = true) {
  const layerRef = useRef<HTMLDivElement>(null);
  const zoomGoal = useRef(zoom ? 1 : 0);
  const zoomAmt = useRef(zoom ? 1 : 0);
  zoomGoal.current = zoom ? 1 : 0;

  useEffect(() => {
    const el = layerRef.current;
    if (!el || !enabled) {
      if (el) {
        el.style.transform = "";
        el.style.top = el.style.right = el.style.bottom = el.style.left = "";
      }
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) {
      zoomAmt.current = zoomGoal.current;
      const z = zoomAmt.current;
      const bleed = z * 8;
      el.style.top = el.style.right = el.style.bottom = el.style.left = `${-bleed}%`;
      el.style.transform = z > 0.001 ? `scale(${1 + z * 0.12})` : "";
      return;
    }

    const target = { x: 0, y: 0, rx: 0, ry: 0 };
    const cam = { x: 0, y: 0, rx: 0, ry: 0 };
    let raf = 0;
    let live = true;

    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      target.x = nx * 14;
      target.y = ny * 10;
      target.ry = nx * 1.1;
      target.rx = -ny * 0.8;
    };

    const loop = () => {
      if (!live) return;
      cam.x += (target.x - cam.x) * 0.08;
      cam.y += (target.y - cam.y) * 0.08;
      cam.rx += (target.rx - cam.rx) * 0.08;
      cam.ry += (target.ry - cam.ry) * 0.08;
      zoomAmt.current += (zoomGoal.current - zoomAmt.current) * 0.045;
      const z = zoomAmt.current;
      const bleed = z * 8;
      const scale = 1 + z * 0.12;
      el.style.top = el.style.right = el.style.bottom = el.style.left = `${-bleed}%`;
      el.style.transform = `translate3d(${cam.x}px, ${cam.y}px, 0) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg) scale(${scale})`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      el.style.transform = "";
      el.style.top = el.style.right = el.style.bottom = el.style.left = "";
    };
  }, [enabled]);

  return layerRef;
}
