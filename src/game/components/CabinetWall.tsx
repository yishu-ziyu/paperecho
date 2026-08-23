import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import type { CabinetNote } from "../cabinet";
import type { Journey } from "../types";

type WallHandle = {
  destroy: () => void;
  selectById: (id: string | null, opts?: { moveCamera?: boolean }) => void;
};

export function CabinetWall({
  notes,
  selectedKey,
  pinFresh,
  onOpen,
  onVacant,
}: {
  notes: CabinetNote[];
  selectedKey?: string | null;
  pinFresh?: boolean;
  onOpen: (journey: Journey) => void;
  onVacant?: () => void;
}) {
  const reduce = useReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<WallHandle | null>(null);
  const onOpenRef = useRef(onOpen);
  const onVacantRef = useRef(onVacant);
  const pinFreshRef = useRef(pinFresh ? selectedKey : null);
  onOpenRef.current = onOpen;
  onVacantRef.current = onVacant;
  const noteKey = notes.map((n) => n.id).join("|");

  useEffect(() => {
    pinFreshRef.current = pinFresh ? selectedKey : null;
  }, [pinFresh, selectedKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let cancelled = false;
    let handle: WallHandle | null = null;
    void import("../vendor/promise-wall.js").then(({ mountPromiseWall }) => {
      if (cancelled || !canvas.isConnected) return;
      handle = mountPromiseWall(canvas, {
        host,
        notes,
        selectedId: selectedKey ?? null,
        pinFreshId: pinFreshRef.current,
        reducedMotion: reduce,
        onSelect: (note) => {
          if (note.journey) onOpenRef.current(note.journey);
        },
        onVacant: () => onVacantRef.current?.(),
      });
      apiRef.current = handle;
    });
    return () => {
      cancelled = true;
      handle?.destroy();
      apiRef.current = null;
    };
    // notes identity is noteKey; selectedKey is applied after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKey, reduce]);

  useEffect(() => {
    apiRef.current?.selectById(selectedKey ?? null);
  }, [selectedKey]);

  return (
    <div ref={hostRef} className="promise-wall-host" data-cabinet="wall">
      <canvas ref={canvasRef} className="promise-wall-scene" />
    </div>
  );
}
