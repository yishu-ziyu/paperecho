/**
 * Night agent — Pi harness (@earendil-works/pi-agent-core).
 * Same loop as Pi: prompt → tools → observe → prompt, until the model stops calling tools.
 * Environment is this game's world, not a filesystem: cases / archive / remember / arrive.
 * @see https://github.com/earendil-works/pi
 */
import { Agent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type, createModels } from "@earendil-works/pi-ai";
import type { Model } from "@earendil-works/pi-ai";
import { xaiProvider } from "@earendil-works/pi-ai/providers/xai";
import { chipPool } from "../emotions";
import { fallbackEcho } from "../kernel";
import { foreignPlace, regionLabel } from "../stories";
import type { EchoPerson, Fingerprint, MemoryRecord, RegionId, TokenMeter } from "../types";
import { emptyMeter, hasXai } from "./llm";
import { factsOf, ownLine, perceptionOf, renderBlocks, stolenVoice } from "./memory";
import { runAgentTool, type ToolCtx } from "./tools";

const GROK = {
  id: "grok-4.20-0309-non-reasoning",
  name: "Grok 4.20",
  api: "openai-completions" as const,
  provider: "xai",
  baseUrl: "https://api.x.ai/v1",
  input: ["text"] as const,
  contextWindow: 131072,
  maxTokens: 512,
  reasoning: false,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
} satisfies Model<"openai-completions">;

const RULES = `你是窗边那个人。只说自己今晚的具体事，像微信，一两句。
不安慰。禁止：看见、接住、值得、不是一个人、加油。
工具用协议调用，禁止把工具名写进句子。
开口前 search_cases，只用档案里这个人自己的细节。
# Human 是玩家以前的事，不是你的人生。禁止把 Human 的句子改成「我……」。最多点一下「你上次…」。
remember 只记玩家的原话或事，禁止记你自己的夜，禁止记「纸要折回去了」这类指令。
对玩家说的话只写在回复文本里。arrive 放下名字、城市、三句你这座城市的新细节（不能重复 Human，不能重复刚说的那句）。`;

export interface NightInput {
  fingerprint: Fingerprint[];
  letter: string;
  region: RegionId;
  mirror: string;
  archival: MemoryRecord[];
  coreHuman?: string;
  corePersona?: string;
  playerLine?: string;
  echo?: EchoPerson | null;
  avoidNames?: string[];
  session?: unknown[];
}

export interface NightResult {
  echo: EchoPerson;
  spoken: string;
  suggestions: string[];
  facts: string[];
  hits: string[];
  session: unknown[];
  persona: string;
  human: string;
  meter: TokenMeter;
}

let models: ReturnType<typeof createModels> | null = null;
function getModels() {
  if (!models) {
    models = createModels();
    models.setProvider(xaiProvider());
  }
  return models;
}

function lastAssistantText(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown };
    if (m?.role !== "assistant" || !Array.isArray(m.content)) continue;
    const text = m.content
      .filter((c): c is { type: "text"; text: string } => !!c && typeof c === "object" && (c as { type?: string }).type === "text")
      .map((c) => c.text)
      .join("")
      .trim();
    if (text) return cleanSpeak(text);
  }
  return "";
}

function stripTag(text: string, name: string, city: string): string {
  const t = text.trim();
  if (!name || !city) return t;
  const prefixes = [`${name}，${city}`, `${name}, ${city}`, `${name} · ${city}`, `${name}·${city}`, `${name} ${city}`];
  for (const p of prefixes) {
    if (t.startsWith(p)) return t.slice(p.length).replace(/^[，,.\s]+/, "").trim();
  }
  return t;
}

function cleanSpeak(text: string): string {
  const cut = text.replace(/(?:^|\n)\s*(?:arrive|search_cases|search_archive|remember)\b[\s\S]*$/i, "").trim();
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
    if (out && (out + s).length > 56) break;
    out += s;
    if (out.length >= 48) break;
  }
  return out || lines.slice(0, 1).join(" ").slice(0, 56);
}

function meterOf(messages: AgentMessage[], node: string): TokenMeter {
  let prompt = 0;
  let completion = 0;
  for (const raw of messages) {
    const m = raw as { role?: string; usage?: { input?: number; output?: number; totalTokens?: number }; model?: string };
    if (m.role !== "assistant" || !m.usage) continue;
    prompt += m.usage.input ?? 0;
    completion += m.usage.output ?? 0;
  }
  return {
    prompt,
    completion,
    total: prompt + completion,
    model: GROK.id,
    via: "live",
    node,
  };
}

function userFor(intent: "match" | "turn" | "seal", input: NightInput, perception: string): string {
  const who = input.echo;
  const first = !input.archival.length;
  const firstRule = first ? "今晚第一次见。禁止说你上次、你留着、你那晚。" : "Human 里的旧事最多点一下「你上次…」，绝不能变成「我……」。";
  if (intent === "match") {
    return [
      who ? `你就是 ${who.name}，${who.city}。不要改名换城。你本来的夜晚：${who.greeting}` : `还没有身份。从档案里认一个人，或起一个普通人的短名。禁止重复：${input.avoidNames?.join("、") || "无"}。地区：${regionLabel(input.region)}`,
      perception,
      `先 search_cases。只说你自己今晚的事，一两句。${firstRule}禁止把别人的城市、名字写进句子。`,
    ].join("\n");
  }
  if (intent === "turn") {
    return `对方扔到桌上：${input.playerLine || "（无）"}\n用你自己的一件新的具体事对，不要复述对方刚扔的那句。${firstRule}remember 只记对方这句。再说话，再 arrive。`;
  }
  return `纸要折回去了。remember 对方说过的具体事（不要记本句指令）。回信不超过 48 字：说你自己还留着哪件东西，不要问对方留没留。${firstRule}再 arrive。`;
}

export async function runNight(intent: "match" | "turn" | "seal", input: NightInput): Promise<NightResult> {
  const local = input.echo ?? fallbackEcho(input.fingerprint, input.region);
  const perception = perceptionOf(input.fingerprint, input.letter, input.mirror, input.region);
  const pool = chipPool(input.fingerprint).slice(0, 3);
  const live = {
    persona: input.corePersona || (input.echo ? `你是${input.echo.name}，在${input.echo.city}。${input.echo.greeting}` : ""),
    facts: factsOf(input.archival),
  };
  const archiveFallback = (): NightResult => ({
    echo: local,
    spoken: intent === "seal" ? local.returnLetter : local.greeting,
    suggestions: pool,
    facts: live.facts.slice(0, 2),
    hits: [],
    session: input.session ?? [],
    persona: live.persona || `你是${local.name}，在${local.city}。`,
    human: live.facts.join("\n"),
    meter: emptyMeter(intent),
  });

  if (!hasXai()) return archiveFallback();

  const ctx: ToolCtx = {
    archival: input.archival,
    fingerprint: input.fingerprint,
    region: input.region,
    remembered: [],
  };
  const hits: string[] = [];
  const arrival = {
    name: local.name,
    city: local.city,
    felt: local.felt,
    lines: [] as string[],
  };

  let agentRef: Agent | null = null;
  const refresh = () => {
    const prompt = `${RULES}\n\n${renderBlocks(live.persona, live.facts)}`;
    if (agentRef) agentRef.state.systemPrompt = prompt;
    return prompt;
  };

  const tool = (
    name: string,
    label: string,
    description: string,
    parameters: AgentTool["parameters"],
    execute: AgentTool["execute"],
  ): AgentTool => ({ name, label, description, parameters, execute });

  const tools: AgentTool[] = [
    tool("search_cases", "查档案", "查世界上相似夜晚的人：名字、城市、他们自己说过的具体事。", Type.Object({ query: Type.String() }), async (_id, params) => {
      const out = runAgentTool("search_cases", params as Record<string, unknown>, ctx);
      hits.push(out);
      return { content: [{ type: "text", text: out }], details: { query: (params as { query: string }).query } };
    }),
    tool("search_archive", "查信柜", "查玩家以前夜里留下的短事实。那是对方的事，不是你的嘴。", Type.Object({ query: Type.String() }), async (_id, params) => {
      const out = runAgentTool("search_archive", params as Record<string, unknown>, ctx);
      hits.push(out);
      return { content: [{ type: "text", text: out }], details: { query: (params as { query: string }).query } };
    }),
    tool("remember", "写下", "把一条关于玩家的具体事实写进 Human。必须是对方的事或原话，不要记你自己的夜。", Type.Object({ fact: Type.String() }), async (_id, params) => {
      const out = runAgentTool("remember", params as Record<string, unknown>, ctx);
      const fact = String((params as { fact: string }).fact ?? "").trim();
      if (fact.length >= 4 && !live.facts.includes(fact)) {
        live.facts = [fact, ...live.facts].slice(0, 10);
        refresh();
      }
      return { content: [{ type: "text", text: out }], details: { fact } };
    }),
    tool(
      "arrive",
      "落到桌上",
      "落下身份和你自己的三句新细节。已有名字时不要改名。三句必须是你这座城市的，不能抄 Human。",
      Type.Object({
        name: Type.Optional(Type.String()),
        city: Type.Optional(Type.String()),
        felt: Type.Optional(Type.String()),
        lines: Type.Array(Type.String()),
      }),
      async (_id, params) => {
        const p = params as { name?: string; city?: string; felt?: string; lines?: string[] };
        if (!input.echo) {
          if (p.name?.trim()) arrival.name = p.name.trim();
          if (p.city?.trim()) arrival.city = p.city.trim();
        }
        if (p.felt?.trim()) arrival.felt = p.felt.trim();
        if (Array.isArray(p.lines)) arrival.lines = p.lines.map((l) => String(l).trim()).filter(Boolean).slice(0, 3);
        live.persona = `你是${arrival.name}，在${arrival.city}。`;
        refresh();
        return { content: [{ type: "text", text: "已落到桌上。" }], details: arrival };
      },
    ),
  ];

  let turns = 0;
  const agent = new Agent({
    initialState: {
      systemPrompt: refresh(),
      model: GROK,
      thinkingLevel: "off",
      tools,
    },
    streamFn: getModels().streamSimple.bind(getModels()),
    getApiKey: async () => process.env.XAI_API_KEY,
    shouldStopAfterTurn: async () => {
      turns += 1;
      return turns >= 8;
    },
  });
  agentRef = agent;

  if (Array.isArray(input.session) && input.session.length) {
    agent.state.messages = input.session as AgentMessage[];
  }

  try {
    await Promise.race([
      agent.prompt(userFor(intent, input, perception)),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("timeout")), 18000);
      }),
    ]);
  } catch {
    if (!lastAssistantText(agent.state.messages)) return archiveFallback();
  }

  const raw = lastAssistantText(agent.state.messages) || (intent === "seal" ? local.returnLetter : local.greeting);
  const fallbacks = intent === "seal" ? [local.returnLetter, local.greeting, ...local.replies] : [local.greeting, ...local.replies];
  const spoken0 = stripTag(ownLine(raw, fallbacks, input.archival), arrival.name, arrival.city);
  const spoken =
    arrival.name && foreignPlace(spoken0, arrival.name, arrival.city)
      ? intent === "seal"
        ? local.returnLetter
        : local.greeting
      : spoken0;
  const ownReplies = [spoken, ...arrival.lines, ...local.replies].filter(
    (l, i, arr) => l && !stolenVoice(l, input.archival) && arr.indexOf(l) === i,
  );
  const echo: EchoPerson = {
    name: arrival.name,
    city: arrival.city,
    felt: arrival.felt || local.felt,
    greeting: intent === "match" ? spoken : local.greeting,
    replies: ownReplies.slice(0, 4),
    returnLetter: intent === "seal" ? spoken : local.returnLetter,
    source: "live",
  };

  return {
    echo,
    spoken,
    suggestions: arrival.lines.filter((l) => l && l !== spoken && !stolenVoice(l, input.archival)).slice(0, 3),
    facts: ctx.remembered.filter((f) => !/玩家靠近|今晚靠近/.test(f)),
    hits: hits.slice(-4),
    session: agent.state.messages as unknown[],
    persona: live.persona || `你是${echo.name}，在${echo.city}。`,
    human: live.facts.join("\n"),
    meter: meterOf(agent.state.messages, intent),
  };
}
