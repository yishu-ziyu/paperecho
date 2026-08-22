import type { Emotion, EmotionId, Fingerprint, TokenPos } from "./types";
import { CENTER, MAX_RADIUS, MIN_RADIUS } from "./types";

export const EMOTIONS: Emotion[] = [
  {
    id: "gloom",
    label: "郁闷",
    hint: "胸口像压着一层湿空气",
    color: "#5B7C99",
    ink: "#F4EFE6",
    shape: "square",
    face: { eyes: "downcast", mouth: "flat" },
    mirrors: [
      "我好像一直在往前走，可谁也没有回头看我一眼。",
      "不是大哭的那种难受，是说不出口、也卸不下来。",
    ],
    chips: ["群里只回了收到", "改到很晚", "稿还在文件夹里"],
    replies: [
      "我那周也是。群里回了个收到。",
      "我后来把截图发给自己了。挺傻。",
      "你那稿还留着吗。",
    ],
  },
  {
    id: "wronged",
    label: "委屈",
    hint: "明明很用力，却像在自说自话",
    color: "#C47A7A",
    ink: "#F4EFE6",
    shape: "circle",
    face: { eyes: "round", mouth: "frown" },
    mirrors: [
      "我把最好的那面都给出去了，换来的是一句还好。",
      "我想解释，可一开口就觉得自己很小气。",
    ],
    chips: ["换来一句还好", "我认真来着", "牙关是咬着的"],
    replies: [
      "我那天也笑了。牙也咬着。",
      "我回家把那句还好删了。",
      "你当时回了什么。",
    ],
  },
  {
    id: "anxious",
    label: "焦虑",
    hint: "念头跑得比呼吸快",
    color: "#D0894B",
    ink: "#243044",
    shape: "diamond",
    face: { eyes: "round", mouth: "wave", blink: true },
    mirrors: [
      "我在预演还没发生的失败，已经失败了好几轮。",
      "想停下来，手却停不下来。",
    ],
    chips: ["预演了好几遍", "清单还在闪", "睡不着"],
    replies: [
      "我三点还在改那份清单。",
      "预演到第四遍我关灯了。还是没睡。",
      "你清单上第一条是什么。",
    ],
  },
  {
    id: "tired",
    label: "疲惫",
    hint: "连把句子说完整都费力",
    color: "#7A8F6A",
    ink: "#F4EFE6",
    shape: "pill",
    face: { eyes: "half", mouth: "open" },
    mirrors: [
      "不是想放弃，是电池已经闪红灯。",
      "我还在运转，可里面的人已经坐在地上了。",
    ],
    chips: ["今天够了", "还在撑", "话没说完"],
    replies: [
      "我倒在沙发上还握着手机。",
      "风扇声我听到现在。",
      "你最后一句说完了没。",
    ],
  },
  {
    id: "lonely",
    label: "孤单",
    hint: "房间很满，人却不在",
    color: "#6B5B7A",
    ink: "#F4EFE6",
    shape: "circle",
    face: { eyes: "side", mouth: "none" },
    mirrors: [
      "灯开着。房间里的声音都是我自己的。",
      "我把对话框打开又划掉。最后还是一个人看天花板。",
    ],
    chips: ["灯还开着", "对话框打开又划掉", "只有风扇声"],
    replies: [
      "我窗开着。也没人进来。",
      "我把那条删了三次。第三次是真的。",
      "你灯还开着吗。",
    ],
  },
  {
    id: "anger",
    label: "愤怒",
    hint: "火在衣领里，脸上还要正常",
    color: "#C45C4A",
    ink: "#F4EFE6",
    shape: "square",
    face: { eyes: "brow", mouth: "bite" },
    mirrors: [
      "我把怒气折进衣领里，假装那只是天气。",
      "他们说我太敏感。牙关是热的。",
    ],
    chips: ["这不公平", "火还在", "他们说我太敏感"],
    replies: [
      "火我折进衣领了。还是热。",
      "他们说敏感。我在坡上站了一会儿。",
      "你后来回了没。",
    ],
  },
  {
    id: "calm",
    label: "平静",
    hint: "水面很平，底下还有一句",
    color: "#7A9AA8",
    ink: "#243044",
    shape: "pill",
    face: { eyes: "closed", mouth: "smile" },
    mirrors: [
      "我还好。还好里面有一块想被轻轻说出来的地方。",
      "雨停了。我还坐着。",
    ],
    chips: ["我还好", "雨停了", "先坐一会儿"],
    replies: [
      "还好。我把这两个字打出来又删了。",
      "雨停了。我还坐着。",
      "你还好里面是什么。",
    ],
  },
  {
    id: "unseen",
    label: "想被看见",
    hint: "做完了，可没有一双眼睛停下来",
    color: "#C9A46A",
    ink: "#243044",
    shape: "diamond",
    face: { eyes: "wide", mouth: "open" },
    mirrors: [
      "我改到凌晨的那几页，没有人记得。",
      "已读。可那句认真的还停在那里。",
    ],
    chips: ["已读没回", "那几页还在", "想被看一眼"],
    replies: [
      "那几页叫 appendix_v7。我没提。",
      "已读。我把手机扣过去了。",
      "你那句认真的还在吗。",
    ],
  },
];

export const EMOTION_MAP = Object.fromEntries(EMOTIONS.map((e) => [e.id, e])) as Record<EmotionId, Emotion>;

export function clampToRing(x: number, y: number, id: EmotionId): TokenPos {
  const dx0 = x - CENTER.x;
  const dy0 = y - CENTER.y;
  let d = Math.hypot(dx0, dy0);
  const nx = d < 0.01 ? 0 : dx0 / d;
  const ny = d < 0.01 ? 1 : dy0 / d;
  if (d < 0.01) d = MIN_RADIUS;
  d = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, d));
  let px = CENTER.x + nx * d;
  let py = CENTER.y + ny * d;
  px = Math.max(10, Math.min(90, px));
  py = Math.max(8, Math.min(92, py));
  const dx = px - CENTER.x;
  const dy = py - CENTER.y;
  d = Math.hypot(dx, dy);
  if (d < MIN_RADIUS) {
    const s = MIN_RADIUS / Math.max(d, 0.01);
    return { id, x: CENTER.x + dx * s, y: CENTER.y + dy * s };
  }
  if (d > MAX_RADIUS) {
    const s = MAX_RADIUS / d;
    return { id, x: CENTER.x + dx * s, y: CENTER.y + dy * s };
  }
  return { id, x: px, y: py };
}

export function seedTokens(): TokenPos[] {
  const r = 40;
  return EMOTIONS.map((e, i) => {
    const a = (Math.PI * 2 * i) / EMOTIONS.length - Math.PI / 2;
    return clampToRing(CENTER.x + Math.cos(a) * r, CENTER.y + Math.sin(a) * r, e.id);
  });
}

export function untangle(tokens: TokenPos[]): TokenPos[] {
  const next = tokens.map((t) => ({ ...t }));
  for (let k = 0; k < 5; k++) {
    for (let i = 0; i < next.length; i++) {
      for (let j = i + 1; j < next.length; j++) {
        const a = next[i]!;
        const b = next[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= 22 || d < 0.01) continue;
        const push = (22 - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
  return next.map((t) => clampToRing(t.x, t.y, t.id));
}

export function closenessOf(token: TokenPos): number {
  const dx = token.x - CENTER.x;
  const dy = token.y - CENTER.y;
  const d = Math.hypot(dx, dy);
  const span = MAX_RADIUS - MIN_RADIUS;
  return Math.max(0, Math.min(1, 1 - (d - MIN_RADIUS) / span));
}

export function fingerprintOf(tokens: TokenPos[]): Fingerprint[] {
  return tokens
    .map((t) => ({ id: t.id, closeness: closenessOf(t) }))
    .sort((a, b) => b.closeness - a.closeness);
}

export function nearOf(fp: Fingerprint[], min = 0.42): Fingerprint[] {
  return fp.filter((f) => f.closeness >= min);
}

export function ownedOf(fp: Fingerprint[], min = 0.42): Fingerprint[] {
  const owned = nearOf(fp, min);
  return owned.length ? owned : fp.slice(0, 1);
}

export function mixBlobColor(fp: Fingerprint[]): string {
  const top = ownedOf(fp, 0.35).slice(0, 2);
  if (!top.length) return "#C9B8A4";
  return EMOTION_MAP[top[0]!.id].color;
}

export function chipPool(fp: Fingerprint[]): string[] {
  const owned = ownedOf(fp, 0.3);
  const chips: string[] = [];
  for (const f of owned.slice(0, 3)) chips.push(...EMOTION_MAP[f.id].chips);
  chips.push("我电脑里也有一堆没人看的");
  return [...new Set(chips)].slice(0, 9);
}

export function replyPool(fp: Fingerprint[]): string[] {
  const owned = ownedOf(fp, 0.3);
  const replies: string[] = [];
  for (const f of owned.slice(0, 3)) replies.push(...EMOTION_MAP[f.id].replies);
  return [...new Set(replies)].slice(0, 6);
}

export function playerHand(
  fp: Fingerprint[],
  chips: string[],
  used: Iterable<string>,
): string[] {
  const banned = new Set([...used].filter(Boolean));
  return [...replyPool(fp), ...chips]
    .filter((s, i, arr) => s && !banned.has(s) && !/^你/.test(s) && arr.indexOf(s) === i)
    .slice(0, 3);
}
