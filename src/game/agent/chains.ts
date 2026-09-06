/**
 * Paper Echo — 产品业务层（Prompt Chaining · 提示词链）
 *
 * 参考：Agentic Design Patterns · Chapter 1: Prompt Chaining
 * https://adp.xindoo.xyz/chapters/Chapter%201_%20Prompt%20Chaining/
 *
 * 产品里的三个业务动作被拆成明确的小步骤，每步只做一件事：
 *
 *   match: decideMatch（display identity 由 anchor Story 经 storyToEcho 决定，evidence 只进
 *          hits/MatchTrace，不进 prompt）→ research（gatherShadow 检索；raw live
 *          discovery-only，不进当前 generation materials）→ respond（基于 generation
 *          material allowlist 上的 materials 生成措辞，anchor Story 恒为第一项）
 *   turn:  restoreEchoSession（每 turn 重建逻辑 session）→ research（结果进上下文）
 *          → 短命 Pi Agent（带 search_archive / search_cases / remember 工具）
 *          → 出口 guard → voice 一次 → daybook → 空
 *   seal:  research -> rememberFacts -> writeReturnLetter -> validate
 *
 * 回复文本生成走 pipeline/respond.ts 的固定 prompt 规范，不直接复制故事卡原句。
 * turn 的主路径是短命 Pi Agent；greet/away/day 兜底仍走 pipeline/respond。
 */
import { Agent, type AgentMessage, type AgentTool, type StreamFn } from "@earendil-works/pi-agent-core";
import { Type, createModels } from "@earendil-works/pi-ai";
import { ownedOf } from "../emotions.ts";
import { echoFromCompanion, makeCompanion } from "../companion.ts";
import { isCannedDay, nightLine, openingLine, type Daybook } from "../heartbeat.ts";
import { storyToEcho } from "../stories.ts";
import type { EchoPerson, EmotionId, TokenMeter } from "../types.ts";
import { AGENT_MODEL, llmApiKey, llmProvider, LLM_CONFIG } from "./config.ts";
import { emptyMeter, hasApiKey } from "./llm.ts";
import { decideMatch, type MatchDecision } from "./matching.ts";
import { factsOf, isCompleteFact, isInstruction, ownLine, parroted, perceptionOf, renderBlocks, stolenVoice } from "./memory.ts";
import type { EchoShadow } from "./pipeline/persona.ts";
import type { Post } from "./pipeline/source.ts";
import { storyToPost } from "./pipeline/sources/local.ts";
import { buildTurnContext, personaOf, restoreEchoSession, RULES, TURN_AGENT_TIMEOUT_MS } from "./session.ts";
import { blobOfShadow, gatherShadow, runAgentTool, type ToolCtx } from "./tools.ts";
import type { MatchTrace, NightInput, NightResult, RecallItem, VoiceInput } from "./types.ts";
import {
  acceptFelt,
  advanceExchange,
  cleanOneLine,
  fallbackReturnLetter,
  hasMetaLeak,
  initialExchange,
  lineForLayer,
  SEAL_REMEMBER_TIMEOUT_MS,
  SEAL_WRITE_TIMEOUT_MS,
  type ExchangeState,
  type SpeakMode,
  type StoryDepth,
} from "./exchange.ts";

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
 * 把模型输出收敛为一句可读的话的清洗函数（cleanOneLine /
 * closeHangingQuotes）住在 ./exchange.ts —— 确定性落闸的家。
 * chains 与 pipeline/respond 共用同一套，避免循环依赖。
 */

/**
 * 模型回复的清洗入口：cleanOneLine + hasMetaLeak + ownLine（拒指令句、拒泄露内部词、
 * 拒搬运 archival 里的 Story 原句、拒复读 used 句）。出现「杭州」等与当前 Echo 无关的
 * 地名不构成「搬运他人 Story」的证据，不据此整体替换为故事卡行。
 * 泄露词整句拒绝：直接落 fallback，不做词替换。
 */
export function keepSpoken(
  raw: string,
  fallback: string,
  archival: import("../types.ts").MemoryRecord[],
  used?: string | string[],
): string {
  const cleaned = cleanOneLine(raw);
  if (hasMetaLeak(cleaned)) return fallback;
  const line = ownLine(cleaned, [fallback], archival, used);
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

/** 短命 Pi Agent：执行一个步骤。streamFn 可注入假流（测试用），默认走真实模型。 */
async function step(
  name: string,
  system: string,
  user: string,
  tools: AgentTool[],
  maxTurns: number,
  timeoutMs = LLM_CONFIG.timeoutMs,
  streamFn?: StreamFn,
) {
  let turns = 0;
  const agent = new Agent({
    initialState: {
      systemPrompt: system,
      model: AGENT_MODEL,
      thinkingLevel: "off",
      tools,
    },
    streamFn: streamFn ?? getModels().streamSimple.bind(getModels()),
    getApiKey: async () => llmApiKey(),
    shouldStopAfterTurn: async (ctx) => {
      turns += 1;
      return ctx.toolResults.length === 0 || turns >= maxTurns;
    },
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      agent.prompt(user),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${name} timeout`)), timeoutMs);
      }),
    ]);
  } catch {
    // 超时/错误按空结果处理，由上层决定 fallback
  } finally {
    if (timer !== undefined) clearTimeout(timer);
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
  /** 新遇（input.echo 为空）时 decideMatch 的输出；revisit identity lock（input.echo 已存在）时为 null，不重新执行 identity selection。 */
  decision: MatchDecision | null;
  perception: string;
  live: { persona: string; facts: string[] };
  ctx: ToolCtx;
  hits: string[];
  draft: { name: string; city: string; felt: string; lines: string[] };
  shadow: EchoShadow | null;
}

function makeRuntime(input: NightInput): ChainRuntime {
  // display identity 只来自这条链：新遇（无 locked echo）decideMatch → anchor Story → storyToEcho；
  // revisit（input.echo 已存在，revisit identity lock）跳过 identity selection。
  const decision = input.echo
    ? null
    : decideMatch({
        letter: input.letter,
        mirror: input.mirror,
        playerLine: input.playerLine,
        feels: ownedOf(input.fingerprint, 0.3).map((f) => f.id) as EmotionId[],
        region: input.region,
        avoid: input.avoidNames,
      });
  const local = input.echo ?? storyToEcho(decision!.anchor);
  const perception = perceptionOf(
    input.fingerprint,
    input.letter,
    input.mirror,
    input.region,
    input.playerPersona ?? "",
  );
  const live = {
    persona: personaOf(input),
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
    decision,
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
  _fallback: string,
  timeoutMs: number,
  speak: StoryDepth = 1,
  mode: SpeakMode = "full",
): Promise<{ text: string; via: TokenMeter["via"] }> {
  const shadow = rt.shadow;
  if (!shadow?.materials.length) {
    return { text: "", via: "archive" };
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
  const priorEcho = (history ?? []).filter((h) => h.who === "echo").map((h) => h.text);
  if (out.via !== "live") {
    return { text: "", via: "archive" };
  }
  const text = keepSpoken(out.reply, "", rt.input.archival, [
    userLine,
    rt.input.letter,
    rt.input.mirror,
    ...priorEcho,
  ]);
  if (text && !priorEcho.some((p) => parroted(text, p))) {
    return { text, via: "live" };
  }
  const live = (out.reply ?? "").trim();
  if (live && !hasMetaLeak(live) && !priorEcho.some((p) => parroted(live, p))) {
    return { text: live.slice(0, 56), via: "live" };
  }
  return { text: "", via: "live" };
}

const VOICE_CANNED = new Set([
  "我也有一件，后来就没再动。",
  "我也有一件，刚起了个头。",
  "那件事落在身上，我没跟人说。",
  "后来我也就没再打开过。",
]);

function liveOrPrev(text: string, prev: string): string {
  const line = text.trim().slice(0, 56);
  if (!line || VOICE_CANNED.has(line) || isCannedDay(line) || /想你|接住|加油|不是一个人/.test(line)) {
    const fallback = prev.trim().slice(0, 56);
    return isCannedDay(fallback) ? "" : fallback;
  }
  return line;
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

/** 检索工具包成 AgentTool：execute 直接返回 runAgentTool 的文本结果。 */
function makeSearchTool(rt: ChainRuntime, name: "search_archive" | "search_cases"): AgentTool {
  const meta =
    name === "search_archive"
      ? {
          label: "查信柜",
          description:
            "查这位玩家信柜里的旧事（对方以前说过的原话）。查到的是对方的事，不是你的，禁止说成你的经历。",
        }
      : {
          label: "查素材",
          description: "查别人的具体夜（和你同频的人的相近经历）。细节可以化用，禁止搬运整句。",
        };
  return {
    name,
    label: meta.label,
    description: meta.description,
    parameters: Type.Object({ query: Type.String() }),
    execute: async (_id, params) => ({
      content: [
        { type: "text", text: runAgentTool(name, params as Record<string, unknown>, rt.ctx) },
      ],
      details: { query: String((params as { query?: string }).query ?? "") },
    }),
  };
}

/**
 * turn 回复的出口 guard：cleanOneLine → keepSpoken（ownLine 的
 * stolenVoice/parroted 校验）。ownLine 在全部拒绝时会退回原句，
 * 所以这里再显式复核一次，拒掉就返回空串交给 fallback。
 */
export function guardTurnReply(
  raw: string,
  archival: import("../types.ts").MemoryRecord[],
  used: string[],
): string {
  const line = cleanOneLine(raw);
  if (!line) return "";
  if (hasMetaLeak(line)) return "";
  const guarded = keepSpoken(line, "", archival, used);
  if (!guarded || isInstruction(guarded)) return "";
  if (stolenVoice(guarded, archival)) return "";
  if (used.some((u) => u.trim() && parroted(guarded, u))) return "";
  return guarded;
}

/**
 * match 阶段的 generation material allowlist（review Finding 1）：respond() 收到的
 * materials 只包含 anchor Story 与 approved supporting Stories
 * （MatchDecision.supporting：textRank ≤ SUPPORTING_TEXT_RANK_MAX、coverage > 0、≤2 条）。
 * base.materials 的其余项一律不回填：respond 的 rankedMaterials 会按 userLine 重排全部
 * materials，任何未批准的 Story 混入都可能被说成当前 Echo 自己的经历。
 * raw live discovery 不进当前 generation materials / prompt（review Finding 2）；
 * 只记入 shadow.livePosts 供观测并后台 ingest（rewriteStory + qaStory → COLLECTED），
 * 成为安全候选 Story 后才可能被后续 match 使用。
 * material provenance：materials 元素只有 Post（platform/content/emotion/situation），
 * 无 name/city，结构上不能反向成为 display identity。
 */
function alignShadowToAnchor(rt: ChainRuntime): EchoShadow {
  const d = rt.decision!;
  const base = rt.shadow;
  const anchorPost = storyToPost(d.anchor);
  const materials: Post[] = [anchorPost];
  const seen = new Set([anchorPost.content]);
  for (const s of d.supporting) {
    const p = storyToPost(s);
    if (!seen.has(p.content)) {
      seen.add(p.content);
      materials.push(p);
    }
  }
  if (!base) {
    return { handle: "回声", voice: "", materials };
  }
  return { ...base, materials };
}

/** hits 证据行：anchor 是谁/来自哪个池/各路名次 → fused 名次；只进 JudgePanel，不进 prompt。 */
function matchEvidenceLine(d: MatchDecision): string {
  const ev = d.evidence.find((e) => e.id === d.anchor.id)!;
  const top = d.ranked.slice(0, 6).map((s) => s.id).join(",");
  return `【匹配】anchor=${d.anchor.id} ${d.anchor.name}·${d.anchor.city} source=${d.anchor.source ?? "handwritten"} | text#${ev.textRank} emo#${ev.emotionRank} region#${ev.regionRank} → fused#${ev.fusedRank}；候选: ${top}`;
}

function matchTraceOf(d: MatchDecision): MatchTrace {
  return {
    anchorId: d.anchor.id,
    anchorSource: d.anchor.source ?? "handwritten",
    top: d.ranked.slice(0, 5).map((s, i) => ({
      id: s.id,
      source: s.source ?? "handwritten",
      fusedRank: i + 1,
    })),
  };
}

/** 检索步骤：本地库 + live search（match 独立短预算；raw live discovery-only）。不调用对话 LLM。 */
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
    if (rt.decision) rt.shadow = alignShadowToAnchor(rt);
    const blob = blobOfShadow(rt.shadow);
    rt.hits.push(blob);
    notes.push(
      `【给你参考的别人的事】（只用于形成你自己的话，不许向对方提到这些内容的来历）\n${blob}`,
    );
  }

  if (rt.input.archival.length > 0) {
    const archive = runAgentTool("search_archive", { query }, rt.ctx);
    rt.hits.push(archive);
    notes.push(`【对方以前来过的旧事】\n${archive}`);
  }

  return notes.join("\n\n") || "（没有更多素材）";
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

/** match 链：新遇走 decideMatch → anchor Story → storyToEcho；revisit（input.echo 已存在，revisit identity lock）走 companion 状态重建，不重新执行 identity selection。 */
async function runMatchChain(input: NightInput): Promise<NightResult> {
  const rt = makeRuntime(input);
  const opened: ExchangeState = initialExchange();
  const returning = Boolean(
    input.echo?.name && (input.echo.awayThing || input.recall?.some((t) => t.who === "echo")),
  );

  await researchStep("match", rt);
  if (rt.decision) rt.hits.push(matchEvidenceLine(rt.decision));
  if (returning && input.echo) {
    const companion = makeCompanion({
      echo: input.echo,
      transcript: input.recall,
      fingerprint: input.fingerprint,
      letter: input.letter,
      awayThing: input.echo.awayThing,
    });
    const days = input.days ?? [];
    const extra = [
      ...days.slice(-8).map((d) => ({
        platform: "daybook",
        content: d.text,
        emotion: companion.lastEmotions,
        situation: d.date,
      })),
      companion.lastEcho
        ? {
            platform: "daybook",
            content: companion.lastEcho,
            emotion: companion.lastEmotions,
            situation: "上次开口",
          }
        : null,
    ].filter((row): row is Post => Boolean(row?.content));
    if (rt.shadow) {
      rt.shadow = {
        ...rt.shadow,
        handle: `${companion.name}，在${companion.city}`,
        materials: [...extra, ...rt.shadow.materials].slice(0, 8),
      };
    } else {
      rt.shadow = {
        handle: `${companion.name}，在${companion.city}`,
        voice: "第一人称、短句、说具体物件、不说教。",
        materials: extra,
      };
    }
    const { voiceAsPerson } = await import("./pipeline/respond.ts");
    const greet = await voiceAsPerson({
      kind: "greet",
      name: companion.name,
      city: companion.city,
      lastEcho: companion.lastEcho,
      lastYou: companion.lastYou,
      lastEmotions: companion.lastEmotions,
      prev: days.at(-1)?.text || companion.lastEcho,
      days,
      letter: input.letter,
      timeoutMs: 28000,
    });
    const book: Daybook = {
      name: companion.name,
      city: companion.city,
      lastEcho: companion.lastEcho,
      lastYou: companion.lastYou,
      lastEmotions: companion.lastEmotions,
      page: days.at(-1)?.text || companion.awayThing,
      days,
      lastWritten: days.at(-1)?.date || "",
    };
    // greet 泄露内部词时按非 live 处理：openingLine 走 book/lastEcho 兜底。
    const greetLive = greet.via === "live" && !hasMetaLeak(greet.reply ?? "");
    const spoken = openingLine(greetLive ? greet.reply : "", book, companion.lastEcho);
    const builtEcho = echoFromCompanion(companion, spoken);
    const dayLines = days
      .slice(-5)
      .map((d) => `${d.date} ${d.text}`)
      .join("\n");
    return {
      echo: builtEcho,
      spoken,
      suggestions: [],
      facts: rt.ctx.remembered.filter((f) => isCompleteFact(f) && !/玩家靠近|今晚靠近/.test(f)),
      hits: rt.hits.slice(-4),
      session: [
        ...(input.session ?? []),
        { chain: "match", steps: ["research", "return"] },
      ],
      persona: dayLines
        ? `你是${builtEcho.name}，在${builtEcho.city}。先读你的日子本，从这些日子开口，不要自我介绍，不要说想对方。上次你说「${companion.lastEcho}」。对方上次说「${companion.lastYou}」。\n${dayLines}`
        : `你是${builtEcho.name}，在${builtEcho.city}。上次说过「${companion.lastEcho}」。`,
      human: rt.live.facts.join("\n"),
      meter: {
        ...emptyMeter("match", greetLive ? "live" : "archive"),
        model: greetLive ? AGENT_MODEL.id : "archive",
      },
      exchange: opened,
      speak: 1,
      speakMode: "full",
    };
  }

  const spokenRes = await speakFromMaterials(
    rt,
    input.letter || input.mirror,
    undefined,
    rt.local.greeting,
    14000,
    1,
    "full",
  );
  const via = spokenRes.via;
  // respond 只做措辞：live 生成结果经 keepSpoken guard 后使用；失败/被拒时回退 anchor
  // narrative source（storyToEcho 的 greeting/replies 基底），display identity 字段不受影响。
  // 旧实现按「十七稿」letter 内容特判替换 opening 的逻辑已删除——它只在身份固定为林予时才有意义。
  const spoken = via === "live" ? liveOrPrev(spokenRes.text, "") || rt.local.greeting : rt.local.greeting;
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
    match: rt.decision ? matchTraceOf(rt.decision) : undefined,
  };
}

async function askTurnLive(input: NightInput, echo: EchoPerson, lastEcho: string, timeoutMs: number): Promise<string> {
  const { voiceAsPerson } = await import("./pipeline/respond.ts");
  const prev = lastEcho.trim();
  const out = await voiceAsPerson({
    kind: "turn",
    name: echo.name,
    city: echo.city,
    lastEcho,
    lastYou: input.playerLine || "",
    lastEmotions: input.fingerprint.map((f) => f.id),
    prev: lastEcho,
    days: input.days,
    letter: input.playerLine || input.letter,
    history: input.recall,
    timeoutMs,
  });
  // 泄露内部词的 live 行视为无回复，交给后续兜底。
  const line = out.via === "live" && !hasMetaLeak(out.reply ?? "") ? (out.reply ?? "").trim().slice(0, 56) : "";
  if (line && line !== prev) return line;
  return "";
}

/** turn 链的可注入项：streamFn 假流（测试用）；注入时跳过 askTurnLive 的真实网络路径。 */
export interface TurnChainOptions {
  streamFn?: StreamFn;
}

/** turn 链：玩家回复后，同一个逻辑 Echo 回一句话（每 turn 重建 session + 短命 Agent）。 */
async function runTurnChain(input: NightInput, opts: TurnChainOptions = {}): Promise<NightResult> {
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
  const session = restoreEchoSession(input);
  // 检索结果进模型上下文（不再丢弃）；rt.hits 照旧供 JudgePanel。
  const research = await researchStep("turn", rt);

  const echoLines = (input.recall ?? []).filter((t) => t.who === "echo").map((t) => t.text);
  const used = [input.playerLine ?? "", input.letter, input.mirror, ...echoLines, ...priorPlayer];

  let spoken = "";
  let via: TokenMeter["via"] = "archive";
  // 主路径真实观测到的 usage；agent 没跑（无 key 且无假流）时保持 null，不伪造数字。
  let agentMeter: TokenMeter | null = null;

  // 主路径：带工具的短命 Pi Agent。注入了假流即视为有模型（测试密封，不发真实网络）。
  if (opts.streamFn || hasApiKey()) {
    const { system, user } = buildTurnContext(session, research, {
      speak: stepEx.speak,
      mode: stepEx.mode,
    });
    const tools = [
      makeSearchTool(rt, "search_archive"),
      makeSearchTool(rt, "search_cases"),
      makeRememberTool(rt),
    ];
    const out = await step("turn", system, user, tools, 4, TURN_AGENT_TIMEOUT_MS, opts.streamFn);
    agentMeter = out.meter;
    spoken = guardTurnReply(lastAssistantText(out.messages as AgentMessage[]), input.archival, used);
    if (spoken) via = "live";
  }

  // fallback 1：单次 voice 通道（注入假流的测试不走这条，避免真实网络）。
  if (!spoken && !opts.streamFn && hasApiKey()) {
    const live = await askTurnLive(input, echo, lastEcho, 14_000);
    if (live) {
      spoken = live;
      via = "live";
    }
  }

  // fallback 2：日子本兜底。
  if (!spoken) {
    const days = input.days ?? [];
    const book: Daybook = {
      name: echo.name,
      city: echo.city,
      lastEcho: echo.greeting || lastEcho,
      lastYou: input.playerLine || "",
      lastEmotions: input.fingerprint.map((f) => f.id),
      page: days.at(-1)?.text || echo.awayThing || echo.greeting,
      days,
      lastWritten: days.at(-1)?.date || "",
    };
    spoken = nightLine("", lastEcho, book);
  }

  // fallback 3：本地素材耗尽时的确定性最后一句。无 key / 超时 / 素材全复读也不断线。
  // 复读上一句（lastEcho）、偷玩家记忆、指令残渣都过滤；own 全空就按当前层取固定层句，
  // 该层也复读（上一轮已说过同层）就换层重试；链尾 spoken 保证非空且 ≠ lastEcho，
  // store 的 nightLine 门禁才放行。
  if (!spoken) {
    const own = [echo.greeting, ...(echo.replies ?? [])]
      .map((l) => (l ?? "").trim())
      .filter((l) => l && !parroted(l, lastEcho) && !isInstruction(l) && !stolenVoice(l, input.archival));
    const layerOrder: StoryDepth[] = [
      stepEx.speak,
      ...([1, 2, 3] as StoryDepth[]).filter((d) => d !== stepEx.speak),
    ];
    const layerLine = layerOrder
      .map((d) => lineForLayer({}, d, stepEx.mode))
      .find((l) => l && !parroted(l, lastEcho) && !isInstruction(l) && !stolenVoice(l, input.archival));
    spoken = own[0] ?? layerLine ?? lineForLayer({}, stepEx.speak, stepEx.mode);
  }

  // meter：agent 真跑过且观测到 usage 就保留真实数字（即使回复被 guard 拒掉走 archive，
  // 已消耗的 token 不归零）；没跑或零 usage 维持空表，via/model 按实际路径诚实标注。
  const meter: TokenMeter =
    agentMeter && agentMeter.total > 0
      ? { ...agentMeter, via, node: "turn" }
      : { ...emptyMeter("turn", via), model: via === "live" ? AGENT_MODEL.id : "archive" };

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
    meter,
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
    SEAL_REMEMBER_TIMEOUT_MS,
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
    SEAL_WRITE_TIMEOUT_MS,
  );

  // live 回信带泄露词就置空：ownLine 落 sealFallback，绝不让内部词出现在信里。
  const liveDraft = step2.text ? cleanOneLine(step2.text, 48) : "";
  const liveLetter = liveDraft && !hasMetaLeak(liveDraft) ? liveDraft : "";
  const tonight = (input.recall ?? [])
    .filter((t) => t.who === "you")
    .map((t) => t.text.trim())
    .filter(Boolean)
    .at(-1);
  const sealFallback = fallbackReturnLetter(tonight);
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

async function runVoiceChain(input: VoiceInput): Promise<string> {
  const { voiceAsPerson } = await import("./pipeline/respond.ts");
  const out = await voiceAsPerson(input);
  if (out.via !== "live") return "";
  // 日子本玩家可见：带内部词的 live 行整句丢弃，回落空串（调用方保留原页）。
  const line = liveOrPrev(out.reply ?? "", "");
  return line && !hasMetaLeak(line) ? line : "";
}

export const echoChain = {
  match: runMatchChain,
  turn: runTurnChain,
  seal: runSealChain,
  voice: runVoiceChain,
};
