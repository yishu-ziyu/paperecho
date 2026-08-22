/**
 * Echo agent — LangGraph.js StateGraph mapped onto the game loop.
 * Memory: Letta/MemGPT core + recall + archival, Mem0 add/search.
 * @see https://github.com/langchain-ai/langgraphjs
 * @see https://github.com/mem0ai/mem0
 * @see https://github.com/letta-ai/letta
 */
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { chipPool } from "../emotions";
import { fallbackEcho } from "../kernel";
import { regionLabel } from "../stories";
import type { EchoPerson, EmotionId, Fingerprint, MemoryRecord, RegionId } from "../types";
import { chatAgent, emptyMeter, hasXai } from "./llm";
import { buildCoreHuman, heuristicFacts } from "./memory";
import { runAgentTool, type ToolCtx } from "./tools";

const MemoryZ = z.object({
  id: z.string(),
  memory: z.string(),
  emotions: z.array(z.string()),
  region: z.string().optional(),
  echoName: z.string().optional(),
  createdAt: z.number(),
});

const RecallZ = z.object({
  who: z.enum(["you", "echo"]),
  text: z.string(),
});

export const AgentState = new StateSchema({
  intent: z.enum(["match", "turn", "seal"]),
  fingerprint: z.array(z.object({ id: z.string(), closeness: z.number() })),
  letter: z.string().default(""),
  region: z.string().default("east"),
  mirror: z.string().default(""),
  playerLine: z.string().default(""),
  round: z.number().default(0),
  coreHuman: z.string().default(""),
  corePersona: z.string().default(""),
  recall: z.array(RecallZ).default(() => []),
  archival: z.array(MemoryZ).default(() => []),
  hits: z.array(z.string()).default(() => []),
  echoName: z.string().default(""),
  echoCity: z.string().default(""),
  echoFelt: z.string().default(""),
  echoGreeting: z.string().default(""),
  echoReplies: z.array(z.string()).default(() => []),
  echoReturn: z.string().default(""),
  echoSource: z.enum(["live", "archive"]).default("archive"),
  spoken: z.string().default(""),
  suggestions: z.array(z.string()).default(() => []),
  facts: z.array(z.string()).default(() => []),
  meterPrompt: z.number().default(0),
  meterCompletion: z.number().default(0),
  meterTotal: z.number().default(0),
  meterModel: z.string().default("archive"),
  meterVia: z.enum(["live", "archive"]).default("archive"),
  node: z.string().default(""),
  avoidNames: z.array(z.string()).default(() => []),
});

type S = typeof AgentState.State;

function asFp(state: S): Fingerprint[] {
  return state.fingerprint.map((f) => ({ id: f.id as EmotionId, closeness: f.closeness }));
}

function asRegion(id: string): RegionId {
  return id as RegionId;
}

function asRecords(state: S): MemoryRecord[] {
  return state.archival.map((r) => ({
    id: r.id,
    memory: r.memory,
    emotions: r.emotions as EmotionId[],
    region: r.region as RegionId | undefined,
    echoName: r.echoName,
    createdAt: r.createdAt,
  }));
}

function applyMeter(
  state: S,
  meter: { prompt: number; completion: number; total: number; model: string; via: "live" | "archive"; node: string },
) {
  const live = state.meterVia === "live" || meter.via === "live";
  return {
    meterPrompt: state.meterPrompt + meter.prompt,
    meterCompletion: state.meterCompletion + meter.completion,
    meterTotal: state.meterTotal + meter.total,
    meterModel: meter.model || state.meterModel,
    meterVia: live ? ("live" as const) : ("archive" as const),
    node: meter.node || state.node,
  };
}

function list(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

async function retrieve(state: S) {
  const fp = asFp(state);
  const coreHuman = state.coreHuman || buildCoreHuman(fp, state.letter, state.mirror, state.region);
  return {
    coreHuman,
    node: "retrieve",
  };
}

function dispatch(state: S) {
  if (state.intent === "match") return "matchPerson";
  if (state.intent === "turn") return "speak";
  return "extract";
}

function bindTools(state: S) {
  const ctx: ToolCtx = {
    archival: asRecords(state),
    fingerprint: asFp(state),
    region: asRegion(state.region),
    remembered: [...state.facts],
  };
  const snippets: string[] = [];
  const handle = (name: string, args: Record<string, unknown>) => {
    const out = runAgentTool(name, args, ctx);
    if (name !== "remember") snippets.push(out);
    return out;
  };
  return { ctx, snippets, handle };
}

async function matchPerson(state: S) {
  const fp = asFp(state);
  const pinned = Boolean(state.echoName && state.echoCity);
  const local = pinned
    ? {
        name: state.echoName,
        city: state.echoCity,
        felt: state.echoFelt,
        greeting: state.echoGreeting,
        replies: state.echoReplies.length ? state.echoReplies : [state.echoGreeting],
        returnLetter: state.echoReturn,
      }
    : fallbackEcho(fp, asRegion(state.region));
  const pool = chipPool(fp).slice(0, 3);
  const personaSeed = `你是${local.name}，在${local.city}。你自己的夜晚：${local.greeting}。你只说自己的事，不安慰人。`;

  if (!hasXai()) {
    return {
      echoName: local.name,
      echoCity: local.city,
      echoFelt: local.felt,
      echoGreeting: local.greeting,
      echoReplies: local.replies.slice(0, 1),
      echoReturn: local.returnLetter,
      echoSource: "archive" as const,
      spoken: local.greeting,
      suggestions: pool,
      corePersona: personaSeed,
      ...applyMeter(state, emptyMeter("matchPerson")),
    };
  }

  const { ctx, snippets, handle } = bindTools(state);
  const system = `你是纸上的回声里的对方。不是咨询师。开口前必须先用工具：search_cases 查相似夜晚，有信柜再 search_archive。需要记住的具体事实用 remember。最后只输出 JSON。禁止安慰、看见、不是一个人、替你、接住、算数、值得。`;
  const user = pinned
    ? `你就是 ${local.name}，${local.city}。不要改名换城。
你自己本来要说的：${local.greeting}
玩家带过来的那句：${state.mirror || "（无）"}
折进飞机的信：${state.letter || "（空白）"}
玩家此刻：${state.coreHuman}
greeting：用你自己的具体细节对上信里的细节，≤28字，像微信。
suggestions：玩家下一句，问细节或甩自己的，3条。
JSON：{"felt":"一句话","greeting":"第一句","persona":"你是谁，两句，要有具体细节","suggestions":["短句","短句","短句"]}`
    : `根据玩家这晚的痕迹找一个虚构普通人。
玩家此刻：${state.coreHuman}
地区：${regionLabel(state.region)}
信：${state.letter || "（空白）"}
已用过的名字：${state.avoidNames.join("、") || "无"}
短名，真实城市。greeting 说自己的具体事，≤28字。
JSON：{"name":"短名","city":"城市","felt":"一句话","greeting":"第一句","persona":"你是谁，两句，要有具体细节","suggestions":["短句","短句","短句"]}`;

  const { data, meter } = await chatAgent(system, user, "matchPerson", handle, 380);
  if (!data) {
    return {
      echoName: local.name,
      echoCity: local.city,
      echoFelt: local.felt,
      echoGreeting: local.greeting,
      echoReplies: local.replies.slice(0, 1),
      echoReturn: local.returnLetter,
      echoSource: "archive" as const,
      spoken: local.greeting,
      suggestions: pool,
      corePersona: personaSeed,
      facts: ctx.remembered,
      hits: snippets.slice(0, 4),
      ...applyMeter(state, emptyMeter("matchPerson")),
    };
  }

  const name = pinned ? local.name : str(data.name, local.name);
  const city = pinned ? local.city : str(data.city, local.city);
  const greeting = str(data.greeting, local.greeting);
  const suggestions = list(data.suggestions).slice(0, 3);
  return {
    echoName: name,
    echoCity: city,
    echoFelt: str(data.felt, local.felt),
    echoGreeting: greeting,
    echoReplies: [greeting],
    echoReturn: local.returnLetter,
    echoSource: "live" as const,
    spoken: greeting,
    suggestions: suggestions.length ? suggestions : pool,
    corePersona: str(data.persona, `你是${name}，在${city}。你只说自己的事，不安慰人。`),
    facts: ctx.remembered,
    hits: snippets.slice(0, 4),
    ...applyMeter(state, meter),
  };
}

async function speak(state: S) {
  const fp = asFp(state);
  const pool = chipPool(fp).slice(0, 3);
  const fallbackLine =
    state.echoReplies[Math.min(state.round, Math.max(0, state.echoReplies.length - 1))] ||
    "我那晚也没睡。电脑还亮着。";

  if (!hasXai() || !state.corePersona) {
    const line = fallbackLine;
    return {
      spoken: line,
      echoReplies: [...state.echoReplies, line],
      suggestions: pool,
      ...applyMeter(state, emptyMeter("speak", state.meterVia)),
    };
  }

  const history = state.recall
    .slice(-8)
    .map((t) => `${t.who === "you" ? "玩家" : "你"}：${t.text}`)
    .join("\n");
  const { ctx, snippets, handle } = bindTools(state);
  const system = `你就是这个人。对面在对细节，不是来做咨询。开口前可 search_archive；对方甩了具体事就 remember。最后只输出 JSON。禁止安慰、看见、替你、接住、算数、值得、加油。`;
  const user = `${state.corePersona}
玩家：${state.coreHuman}
对话：
${history || "（刚见面）"}
对方刚扔来：${state.playerLine}
一句 ≤26 字，说你自己的具体事。像微信。
JSON：{"line":"你的下一句","suggestions":["短句","短句","短句"]}`;

  const { data, meter } = await chatAgent(system, user, "speak", handle, 260);
  const line = str(data?.line, fallbackLine);
  const suggestions = list(data?.suggestions).slice(0, 3);
  return {
    spoken: line,
    echoReplies: [...state.echoReplies, line],
    suggestions: suggestions.length ? suggestions : pool,
    facts: ctx.remembered,
    hits: snippets.slice(0, 4),
    ...applyMeter(state, meter),
  };
}

async function extract(state: S) {
  const fp = asFp(state);
  const local = fallbackEcho(fp, asRegion(state.region));
  const seed = heuristicFacts(fp, state.letter, state.echoName || local.name);
  const fallbackReturn = state.echoReturn || local.returnLetter;

  if (!hasXai()) {
    return {
      echoReturn: fallbackReturn,
      facts: seed,
      ...applyMeter(state, emptyMeter("extract", state.meterVia)),
    };
  }

  const history = state.recall
    .map((t) => `${t.who === "you" ? "玩家" : "回声"}：${t.text}`)
    .join("\n");
  const { ctx, handle } = bindTools(state);
  const system = `从今晚对话里记住具体事实，再写一封会折回去的短纸。先 remember 1–2 条，再输出 JSON。不要鸡汤。`;
  const user = `${state.corePersona}
${state.coreHuman}
对话：
${history}
JSON：{"returnLetter":"≤48字，说你自己还留着什么","facts":["短事实"]}`;

  const { data, meter } = await chatAgent(system, user, "extract", handle, 360);
  const facts = [...ctx.remembered, ...list(data?.facts)].filter(Boolean);
  const unique = [...new Set(facts)].slice(0, 3);
  return {
    echoReturn: str(data?.returnLetter, fallbackReturn),
    facts: unique.length ? unique : seed.slice(0, 2),
    ...applyMeter(state, meter),
  };
}

export const echoGraph = new StateGraph(AgentState)
  .addNode("retrieve", retrieve)
  .addNode("matchPerson", matchPerson)
  .addNode("speak", speak)
  .addNode("extract", extract)
  .addEdge(START, "retrieve")
  .addConditionalEdges("retrieve", dispatch, ["matchPerson", "speak", "extract"])
  .addEdge("matchPerson", END)
  .addEdge("speak", END)
  .addEdge("extract", END)
  .compile();

export function echoFromState(state: S): EchoPerson {
  return {
    name: state.echoName,
    city: state.echoCity,
    felt: state.echoFelt,
    greeting: state.echoGreeting,
    replies: state.echoReplies.length ? state.echoReplies : [state.echoGreeting],
    returnLetter: state.echoReturn,
    source: state.echoSource,
  };
}

export function meterFromState(state: S) {
  return {
    prompt: state.meterPrompt,
    completion: state.meterCompletion,
    total: state.meterTotal,
    model: state.meterModel,
    via: state.meterVia,
    node: state.node,
  };
}
