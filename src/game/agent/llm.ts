import type { TokenMeter } from "../types";
import { AGENT_TOOLS } from "./tools";

const MODEL = "grok-4.20-0309-non-reasoning"; // non-reasoning: grok-4.5 exceeds the HITL turn budget
const ENDPOINT = "https://api.x.ai/v1/chat/completions";

export function emptyMeter(node = "", via: TokenMeter["via"] = "archive"): TokenMeter {
  return { prompt: 0, completion: 0, total: 0, model: via === "archive" ? "archive" : MODEL, via, node };
}

export function addMeter(a: TokenMeter, b: TokenMeter): TokenMeter {
  return {
    prompt: a.prompt + b.prompt,
    completion: a.completion + b.completion,
    total: a.total + b.total,
    model: b.model && b.model !== "—" ? b.model : a.model,
    via: a.via === "live" || b.via === "live" ? "live" : "archive",
    node: b.node || a.node,
  };
}

export function hasXai(): boolean {
  return Boolean(process.env.XAI_API_KEY);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

async function complete(
  messages: ChatMsg[],
  node: string,
  maxTokens: number,
  withTools: boolean,
  forceFinal: boolean,
): Promise<{
  message: ChatMsg;
  meter: TokenMeter;
}> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return { message: { role: "assistant", content: "" }, meter: emptyMeter(node) };
  }
  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7,
  };
  if (withTools && !forceFinal) {
    body.tools = AGENT_TOOLS;
    body.tool_choice = "auto";
  }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) {
    return { message: { role: "assistant", content: "" }, meter: emptyMeter(node) };
  }
  const json = (await res.json()) as {
    choices?: { message?: ChatMsg }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    model?: string;
  };
  const message = json.choices?.[0]?.message ?? { role: "assistant" as const, content: "" };
  const meter: TokenMeter = {
    prompt: json.usage?.prompt_tokens ?? 0,
    completion: json.usage?.completion_tokens ?? 0,
    total: json.usage?.total_tokens ?? 0,
    model: json.model ?? MODEL,
    via: "live",
    node,
  };
  return { message, meter };
}

export async function chatAgent(
  system: string,
  user: string,
  node: string,
  handle: (name: string, args: Record<string, unknown>) => string,
  maxTokens = 320,
): Promise<{ data: Record<string, unknown> | null; meter: TokenMeter; raw: string; used: string[] }> {
  if (!hasXai()) {
    return { data: null, meter: emptyMeter(node), raw: "", used: [] };
  }
  const messages: ChatMsg[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  let meter = emptyMeter(node, "live");
  const used: string[] = [];
  try {
    for (let step = 0; step < 3; step++) {
      const forceFinal = step === 2;
      const { message, meter: m } = await complete(messages, node, maxTokens, true, forceFinal);
      meter = addMeter(meter, m);
      const calls = message.tool_calls ?? [];
      if (calls.length && !forceFinal) {
        messages.push({ role: "assistant", content: message.content ?? "", tool_calls: calls });
        for (const call of calls) {
          used.push(call.function.name);
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
          } catch {
            args = {};
          }
          const out = handle(call.function.name, args);
          messages.push({ role: "tool", tool_call_id: call.id, content: out });
        }
        continue;
      }
      const raw = message.content ?? "";
      return { data: parseJsonObject(raw), meter, raw, used };
    }
  } catch {
    return { data: null, meter, raw: "", used };
  }
  return { data: null, meter, raw: "", used };
}

export async function chatJson(
  prompt: string,
  maxTokens: number,
  node: string,
): Promise<{ data: Record<string, unknown> | null; meter: TokenMeter; raw: string }> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return { data: null, meter: emptyMeter(node), raw: "" };
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { data: null, meter: emptyMeter(node), raw: "" };
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      model?: string;
    };
    const raw = body.choices?.[0]?.message?.content ?? "";
    const meter: TokenMeter = {
      prompt: body.usage?.prompt_tokens ?? 0,
      completion: body.usage?.completion_tokens ?? 0,
      total: body.usage?.total_tokens ?? 0,
      model: body.model ?? MODEL,
      via: "live",
      node,
    };
    return { data: parseJsonObject(raw), meter, raw };
  } catch {
    return { data: null, meter: emptyMeter(node), raw: "" };
  }
}
