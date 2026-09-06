/**
 * 故事交换 v0.1 — 确定性落闸（echo-spec §5）。
 *
 * LLM 只按「这一句该说到哪一层」开口；解锁由本模块 + store 决定，绝不跳层。
 * 玩家可见文本禁止出现 L1/L2/L3。
 */

export type StoryDepth = 1 | 2 | 3;
export type SpeakMode = "full" | "half";

export interface ExchangeState {
  /** 影子故事已完全交出的层（开场即为 1）。 */
  unlocked: StoryDepth;
  /** 连续未交出新细节的轮数。 */
  silentTurns: number;
}

export interface ExchangeJudgment {
  new_detail: boolean;
  depth: StoryDepth;
}

export interface ExchangeAdvance {
  state: ExchangeState;
  /** 这一句影子该讲到的层。 */
  speak: StoryDepth;
  mode: SpeakMode;
  judgment: ExchangeJudgment;
}

/** seal 链两步各自允许的时间。游戏层放弃封信不得短于二者之和。 */
export const SEAL_REMEMBER_TIMEOUT_MS = 20_000;
export const SEAL_WRITE_TIMEOUT_MS = 25_000;
export const SEAL_CLIENT_TIMEOUT_MS = SEAL_REMEMBER_TIMEOUT_MS + SEAL_WRITE_TIMEOUT_MS;

const GENERIC =
  /^(我懂|我也是|我也一样|一样|嗯+|好的|是啊|对啊|谢谢|抱抱|没事|好吧|哦+|我知道|我没事|我还好)(了|的)?([。！？.\s]*)$/;
const ASK_THEM = /你(呢|怎么看|为什么|感觉怎么样|那边)/;
const FEELING_ONLY =
  /^我(觉得|感觉|真的|好)?(很难受|难受|难过|委屈|焦虑|好累|累|孤单|郁闷|生气|不开心|还好|没事|懂了|知道了)(一直.*)?$/;
const OBJECT =
  /灯|杯|车|门|窗|饭|手机|稿|图层|面包|地铁|冰箱|电视|客厅|指甲|原稿|清单|抽屉|外卖|天花板|便利贴|语音|群里|老板|消息|邮件|会议|闹钟|被子|钥匙|电梯|工位|同事|通知|已读|罚单|电脑|沙发|茶|截图|文件夹|票|店门口|聊天/;
const ACTION =
  /开着|坐了|洗了|划掉|掐|翻出来|点头|睡着|加班|预演|塞进|删了|回了|点名|没回|打开|关了|压着|翻了|看了|站了|扣过|凉了|没动|发给|骂了|放鸽子|睡不着/;
const TIME_PLACE =
  /[0-9一二三四五六七八九十半两]+(次|分钟|小时|天|周|遍|层)|凌晨|下班|楼下|桌上|今天|今晚|昨天|早上|夜里|刚才|路上|公司/;
const PASSIVE = /被.{1,12}了/;

export function initialExchange(): ExchangeState {
  return { unlocked: 1, silentTurns: 0 };
}

export function clampDepth(n: number): StoryDepth {
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return 2;
}

function tooClose(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 8 && y.length >= 8 && (x.includes(y) || y.includes(x))) return true;
  return false;
}

/** felt：人话短句。拒收情绪 id 串，校验失败返回旧值。 */
export function acceptFelt(raw: string | undefined, previous = ""): string {
  const t = raw?.trim() ?? "";
  if (!t) return previous;
  if (
    /^(?:anxious|tired|unseen|wronged|anger|lonely|gloom|calm)(?:\s*,\s*(?:anxious|tired|unseen|wronged|anger|lonely|gloom|calm))*$/i.test(
      t,
    )
  ) {
    return previous;
  }
  if (!/[\u4e00-\u9fff]/.test(t) && /,/.test(t)) return previous;
  if (t.length < 4) return previous;
  return t;
}

function feelingOnly(t: string): boolean {
  return FEELING_ONLY.test(t.replace(/[。！？.\s]/g, ""));
}

/**
 * 玩家这句是否算「新的、具体的、自己的真细节」。
 * 三要素缺一不可；缺了就不当作交换。
 */
export function isNewPersonalDetail(
  line: string,
  priorPlayer: string[],
  lastEcho = "",
): boolean {
  const t = line.trim();
  if (t.length < 8) return false;
  if (GENERIC.test(t)) return false;
  if (feelingOnly(t)) return false;
  if (ASK_THEM.test(t) && !/我/.test(t)) return false;
  if (priorPlayer.some((p) => tooClose(t, p))) return false;
  if (lastEcho && tooClose(t, lastEcho)) return false;
  const own = /我|咱/.test(t);
  const hasScene = OBJECT.test(t) || ACTION.test(t) || PASSIVE.test(t);
  const longComplete = t.length >= 12 && /[了着过]/.test(t);
  return own && (hasScene || longComplete);
}

export function advanceExchange(
  prev: ExchangeState,
  line: string,
  priorPlayer: string[],
  lastEcho = "",
): ExchangeAdvance {
  const new_detail = isNewPersonalDetail(line, priorPlayer, lastEcho);
  if (new_detail) {
    const unlocked = clampDepth(prev.unlocked + 1);
    return {
      state: { unlocked, silentTurns: 0 },
      speak: unlocked,
      mode: "full",
      judgment: { new_detail: true, depth: unlocked },
    };
  }

  const silentTurns = prev.silentTurns + 1;
  if (silentTurns >= 3 && prev.unlocked < 3) {
    const unlocked = clampDepth(prev.unlocked + 1);
    return {
      state: { unlocked, silentTurns: 0 },
      speak: unlocked,
      mode: "full",
      judgment: { new_detail: false, depth: prev.unlocked },
    };
  }
  if (silentTurns >= 2 && prev.unlocked < 3) {
    return {
      state: { unlocked: prev.unlocked, silentTurns },
      speak: clampDepth(prev.unlocked + 1),
      mode: "half",
      judgment: { new_detail: false, depth: prev.unlocked },
    };
  }
  return {
    state: { unlocked: prev.unlocked, silentTurns },
    speak: prev.unlocked,
    mode: "full",
    judgment: { new_detail: false, depth: prev.unlocked },
  };
}

export function fallbackReturnLetter(playerLine = ""): string {
  const t = playerLine.trim();
  return t ? `你那句「${t.slice(0, 16)}」我还留着。灯还开着。` : "灯还开着。你那句话我没扔。";
}

/** 兜底句按当前该讲的层取，不要永远用开场句。 */
export function lineForLayer(
  echo: { greeting?: string; replies?: string[] },
  speak: StoryDepth,
  mode: SpeakMode = "full",
): string {
  const raw = [echo.greeting, ...(echo.replies ?? [])]
    .map((l) => l?.trim() ?? "")
    .filter(Boolean);
  const uniq: string[] = [];
  for (const l of raw) {
    if (!uniq.includes(l)) uniq.push(l);
  }
  const layered =
    speak === 3 ? "后来我也就没再打开过。" : speak === 2 ? "那件事落在身上，我没跟人说。" : "我也有一件，后来就没再动。";
  const line = uniq[speak - 1] || uniq.at(-1) || layered;
  if (mode !== "half") return line;
  const cut = line.split(/[，,]/)[0]?.trim() ?? line;
  const body = cut.replace(/[。！？…]+$/, "");
  return body.length >= 4 ? `${body}…` : line;
}

/** 注入 prompt 的层指令。禁止模型把层号写给玩家。 */
export function exchangeCue(speak: StoryDepth, mode: SpeakMode): string {
  if (mode === "half") {
    return "这一句只露出下一层故事的半个开头（事刚起头就停），不要写完，不要写出层号。";
  }
  if (speak === 1) {
    return "这一句只讲发生了什么：一件有时间/地点/动作的具体事。不要写感受总结，不要写出层号。";
  }
  if (speak === 2) {
    return "这一句只讲那件事当时落在身上的感觉，仍要落到动作或物件，不要写出层号。";
  }
  return "这一句只讲那件事后来改了你什么（余波），仍要落到具体事，不要写出层号。";
}

export function parseExchange(raw: unknown): ExchangeState {
  const o = raw as { unlocked?: unknown; silentTurns?: unknown } | null;
  const unlocked = clampDepth(Number(o?.unlocked) || 1);
  const silentTurns = Math.max(0, Math.min(8, Number(o?.silentTurns) || 0));
  return { unlocked, silentTurns };
}

/**
 * 把模型输出收敛为一句可读的话：去工具调用残渣、并句、截长、补全悬挂引号。
 * 原住 chains.ts，被 pipeline/respond.ts 反向引用成环，移入本模块
 * （确定性落闸的家），运行时清洗只此一套。
 */
function closeHangingQuotes(s: string): string {
  const pairs: [string, string][] = [
    ["「", "」"],
    ["『", "』"],
    ["“", "”"],
  ];
  let out = s;
  for (const [open, close] of pairs) {
    const n = (out.split(open).length - 1) - (out.split(close).length - 1);
    if (n > 0) out += close.repeat(n);
  }
  if ((out.match(/"/g) ?? []).length % 2 === 1) out += '"';
  return out;
}

export function cleanOneLine(text: string, maxLen = 56): string {
  const cut = text
    .replace(/(?:^|\n)\s*(?:arrive|search_cases|search_archive|remember)\b[\s\S]*$/i, "")
    .trim();
  const lines = cut
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(arrive|search_cases|search_archive|remember)\b/i.test(l));
  const sentences = lines
    .join(" ")
    .split(/(?<=[。！？])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  let out = "";
  for (const s of sentences.slice(0, 2)) {
    if (out && (out + s).length > maxLen) break;
    out += s;
    if (out.length >= maxLen) break;
  }
  const raw = out || lines.slice(0, 1).join(" ").slice(0, maxLen);
  return closeHangingQuotes(raw);
}
