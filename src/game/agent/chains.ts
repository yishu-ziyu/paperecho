/**
 * Paper Echo — 产品业务层（Prompt Chaining · 提示词链）
 *
 * 参考：Agentic Design Patterns · Chapter 1: Prompt Chaining
 * https://adp.xindoo.xyz/chapters/Chapter%201_%20Prompt%20Chaining/
 *
 * 产品里的三个业务动作被拆成明确的小步骤，每步只做一件事：
 *
 *   match: research -> decidePersona(arrive) -> draftGreeting -> validate
 *   turn:  research -> rememberPlayer -> reply -> validate
 *   seal:  research -> rememberFacts -> writeReturnLetter -> validate
 *
 * 每一步都是一个短命 Pi Agent：只给这一步允许的工具，跑完即结束。
 */
import { Agent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type, createModels } from "@earendil-works/pi-ai";
import { chipPool } from "../emotions.ts";
import { fallbackEcho } from "../kernel.ts";
import { foreignPlace } from "../stories.ts";
import type { EchoPerson, TokenMeter } from "../types.ts";
import { AGENT_MODEL, llmApiKey, llmProvider, LLM_CONFIG } from "./config.ts";
import { emptyMeter, hasApiKey } from "./llm.ts";
import { factsOf, isCompleteFact, ownLine, perceptionOf, renderBlocks, stolenVoice } from "./memory.ts";
import { formatCaseHitsLive, runAgentTool, type ToolCtx } from "./tools.ts";
import { acceptFelt, advanceExchange, exchangeCue, initialExchange } from "./exchange.ts";
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
  pool: string[];
  live: { persona: string; facts: string[] };
  ctx: ToolCtx;
  hits: string[];
  draft: { name: string; city: string; felt: string; lines: string[] };
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
  const pool = chipPool(input.fingerprint).slice(0, 3);
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
    pool,
    live,
    ctx,
    hits: [],
    draft: {
      name: input.echo?.name ?? local.name,
      city: input.echo?.city ?? local.city,
      felt: input.echo?.felt ?? local.felt,
      lines: [],
    },
  };
}

function makeArriveTool(rt: ChainRuntime, lockIdentity: boolean): AgentTool {
  return {
    name: "arrive",
    label: "落到桌上",
    description:
      "用结构化参数落下你自己的身份和这座城市的三句新细节。已有名字时不要改名。felt 必须是有画面的人话短句，禁止 anxious,tired 这类标签串。三句不能重复 Human，不能重复刚说的那句。",
    parameters: Type.Object({
      name: Type.Optional(Type.String()),
      city: Type.Optional(Type.String()),
      felt: Type.Optional(Type.String()),
      lines: Type.Array(Type.String()),
    }),
    execute: async (_id, params) => {
      const p = params as { name?: string; city?: string; felt?: string; lines?: string[] };
      if (!lockIdentity && p.name?.trim()) rt.draft.name = p.name.trim();
      if (!lockIdentity && p.city?.trim()) rt.draft.city = p.city.trim();
      if (p.felt?.trim()) rt.draft.felt = acceptFelt(p.felt, rt.draft.felt);
      if (Array.isArray(p.lines))
        rt.draft.lines = p.lines
          .map((l) => String(l).trim())
          .filter(Boolean)
          .slice(0, 3);
      rt.live.persona = `你是${rt.draft.name}，在${rt.draft.city}。`;
      return { content: [{ type: "text", text: "已落到桌上。" }], details: rt.draft };
    },
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

/** 今晚对话铺成「玩家/回声」行。reply 注入时去掉与 playerLine 重复的末条。 */
function formatRecall(items: RecallItem[]): string {
  return items
    .map((t) => `${t.who === "you" ? "玩家" : "回声"}：${t.text}`)
    .join("\n");
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

  if (kind === "match") {
    const cases = await formatCaseHitsLive(rt.ctx);
    rt.hits.push(cases);
    notes.push(`【世界档案里的相似的人】\n${cases}`);
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
    suggestions: kind === "seal" ? [] : rt.pool,
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
  if (!hasApiKey()) return { ...fallbackFor("match", rt), exchange: opened, speak: 1, speakMode: "full" };

  const research = await researchStep("match", rt);

  // Step 1: 身份决策。只给 arrive 工具。
  const decideSystem = `${RULES}\n\n${coreBlocks(rt)}
现在你只做身份匹配：从上面的检索资料和玩家今晚的痕迹里，确定/保持你是一个什么样的人。
不评价玩家，不替 TA 下结论。
只能调用 arrive 落下名字、城市、felt、三句新细节。调用后可以补一句不超过 56 字的微信式第一句。
${exchangeCue(1, "full")}`;
  const decideUser = `${rt.perception}
你要对上的信：${input.letter || "（空白）"}
玩家写下的一句：${input.mirror || "（无）"}
${research}`;
  const step1 = await step(
    "match-persona",
    decideSystem,
    decideUser,
    [makeArriveTool(rt, Boolean(input.echo))],
    4,
  );

  // Step 2: 只写第一句。不改名，不换城。
  const name = rt.draft.name || rt.local.name;
  const city = rt.draft.city || rt.local.city;
  const details = rt.draft.lines.length
    ? rt.draft.lines.map((l) => `- ${l}`).join("\n")
    : "（还没确定）";
  const draftSystem = `${RULES}

# Persona
你是${name}，在${city}。

# 你的新细节
${details}`;
  const draftUser = `${rt.perception}
现在只写一句话。你是${name}，在${city}。
这句话 ≤56 字，说你自己今晚发生了什么（一件具体事），像微信。不要引用 Human 的句子。
${exchangeCue(1, "full")}`;
  const step2 = await step("match-greeting", draftSystem, draftUser, [], 1, 20000);

  const rawLive = step2.text || step1.text;
  const raw = rawLive || rt.local.greeting;
  const spoken0 = ownLine(
    cleanOneLine(raw),
    [rt.local.greeting, ...rt.local.replies],
    input.archival,
  );
  const spoken = foreignPlace(spoken0, rt.draft.name, rt.draft.city) ? rt.local.greeting : spoken0;
  const via = rawLive ? "live" : "archive";

  const builtEcho: EchoPerson = {
    name: rt.draft.name,
    city: rt.draft.city,
    felt: acceptFelt(rt.draft.felt, rt.local.felt),
    greeting: spoken,
    replies: [spoken, ...rt.draft.lines, ...rt.local.replies]
      .filter((l, i, arr) => l && !stolenVoice(l, input.archival) && arr.indexOf(l) === i)
      .slice(0, 4),
    returnLetter: rt.local.returnLetter,
    source: via,
  };

  return {
    echo: builtEcho,
    spoken,
    suggestions: rt.draft.lines
      .map((l) => closeHangingQuotes(l.trim()))
      .filter((l) => l && l !== spoken && !stolenVoice(l, input.archival) && !foreignPlace(l, rt.draft.name, rt.draft.city))
      .slice(0, 3),
    facts: rt.ctx.remembered.filter((f) => isCompleteFact(f) && !/玩家靠近|今晚靠近/.test(f)),
    hits: rt.hits.slice(-4),
    session: [
      ...(input.session ?? []),
      { chain: "match", steps: ["research", "persona", "greeting"] },
    ],
    persona: rt.live.persona || `你是${builtEcho.name}，在${builtEcho.city}。`,
    human: rt.live.facts.join("\n"),
    meter: {
      prompt: step1.meter.prompt + step2.meter.prompt,
      completion: step1.meter.completion + step2.meter.completion,
      total: step1.meter.total + step2.meter.total,
      model: AGENT_MODEL.id,
      via,
      node: "match",
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
  if (!hasApiKey()) {
    return {
      ...fallbackFor("turn", rt),
      exchange: stepEx.state,
      speak: stepEx.speak,
      speakMode: stepEx.mode,
      judgment: stepEx.judgment,
    };
  }

  const echo = input.echo ?? rt.local;
  const research = await researchStep("turn", rt);

  const earlierTonight = formatRecall(recallWithoutCurrent(input.recall, input.playerLine).slice(-2));

  // Step 1: 只记玩家刚说过的事实。
  const rememberSystem = `${RULES}\n\n${coreBlocks(rt)}
现在你只做一件事：如果玩家刚才的话里有值得记住的事实，调用 remember 存下。不要回复。`;
  await step(
    "turn-remember",
    rememberSystem,
    `${earlierTonight ? `今晚刚说过：\n${earlierTonight}\n\n` : ""}玩家刚才说：${input.playerLine || "（无）"}`,
    [makeRememberTool(rt)],
    4,
    20000,
  );

  // Step 2: 回应。只给 arrive，补充城市细节后说一句自己的事。
  const replySystem = `${RULES}\n\n${coreBlocks(rt)}
现在你只做回应。记住：你是${echo.name}，在${echo.city}。用你自己的平行经历接 TA：先说一件你的具体事，可以带出「我也这样」的共情，但不评价玩家、不替 TA 下结论。
可以调用 arrive 补齐一两条这座城市的新细节，然后说一句 ≤56 字的微信式话。不要复述玩家刚扔的那句。
最多轻轻点一下刚说过的那件事。
${exchangeCue(stepEx.speak, stepEx.mode)}`;
  const step2 = await step(
    "turn-reply",
    replySystem,
    `${rt.perception}
你现在的身份：${echo.name} · ${echo.city} ${echo.felt || ""}
${earlierTonight ? `今晚刚说过（最近两句）：\n${earlierTonight}\n` : ""}玩家刚扔过来：${input.playerLine || "（无）"}
${research}`,
    [makeArriveTool(rt, true)],
    4,
    25000,
  );

  const fallbackLine =
    [echo.greeting, ...echo.replies, ...rt.local.replies, "我那晚也没睡。电脑还亮着。"].find(
      (l) => l && l.trim(),
    ) || "我那晚也没睡。电脑还亮着。";
  const rawLive = step2.text;
  const raw = rawLive || rt.draft.lines[0] || fallbackLine;
  const spoken0 = ownLine(cleanOneLine(raw), [fallbackLine], input.archival);
  const spoken = foreignPlace(spoken0, rt.draft.name, rt.draft.city) ? fallbackLine : spoken0;
  const via = rawLive ? "live" : "archive";

  const nextEcho: EchoPerson = {
    ...echo,
    felt: acceptFelt(rt.draft.felt, echo.felt || rt.local.felt),
    greeting: echo.greeting || spoken,
    replies: [spoken, ...rt.draft.lines, ...echo.replies]
      .filter((l, i, arr) => l && !stolenVoice(l, input.archival) && arr.indexOf(l) === i)
      .slice(0, 4),
    returnLetter: echo.returnLetter || rt.local.returnLetter,
    source: via,
  };

  return {
    echo: nextEcho,
    spoken,
    suggestions: rt.draft.lines
      .map((l) => closeHangingQuotes(l.trim()))
      .filter((l) => l && l !== spoken && !stolenVoice(l, input.archival) && !foreignPlace(l, nextEcho.name, nextEcho.city))
      .slice(0, 3),
    facts: rt.ctx.remembered.filter((f) => isCompleteFact(f) && !/玩家靠近|今晚靠近/.test(f)),
    hits: rt.hits.slice(-4),
    session: input.session ?? [],
    persona: rt.live.persona || `你是${nextEcho.name}，在${nextEcho.city}。`,
    human: rt.live.facts.join("\n"),
    meter: { ...step2.meter, via },
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
