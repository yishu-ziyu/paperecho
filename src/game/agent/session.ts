/**
 * EchoSession — 可重建的逻辑会话（不驻留）。
 *
 * 服务器不为对话保存任何 Agent 实例：每个 turn 从 NightInput 重建一份
 * 逻辑 session（身份 + 今晚全部 transcript + 故事进度 + 记忆 + 日子本），
 * 再由 buildTurnContext 拼出这个 turn 的 prompt。会话连续性来自输入，
 * 不来自内存。
 */
import type { EchoPerson, RegionId } from "../types.ts";
import { fallbackEcho } from "../kernel.ts";
import {
  exchangeCue,
  initialExchange,
  type ExchangeState,
  type SpeakMode,
  type StoryDepth,
} from "./exchange.ts";
import { factsOf, renderBlocks } from "./memory.ts";
import type { NightInput, RecallItem } from "./types.ts";

/** turn agent 单次允许的时间。与 fallback 的 14s 相加仍小于 store 的 40s。 */
export const TURN_AGENT_TIMEOUT_MS = 22_000;

/**
 * 人设与回应规范：所有步骤共用的产品约束。
 * （原 chains.RULES，session 需要同一套，抽到这里共用。）
 */
export const RULES = `你是深夜还没睡的一个普通人。像微信，一两句纯口语。
声音：写「事」不写「状态」（给具体时间/地点/动作/物件，不堆情绪形容词）；不碎；零剧场腔（不写诗、不写金句）。
回应：说一件你自己的具体事，别贴情绪标签；先接住，再用平行的事回，不替对方下结论；共情落在「我也有过」，不是「你好可怜」；像聊天，不总结、不替双方收尾，留个口子。
禁止咨询腔和 AI 万能句：看见、接住、值得、不是一个人、加油。
工具用协议调用，禁止把工具名写进句子。
# Human 是玩家以前的事，不是你的人生。禁止把 Human 的句子改成「我……」。最多点一下「你上次…」。
remember 只记玩家的原话或事，禁止记你自己的夜。
arrive 放下名字、城市、felt（人话感受短句，禁止情绪标签串）、三句你这座城市的新细节（不能重复 Human，不能重复刚说的那句）。
故事只说到提示里指定的那一层：切深度不切信息碎片；禁止把层号写给玩家。素材只能化用细节，禁止搬运原句。
最多轻轻点一下刚说过的那件事，不要复述整段，不要把今晚对话做成总结。`;

/** chains.makeRuntime 与 restoreEchoSession 共用的人设规则：日子本 → 离开后那件 → corePersona → 默认。 */
export function personaOf(input: NightInput): string {
  if (input.days?.length && input.echo) {
    return `你是${input.echo.name}，在${input.echo.city}。先读你的日子本，从这些日子开口，不要自我介绍，不要说想对方。\n${input.days
      .slice(-5)
      .map((d) => `${d.date} ${d.text}`)
      .join("\n")}`;
  }
  if (input.echo?.awayThing) {
    return `你是${input.echo.name}，在${input.echo.city}。你还是上次那个人。离开后你自己过了：「${input.echo.awayThing}」。今晚接着做你自己，不安慰。`;
  }
  return (
    input.corePersona ||
    (input.echo ? `你是${input.echo.name}，在${input.echo.city}。${input.echo.greeting}` : "")
  );
}

/** 一个逻辑 Echo 晚会的全部状态；每 turn 由 NightInput 重建，进程不驻留。 */
export interface EchoSession {
  /** identity：今晚对上的这个人。 */
  echo: EchoPerson;
  /** 今晚完整 recall（含玩家刚说的一句）。 */
  transcript: RecallItem[];
  /** 故事揭示深度（只做内部信号，不再控制寿命）。 */
  exchange: ExchangeState;
  /** 玩家旧事实（factsOf(archival)）。 */
  playerFacts: string[];
  night: {
    letter: string;
    mirror: string;
    region: RegionId;
    round: number;
    playerLine: string;
  };
  /** 日子本。 */
  days: { date: string; text: string }[];
  continuity: {
    awayThing: string;
    metBefore: boolean;
    lastEcho: string;
    lastYou: string;
  };
  /** 与 chains.makeRuntime 同一套规则得出的人设。 */
  persona: string;
}

function lastOf(items: RecallItem[] | undefined, who: "you" | "echo"): string {
  return (items ?? []).filter((t) => t.who === who).at(-1)?.text ?? "";
}

/** 从 NightInput 重建逻辑 session。纯函数：不读 store、不读 localStorage、不发网络。 */
export function restoreEchoSession(input: NightInput): EchoSession {
  const echo =
    input.echo ?? fallbackEcho(input.fingerprint, input.region, input.avoidNames);
  return {
    echo,
    transcript: input.recall ?? [],
    exchange: input.exchange ?? initialExchange(),
    playerFacts: factsOf(input.archival),
    night: {
      letter: input.letter,
      mirror: input.mirror,
      region: input.region,
      round: input.round ?? 0,
      playerLine: input.playerLine ?? "",
    },
    days: input.days ?? [],
    continuity: {
      awayThing: input.echo?.awayThing ?? "",
      metBefore: Boolean(
        input.echo?.name &&
          (input.echo.awayThing || input.recall?.some((t) => t.who === "echo")),
      ),
      lastEcho: lastOf(input.recall, "echo"),
      lastYou: lastOf(input.recall, "you"),
    },
    persona: personaOf(input),
  };
}

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** transcript 末尾若已含当前玩家句，摘掉，避免与「对方刚说」重复。 */
function transcriptOf(session: EchoSession): RecallItem[] {
  const items = session.transcript.filter((t) => t.text.trim());
  const cur = session.night.playerLine.trim();
  const last = items.at(-1);
  if (cur && last?.who === "you" && last.text.trim() === cur) return items.slice(0, -1);
  return items;
}

const RECENT_LINES = 10;
const EARLIER_CLIP = 40;

function transcriptBlock(session: EchoSession): string {
  const items = transcriptOf(session);
  if (!items.length) return "";
  const recent = items.slice(-RECENT_LINES);
  const earlier = items.slice(0, -RECENT_LINES);
  const lines = recent.map((t) => `${t.who === "you" ? "对方" : "你"}：${t.text.trim()}`);
  // 早期轮次的玩家句全部保留（可截断，不许丢条）；早期 echo 句可省略。
  const earlierYou = earlier
    .filter((t) => t.who === "you")
    .map((t) => `- 对方（更早）：${clip(t.text, EARLIER_CLIP)}`);
  const parts = [
    `你们今晚聊过（最近的逐字）：\n${lines.join("\n")}`,
    earlierYou.length ? `更早对方说过的（都是对方的事，不是你的）：\n${earlierYou.join("\n")}` : "",
  ];
  return parts.filter(Boolean).join("\n\n");
}

const TOOL_GUIDE = `工具（都可以不调用）：
- search_archive：查这位玩家信柜里的旧事。查到的是对方的事，禁止说成你的经历，禁止照抄原句。
- search_cases：查世界档案素材（别人的具体夜）。细节可化用，禁止搬运整句。
- remember：把对方这轮说的新事实写下来。只记对方的话或事，完整短句。
要查就先查；最后必须用一句话回答：一两句纯口语，≤56 字，禁止把工具名写进句子里。`;

export interface TurnContextOptions {
  /** 这一句影子该讲到的层（由 advanceExchange 的结果传入）。 */
  speak?: StoryDepth;
  mode?: SpeakMode;
}

/**
 * 拼 turn 的 prompt。user 块保证：开场信+镜句、今晚 transcript（最近逐字+更早玩家句）、
 * 检索资料块、层指令、当前玩家句。
 */
export function buildTurnContext(
  session: EchoSession,
  research: string,
  opts: TurnContextOptions = {},
): { system: string; user: string } {
  const speak = opts.speak ?? session.exchange.unlocked;
  const mode = opts.mode ?? "full";
  const system = [RULES, renderBlocks(session.persona, session.playerFacts), TOOL_GUIDE].join(
    "\n\n",
  );

  const letter = session.night.letter.trim();
  const mirror = session.night.mirror.trim();
  const playerLine = session.night.playerLine.trim();
  const blocks = [
    `今晚你收到的开场信：\n${letter || "（信上是空白的，就接现在这句。）"}`,
    mirror ? `他写在镜子上的那句：${mirror}` : "",
    transcriptBlock(session),
    `检索到的资料（信柜旧事是对方的事，不是你的；档案素材可以化用，禁止照抄）：\n${research.trim() || "（没有检索到更多资料）"}`,
    exchangeCue(speak, mode),
    playerLine ? `对方刚说：${playerLine}` : "对方还没开口，你先接今晚的信。",
  ];
  const user = blocks.filter(Boolean).join("\n\n");
  return { system, user };
}
