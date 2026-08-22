import { useEffect, useRef } from "react";

/**
 * Promise Wall 同款镜头：鼠标在画面里走，相机用 0.08 弹簧跟上，
 * lookAt 带一点 NDC 偏转。只动背景层，不抢情绪环的拖拽。
 */
export function useCameraSway(enabled: boolean) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = layerRef.current;
    if (!el || !enabled) {
      if (el) el.style.transform = "";
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) {
      el.style.transform = "";
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
      el.style.transform = `translate3d(${cam.x}px, ${cam.y}px, 0) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg) scale(1.12)`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      el.style.transform = "";
    };
  }, [enabled]);

  return layerRef;
}
