/**
 * Paper Echo — 产品业务层（Prompt Chaining · 提示词链）
 *
 * 参考：Agentic Design Patterns · Chapter 1: Prompt Chaining
 * https://adp.xindoo.xyz/chapters/Chapter%201_%20Prompt%20Chaining/
 *
 * 产品里的三个业务动作被拆成明确的小步骤，每步只做一件事：
 *
 *   match: research（世界档案影子）→ respond（大模型用素材开口）
 *   turn:  research（库）→ respond（大模型用素材接一句）
 *   seal:  research -> rememberFacts -> writeReturnLetter -> validate
 *
 * 开口走 pipeline/respond.ts（已训练的说话规范），不走故事卡金句。
 * 短命 Pi Agent 仍用于 seal 的工具步。
 */
import { Agent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type, createModels } from "@earendil-works/pi-ai";
import { fallbackEcho } from "../kernel.ts";
import type { EchoPerson, TokenMeter } from "../types.ts";
import { AGENT_MODEL, llmApiKey, llmProvider, LLM_CONFIG } from "./config.ts";
import { emptyMeter, hasApiKey } from "./llm.ts";
import { factsOf, isCompleteFact, ownLine, perceptionOf, renderBlocks, stolenVoice } from "./memory.ts";
import type { EchoShadow } from "./pipeline/persona.ts";
import { blobOfShadow, gatherShadow, runAgentTool, type ToolCtx } from "./tools.ts";
import { acceptFelt, advanceExchange, initialExchange, type SpeakMode, type StoryDepth } from "./exchange.ts";
import type { ExchangeState } from "./exchange.ts";
import type { NightInput, NightResult, RecallItem } from "./types.ts";

/** 人设与回应规范：所有步骤共用的产品约束。 */
const RULES = `你是深夜还没睡的一个普通人。像微信，一两句纯口语。
声音：写「事」不写「状态」（给具体时间/地点/动作/物件，不堆情绪形容词）；不碎；零剧场腔（不写诗、不写金句）。
回应：说一件你自己的具体事，别贴情绪标签；先接住，再用平行的事回，不替对方下结论；共情落在「我也有过」，不是「你好可怜」；像聊天，不总结、不替双方收尾，留个口子。
禁止咨询腔和 AI 万能句：看见、接住、值得、不是一个人、加油。
工具用协议调用，禁止把工具名写进句子。
# Human 是玩家以前的事，不是你的人生。禁止把 Human 的句子改成「我……」。最多点一下「你上次…」。
remember 只记玩家的原话或事，禁止记你自己的夜。
arrive 放下名字、城市、felt（人话感受短句，禁止情绪标签串）、三句你这座城市的新细节（不能重复 Human，不能重复刚说的那句）。
故事只说到提示里指定的那一层：切深度不切信息碎片；禁止把层号写给玩家。素材只能化用细节，禁止搬运原句。
最多轻轻点一下刚说过的那件事，不要复述整段，不要把今晚对话做成总结。`;

let models: ReturnType<typeof createModels> | null = null;

function getModels() {
  if (!models) {
    models = createModels();
    models.setProvider(llmProvider());
  }
  return models;
}

/** 取 Agent 最后一段 assistant 正文。 */
function lastAssistantText(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown };
    if (m?.role !== "assistant" || !Array.isArray(m.content)) continue;
    const text = m.content
      .filter(
        (c): c is { type: "text"; text: string } =>
          !!c && typeof c === "object" && (c as { type?: string }).type === "text",
      )
      .map((c) => c.text)
      .join("")
      .trim();
    if (text) return text;
  }
  return "";
}

/**
 * 把模型输出收敛为一句可读的话。
 * （导出供 pipeline/respond.ts 复用，运行时清洗只此一套。）
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

/** 素材开口留下。不因「杭州」等外地词打回故事卡。 */
export function keepSpoken(
  raw: string,
  fallback: string,
  archival: import("../types.ts").MemoryRecord[],
  used?: string | string[],
): string {
  const line = ownLine(cleanOneLine(raw), [fallback], archival, used);
  return (line && line.trim()) || fallback;
}

function meterOf(messages: AgentMessage[], node: string): TokenMeter {
  let prompt = 0;
  let completion = 0;
  for (const raw of messages) {
    const m = raw as {
      role?: string;
      usage?: { input?: number; output?: number; totalTokens?: number };
      model?: string;
    };
    if (m.role !== "assistant" || !m.usage) continue;
    prompt += m.usage.input ?? 0;
    completion += m.usage.output ?? 0;
  }
  return {
    prompt,
    completion,
    total: prompt + completion,
    model: AGENT_MODEL.id,
    via: "live",
    node,
  };
}

/** 短命 Pi Agent：执行一个步骤。 */
async function step(
  name: string,
  system: string,
  user: string,
  tools: AgentTool[],
  maxTurns: number,
  timeoutMs = LLM_CONFIG.timeoutMs,
) {
  let turns = 0;
  const agent = new Agent({
    initialState: {
      systemPrompt: system,
      model: AGENT_MODEL,
      thinkingLevel: "off",
      tools,
    },
    streamFn: getModels().streamSimple.bind(getModels()),
    getApiKey: async () => llmApiKey(),
    shouldStopAfterTurn: async (ctx) => {
      turns += 1;
      return ctx.toolResults.length === 0 || turns >= maxTurns;
    },
  });

  try {
    await Promise.race([
      agent.prompt(user),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${name} timeout`)), timeoutMs),
      ),
    ]);
  } catch {
    // 超时/错误按空结果处理，由上层决定 fallback
  }

  return {
    text: lastAssistantText(agent.state.messages as AgentMessage[]),
    messages: agent.state.messages as unknown[],
    meter: meterOf(agent.state.messages as AgentMessage[], name),
    turns,
  };
}

interface ChainRuntime {
  input: NightInput;
  local: EchoPerson;
  perception: string;
  live: { persona: string; facts: string[] };
  ctx: ToolCtx;
  hits: string[];
  draft: { name: string; city: string; felt: string; lines: string[] };
  shadow: EchoShadow | null;
}

function makeRuntime(input: NightInput): ChainRuntime {
  const local = input.echo ?? fallbackEcho(input.fingerprint, input.region);
  const perception = perceptionOf(
    input.fingerprint,
    input.letter,
    input.mirror,
    input.region,
    input.playerPersona ?? "",
  );
  const live = {
    persona:
      input.corePersona ||
      (input.echo ? `你是${input.echo.name}，在${input.echo.city}。${input.echo.greeting}` : ""),
    facts: factsOf(input.archival),
  };
  const ctx: ToolCtx = {
    archival: input.archival,
    fingerprint: input.fingerprint,
    region: input.region,
    remembered: [],
    playerTexts: [
      input.letter,
      input.mirror,
      input.playerLine ?? "",
      ...(input.recall ?? []).filter((t) => t.who === "you").map((t) => t.text),
    ].filter((t) => t.trim().length >= 4),
    story: input.mirror,
    persona: input.playerPersona ?? "",
  };
  return {
    input,
    local,
    perception,
    live,
    ctx,
    hits: [],
    draft: {
      name: input.echo?.name ?? local.name,
      city: input.echo?.city ?? local.city,
      felt: input.echo?.felt ?? local.felt,
      lines: [],
    },
    shadow: null,
  };
}

async function speakFromMaterials(
  rt: ChainRuntime,
  userLine: string,
  history: RecallItem[] | undefined,
  fallback: string,
  timeoutMs: number,
  speak: StoryDepth = 1,
  mode: SpeakMode = "full",
): Promise<{ text: string; via: TokenMeter["via"] }> {
  const shadow = rt.shadow;
  if (!shadow?.materials.length) {
    return { text: fallback, via: "archive" };
  }
  const { respond } = await import("./pipeline/respond.ts");
  const out = await respond({
    shadow,
    userLine: userLine.trim() || rt.input.letter,
    history: (history ?? []).map((t) => ({ who: t.who, text: t.text })),
    timeoutMs,
    speak,
    mode,
  });
  return {
    text: keepSpoken(out.reply, fallback, rt.input.archival, [
      userLine,
      rt.input.letter,
      rt.input.mirror,
    ]),
    via: out.via === "live" ? "live" : "archive",
  };
}

function makeRememberTool(rt: ChainRuntime): AgentTool {
  return {
    name: "remember",
    label: "写下",
    description: "把一条关于玩家的具体事实写进 Human。必须是对方的事或原话，完整短句，不要半截、不要开着的引号，不要记你自己的夜。",
    parameters: Type.Object({ fact: Type.String() }),
    execute: async (_id, params) => {
      const out = runAgentTool("remember", params as Record<string, unknown>, rt.ctx);
      const fact = String((params as { fact: string }).fact ?? "").trim();
      if (isCompleteFact(fact) && !rt.live.facts.includes(fact)) {
        rt.live.facts = [fact, ...rt.live.facts].slice(0, 10);
      }
      return { content: [{ type: "text", text: out }], details: { fact } };
    },
  };
}

function recallWithoutCurrent(recall: RecallItem[] | undefined, playerLine?: string): RecallItem[] {
  const items = recall ?? [];
  const last = items.at(-1);
  if (last?.who === "you" && playerLine && last.text === playerLine) return items.slice(0, -1);
  return items;
}

/** 研究步骤：库优先；match 短超时并入 live。不调用对话 LLM。 */
async function researchStep(kind: "match" | "turn" | "seal", rt: ChainRuntime): Promise<string> {
  const notes: string[] = [];
  const earlier = recallWithoutCurrent(rt.input.recall, rt.input.playerLine)
    .slice(-2)
    .map((t) => t.text);
  const query =
    [rt.input.letter, rt.input.mirror, rt.input.playerLine, ...earlier].filter(Boolean).join(" ") ||
    "今夜";

  if (kind === "match" || kind === "turn") {
    rt.shadow = await gatherShadow(rt.ctx, kind === "match");
    const blob = blobOfShadow(rt.shadow);
    rt.hits.push(blob);
    notes.push(`【世界档案里的相似的人】\n${blob}`);
  }

  if (rt.input.archival.length > 0) {
    const archive = runAgentTool("search_archive", { query }, rt.ctx);
    rt.hits.push(archive);
    notes.push(`【玩家信柜里的旧事】\n${archive}`);
  }

  return notes.join("\n\n") || "（没有检索到更多资料）";
}

function coreBlocks(rt: ChainRuntime): string {
  return renderBlocks(rt.live.persona, rt.live.facts);
}

function fallbackFor(kind: "match" | "turn" | "seal", rt: ChainRuntime): NightResult {
  const echo = rt.input.echo ?? rt.local;
  const persona = rt.live.persona || `你是${echo.name}，在${echo.city}。`;
  return {
    echo,
    spoken: kind === "seal" ? echo.returnLetter : echo.greeting,
    suggestions: [],
    facts: rt.live.facts.slice(0, 2),
    hits: [],
    session: rt.input.session ?? [],
    persona,
    human: rt.live.facts.join("\n"),
    meter: emptyMeter(kind),
    exchange: rt.input.exchange ?? initialExchange(),
    speak: 1,
    speakMode: "full",
  };
}

/** match 链：投掷纸飞机 → 找到/创建今晚的「对方」。 */
async function runMatchChain(input: NightInput): Promise<NightResult> {
  const rt = makeRuntime(input);
  const opened: ExchangeState = initialExchange();

  await researchStep("match", rt);
  const spokenRes = await speakFromMaterials(
    rt,
    input.letter || input.mirror,
    undefined,
    "十七稿我打成一包，塞进抽屉最下层。",
    14000,
    1,
    "full",
  );
  const spoken = spokenRes.text;
  const via = spokenRes.via;
  const felt = rt.local.felt === rt.local.greeting ? "" : acceptFelt(rt.local.felt, "");

  const builtEcho: EchoPerson = {
    name: rt.draft.name,
    city: rt.draft.city,
    felt,
    greeting: spoken,
    replies: [spoken, ...rt.local.replies]
      .filter((l, i, arr) => l && !stolenVoice(l, input.archival) && arr.indexOf(l) === i)
      .slice(0, 4),
    returnLetter: rt.local.returnLetter,
    source: via,
  };

  return {
    echo: builtEcho,
    spoken,
    suggestions: [],
    facts: rt.ctx.remembered.filter((f) => isCompleteFact(f) && !/玩家靠近|今晚靠近/.test(f)),
    hits: rt.hits.slice(-4),
    session: [
      ...(input.session ?? []),
      { chain: "match", steps: ["research", "respond"] },
    ],
    persona: rt.live.persona || `你是${builtEcho.name}，在${builtEcho.city}。`,
    human: rt.live.facts.join("\n"),
    meter: {
      ...emptyMeter("match", via),
      model: via === "live" ? AGENT_MODEL.id : "archive",
    },
    exchange: opened,
    speak: 1,
    speakMode: "full",
  };
}

/** turn 链：玩家回复后，对方回一句话。 */
async function runTurnChain(input: NightInput): Promise<NightResult> {
  const rt = makeRuntime(input);
  // store.reply 会先把当前句推进 recall。交换闸只看「此前」的玩家句，否则自己跟自己撞上，永远升不了层。
  const priorPlayer = recallWithoutCurrent(input.recall, input.playerLine)
    .filter((t) => t.who === "you")
    .map((t) => t.text);
  const lastEcho = (input.recall ?? []).filter((t) => t.who === "echo").at(-1)?.text ?? "";
  const stepEx = advanceExchange(
    input.exchange ?? initialExchange(),
    input.playerLine ?? "",
    priorPlayer,
    lastEcho,
  );
  const echo = input.echo ?? rt.local;
  await researchStep("turn", rt);

  const fallbackLine =
    [echo.greeting, ...echo.replies, "我也有一件，后来就没再动。"].find((l) => l && l.trim()) ||
    "我也有一件，后来就没再动。";
  const spokenRes = await speakFromMaterials(
    rt,
    input.playerLine || "",
    recallWithoutCurrent(input.recall, input.playerLine),
    fallbackLine,
    10000,
    stepEx.speak,
    stepEx.mode,
  );
  const spoken = spokenRes.text;
  const via = spokenRes.via;

  const nextEcho: EchoPerson = {
    ...echo,
    felt: acceptFelt(rt.shadow?.materials[0]?.situation, echo.felt || rt.local.felt),
    greeting: echo.greeting || spoken,
    replies: [spoken, ...echo.replies]
      .filter((l, i, arr) => l && !stolenVoice(l, input.archival) && arr.indexOf(l) === i)
      .slice(0, 4),
    returnLetter: echo.returnLetter || rt.local.returnLetter,
    source: via,
  };

  return {
    echo: nextEcho,
    spoken,
    suggestions: [],
    facts: rt.ctx.remembered.filter((f) => isCompleteFact(f) && !/玩家靠近|今晚靠近/.test(f)),
    hits: rt.hits.slice(-4),
    session: input.session ?? [],
    persona: rt.live.persona || `你是${nextEcho.name}，在${nextEcho.city}。`,
    human: rt.live.facts.join("\n"),
    meter: { ...emptyMeter("turn", via), model: via === "live" ? AGENT_MODEL.id : "archive" },
    exchange: stepEx.state,
    speak: stepEx.speak,
    speakMode: stepEx.mode,
    judgment: stepEx.judgment,
  };
}

/** seal 链：对话结束 → 记忆提取 → 写回信。 */
async function runSealChain(input: NightInput): Promise<NightResult> {
  const rt = makeRuntime(input);
  const sealed = input.exchange ?? initialExchange();
  if (!hasApiKey()) {
    return { ...fallbackFor("seal", rt), exchange: sealed, speak: sealed.unlocked, speakMode: "full" };
  }

  const echo = input.echo ?? rt.local;
  const dialogue = (input.recall ?? [])
    .map((t) => `${t.who === "you" ? "玩家" : "回声"}：${t.text}`)
    .join("\n");
  await researchStep("seal", rt);

  // Step 1: 记忆提取。
  const rememberSystem = `${RULES}\n\n${coreBlocks(rt)}
现在你是回忆提取器：从对话中挑 1-2 条玩家的具体实事。只调用 remember，调用后不输出任何话。`;
  await step(
    "seal-remember",
    rememberSystem,
    `对话：\n${dialogue}`,
    [makeRememberTool(rt)],
    4,
    20000,
  );

  // Step 2: 写回信。无工具，避免模型再去做别的事。
  const playerBits = (input.recall ?? [])
    .filter((t) => t.who === "you")
    .map((t) => t.text)
    .filter(Boolean)
    .slice(-2);
  const quoteHint = playerBits.length
    ? `从玩家说过的话里点出一句原话（「${playerBits.join("」「")}」里挑），说哪句接住了你。`
    : "若记得玩家一句原话，轻轻点一下。";
  const sealSystem = `${RULES}\n\n${coreBlocks(rt)}
现在写回信。你是${echo.name}，在${echo.city}。你只说自己还留着什么，不问玩家留没留。
${quoteHint}
回信 ≤48 字，像一张真正会寄出去的纸。不要写出层号。`;
  const step2 = await step(
    "seal-write",
    sealSystem,
    `对话：\n${dialogue}\n\n你的回信：`,
    [],
    1,
    25000,
  );

  const liveLetter = step2.text ? cleanOneLine(step2.text, 48) : "";
  const tonight = (input.recall ?? [])
    .filter((t) => t.who === "you")
    .map((t) => t.text.trim())
    .filter(Boolean)
    .at(-1);
  const sealFallback = tonight
    ? `你那句「${tonight.slice(0, 16)}」我还留着。灯还开着。`
    : "灯还开着。你那句话我没扔。";
  const returnLetter = ownLine(
    liveLetter || sealFallback,
    [sealFallback, echo.greeting],
    input.archival,
    [rt.local.returnLetter, echo.returnLetter].filter(Boolean),
  );
  const via = liveLetter ? "live" : "archive";
  const nextEcho: EchoPerson = {
    ...echo,
    returnLetter,
    source: via,
  };

  return {
    echo: nextEcho,
    spoken: returnLetter,
    suggestions: [],
    facts: rt.ctx.remembered.filter((f) => isCompleteFact(f) && !/玩家靠近|今晚靠近/.test(f)),
    hits: rt.hits.slice(-4),
    session: input.session ?? [],
    persona: rt.live.persona || `你是${nextEcho.name}，在${nextEcho.city}。`,
    human: rt.live.facts.join("\n"),
    meter: { ...step2.meter, via },
    exchange: sealed,
    speak: sealed.unlocked,
    speakMode: "full",
  };
}

export const echoChain = {
  match: runMatchChain,
  turn: runTurnChain,
  seal: runSealChain,
};
