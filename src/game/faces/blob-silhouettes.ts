import type { CursorSilhouette } from "../components/CursorAvatar";
import type { EmotionId } from "../types";

/**
 * Product silhouettes for the emotion ring.
 * Paths live in the 228-unit face box. Motion is inherited from CursorAvatar.
 */
function blob(
  name: string,
  d: string,
  anchor: { x: number; y: number; scale: number },
  shine: { cx: number; cy: number; rx: number; ry: number },
): CursorSilhouette {
  return {
    name,
    fit: "",
    body:
      `<path d="${d}" fill="{{GRADIENT}}"/>` +
      `<ellipse cx="${shine.cx}" cy="${shine.cy}" rx="${shine.rx}" ry="${shine.ry}" fill="#fff" opacity="0.22"/>`,
    clip: `<path d="${d}"/>`,
    anchor,
  };
}

/** Soft circle — still water. */
const CALM = blob(
  "calm",
  "M114.3 20C164 20 208 64 208 114.3C208 164.6 164 208.6 114.3 208.6C64.6 208.6 20.6 164.6 20.6 114.3C20.6 64 64.6 20 114.3 20Z",
  { x: 114, y: 104, scale: 0.56 },
  { cx: 86, cy: 78, rx: 30, ry: 16 },
);

/** Droopy pear — weight sits in the chest. */
const GLOOM = blob(
  "gloom",
  "M114 26C148 22 172 52 168 88C192 110 204 146 196 176C186 208 152 218 114 218C76 218 42 208 32 176C24 146 36 110 60 88C56 52 80 22 114 26Z",
  { x: 114, y: 96, scale: 0.5 },
  { cx: 92, cy: 70, rx: 24, ry: 15 },
);

/** Leaning teardrop — a cry that did not fall. */
const WRONGED = blob(
  "wronged",
  "M122 16C138 42 180 82 198 124C210 160 188 208 132 216C80 220 36 192 30 150C28 112 64 64 98 32C106 22 114 14 122 16Z",
  { x: 124, y: 118, scale: 0.5 },
  { cx: 110, cy: 86, rx: 24, ry: 16 },
);

/** Soft star — thoughts with too many points. */
const ANXIOUS = blob(
  "anxious",
  "M114 16C128 16 140 36 148 50C166 42 190 42 200 56C208 70 198 94 190 108C206 118 220 138 216 154C210 172 184 176 166 178C170 196 162 216 144 218C126 220 114 200 108 186C92 198 68 206 52 196C36 186 40 160 46 144C30 134 16 116 20 98C24 80 50 78 68 80C62 62 64 38 80 28C94 20 106 16 114 16Z",
  { x: 116, y: 108, scale: 0.46 },
  { cx: 90, cy: 74, rx: 20, ry: 13 },
);

/** Flattened capsule — battery on red. */
const TIRED = blob(
  "tired",
  "M114 56C180 52 216 80 218 116C216 152 178 182 114 184C50 182 12 152 10 116C12 80 48 52 114 56Z",
  { x: 114, y: 112, scale: 0.5 },
  { cx: 78, cy: 92, rx: 36, ry: 14 },
);

/** Tall thin oval — a room with one person in it. */
const LONELY = blob(
  "lonely",
  "M114 14C148 14 168 52 168 114C168 176 148 214 114 214C80 214 60 176 60 114C60 52 80 14 114 14Z",
  { x: 114, y: 100, scale: 0.46 },
  { cx: 96, cy: 64, rx: 18, ry: 22 },
);

/** Clenched pentagon — fire folded into a collar. */
const ANGER = blob(
  "anger",
  "M114 12C136 12 172 30 192 58C212 86 218 122 204 154C216 184 184 214 140 220C100 224 58 212 34 184C16 158 14 118 28 86C40 52 76 16 114 12Z",
  { x: 114, y: 104, scale: 0.52 },
  { cx: 88, cy: 70, rx: 26, ry: 16 },
);

/** Crescent with a bite — done, but no eyes stopped. */
const UNSEEN = blob(
  "unseen",
  "M132 18C180 28 214 72 212 122C208 172 168 214 116 216C74 216 36 186 28 146C70 170 128 160 150 118C164 84 150 46 106 38C112 26 120 18 132 18Z",
  { x: 142, y: 108, scale: 0.46 },
  { cx: 160, cy: 76, rx: 22, ry: 14 },
);

/** Dumpling — the player, a little life in the middle. */
const YOU = blob(
  "you",
  "M114.3 18C166 14 210 56 214 108C218 162 176 218 114.3 222C52.6 218 10.6 162 14.6 108C18.6 56 62.6 14 114.3 18Z",
  { x: 114, y: 102, scale: 0.54 },
  { cx: 84, cy: 76, rx: 32, ry: 17 },
);

export const BLOB_SILHOUETTES: Record<EmotionId | "you", CursorSilhouette> = {
  gloom: GLOOM,
  wronged: WRONGED,
  anxious: ANXIOUS,
  tired: TIRED,
  lonely: LONELY,
  anger: ANGER,
  calm: CALM,
  unseen: UNSEEN,
  you: YOU,
};
