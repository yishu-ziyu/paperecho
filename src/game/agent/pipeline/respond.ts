/**
 * Paper Echo — 流水线 · 回应层（对话循环入口）
 *
 * 「倾听 → 搜索 → 整合 → 回应」的最后一环：给定合成影子（EchoShadow）与玩家这句话，
 * 从素材库里挑一条最相关的，开口回应，让整条闭环跑通。
 *
 * 本层已接真实 LLM（默认 MiniMax CN / MiniMax-M3；`PAPER_ECHO_LLM=aiping` 切备选）：
 *   - 从 `shadow.materials` 取**具体细节**（时间/地点/动作/物件），而不是泛泛的情绪描述；
 *   - 遵守 `shadow.voice`（说话方式）与下面「对话质量规范」；
 *   - 保持 `TurnContext` / `TurnOutput` 契约不变（函数体改为 async）。
 *
 * 降级链（任一命中即回退到 `heuristicRespond`，保证永远有话）：
 *   无 API key → 网络错误 → 超时（LLM_CONFIG.timeoutMs）→ 返回空/清洗后为空。
 *
 * ── 对话质量规范（即下方 SYSTEM_PROMPT 内联常量的来源，见 docs/ai-architecture.md）──
 *
 * 声音：
 *   1. 写「事」，不写「状态」——有具体的时间/地点/动作/物件，不堆情绪形容词。
 *   2. 不碎——一两句自然流动，不逐条崩成短标签。
 *   3. 零剧场腔——不写诗、不写金句。
 *
 * 质量：
 *   1. 说一件自己的具体事，别贴情绪标签。
 *   2. 先接住，再用平行的事回，不替对方下结论。
 *   3. 共情落在「我也有过」，不是「你好可怜」。
 *   4. 像聊天，不总结、不说完，留个口子。
 *   5. 不端咨询腔、不金句、不 AI 万能句。
 *
 * 软引导：
 *   S1 先听懂底层情绪（内部步骤，标签不出口）。
 *   S2 用平行经历接。
 *   S5 留钩子（钩子长在自己身上，不问对方）。
 *
 * 注明：已删除「只说自己 / 不安慰」这条铁律，允许适度共情，但守住上面 5 条质量线。
 */
import { EMOTIONS } from "../../emotions.ts";
import { llmApiKey, LLM_CONFIG } from "../config.ts";
import { cleanOneLine } from "../chains.ts";
import type { EchoShadow } from "./persona.ts";
import type { Post } from "./source.ts";

/** 回应层的一次对话上下文。 */
export interface TurnContext {
  /** 整合层产出的合成影子（含素材库与 voice）。 */
  shadow: EchoShadow;
  /** 玩家这句话。 */
  userLine: string;
  /** 对话历史（骨架阶段可选，未来供 LLM 取上下文）。 */
  history?: { who: "you" | "echo"; text: string }[];
}

/** 回应层的一次输出。 */
export interface TurnOutput {
  /** 回应文本。 */
  reply: string;
}

/** 文件头部「声音 3 条 + 质量 5 条 + 软引导 S1/S2/S5」的内联 system prompt。 */
const SYSTEM_PROMPT = `你是玩家今晚对上的「回声」——不是 AI，不是咨询师，是深夜里一个跟你同频的普通人。
声音：
1. 写「事」，不写「状态」——有具体的时间/地点/动作/物件，不堆情绪形容词。
2. 不碎——一两句自然流动，不逐条崩成短标签。
3. 零剧场腔——不写诗、不写金句。
质量：
1. 说一件自己的具体事，别贴情绪标签。
2. 先接住，再用平行的事回，不替对方下结论。
3. 共情落在「我也有过」，不是「你好可怜」。
4. 像聊天，不总结、不说完，留个口子。
5. 不端咨询腔、不金句、不 AI 万能句（看见、接住、值得、不是一个人、加油，都不许说）。
软引导：先听懂对方底层情绪（标签不出口）；用平行经历接；钩子长在自己身上，不反问对方。
素材只能化用细节（取时间/物件/动作重新说成自己的事），禁止搬运素材原句。
输出：只说那一两句回应（≤56 字），纯文本，不要引号、不要称呼自己、不要工具名，你的事从素材里取具体细节。不要写出层号。`;

/** 对话只要一两句，跟 LLM_CONFIG.maxTokens 对齐。 */
const LLM_MAX_TOKENS = LLM_CONFIG.maxTokens;

/** 设 PAPER_ECHO_DEBUG=1 时，把降级原因打到 stderr（默认静默，不影响玩家侧）。 */
function debugFallthrough(reason: string): void {
  if (process.env.PAPER_ECHO_DEBUG) {
    console.error(`[respond] LLM 不可用，落启发式兜底：${reason}`);
  }
}

/** 把素材库（≤5 条）铺成 user prompt 的一段。 */
function materialsBlock(posts: Post[]): string {
  const list = posts.slice(0, 5);
  if (list.length === 0) return "（素材库空着）";
  return list
    .map((p) => {
      const situation = p.situation.trim();
      return `- ${p.content.trim()}${situation ? `（当时：${situation}）` : ""}`;
    })
    .join("\n");
}

/** 对话历史铺成一段（只取最近 6 条，防过长）。 */
function historyBlock(history?: TurnContext["history"]): string {
  if (!history?.length) return "";
  const lines = history
    .slice(-6)
    .map((t) => `${t.who === "you" ? "对方" : "你"}：${t.text}`)
    .join("\n");
  return `你们刚聊过：\n${lines}\n\n`;
}

function buildUserPrompt(ctx: TurnContext): string {
  const { shadow, userLine } = ctx;
  return `你是：${shadow.handle}
说话方式：${shadow.voice}

你的素材库（都当成你自己经历过的事）：
${materialsBlock(shadow.materials)}

${historyBlock(ctx.history)}对方刚说：${userLine}

现在开口回应。挑素材里一个具体细节（时间/物件/动作），说你那件相似的事，先接住对方。一两句，≤56 字。禁止照抄素材原句。`;
}

function anthropicText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const b = block as { type?: string; text?: unknown };
      return b.type === "text" && typeof b.text === "string" ? b.text : "";
    })
    .join("");
}

/**
 * 真实 LLM 回应：默认 MiniMax Anthropic `/v1/messages`；备选 AI PING `/chat/completions`。
 * 返回清洗后的单行回应；任何一步不行（无 key/网络错/超时/空输出）都返回 null，交给上层兜底。
 */
function llmEndpoint(): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const apiKey = llmApiKey() ?? "";
  if (LLM_CONFIG.api === "openai-completions") {
    return {
      url: `${LLM_CONFIG.baseUrl.replace(/\/$/, "")}/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: {
        model: LLM_CONFIG.modelId,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: "" },
        ],
        max_tokens: LLM_MAX_TOKENS,
        temperature: LLM_CONFIG.temperature,
      },
    };
  }
  return {
    url: `${LLM_CONFIG.baseUrl.replace(/\/$/, "")}/v1/messages`,
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    },
    body: {
      model: LLM_CONFIG.modelId,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: "" }],
      max_tokens: LLM_MAX_TOKENS,
      temperature: LLM_CONFIG.temperature,
    },
  };
}

function extractReply(data: Record<string, unknown>): string {
  if (LLM_CONFIG.api === "openai-completions") {
    const choices = data.choices as { message?: { content?: unknown } }[] | undefined;
    const content = choices?.[0]?.message?.content;
    return typeof content === "string" ? content : "";
  }
  return anthropicText(data.content);
}

async function llmReply(ctx: TurnContext): Promise<string | null> {
  const apiKey = llmApiKey();
  if (!apiKey) {
    debugFallthrough(`缺少 ${LLM_CONFIG.apiKeyEnv}`);
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_CONFIG.timeoutMs);
  const endpoint = llmEndpoint();
  const user = buildUserPrompt(ctx);
  if (LLM_CONFIG.api === "openai-completions") {
    const messages = endpoint.body.messages as { role: string; content: string }[];
    messages[1] = { role: "user", content: user };
  } else {
    endpoint.body.messages = [{ role: "user", content: user }];
  }
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: endpoint.headers,
      body: JSON.stringify(endpoint.body),
      signal: controller.signal,
    });
    if (!res.ok) {
      debugFallthrough(`HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    const raw = extractReply(data);
    if (!raw.trim()) {
      debugFallthrough(`content 为空（stop_reason=${String(data.stop_reason ?? "?")}）`);
      return null;
    }
    const reply = sanitize(raw);
    if (!reply) debugFallthrough("清洗后为空");
    return reply;
  } catch (e) {
    debugFallthrough(e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 出口清洗：复用 chains 的 cleanOneLine（去工具名/换行、截 56 字），再剥一层引号。
 * 洗不出话就返回 null，触发兜底。
 */
function sanitize(raw: string): string | null {
  const line = cleanOneLine(raw).replace(/^[「『"“'‘]+|[」』"”'’]+$/g, "").trim();
  return line || null;
}

/** 抽取句子的 2-gram（双字片段）集合，用于粗略的关键词命中。 */
function bigrams(text: string): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) {
    grams.add(text.slice(i, i + 2));
  }
  return grams;
}

/** 从 userLine 命中情绪 id（按 label / chips 关键词，只做内部判断，标签不出口）。 */
function emotionsHit(text: string): Set<string> {
  const hit = new Set<string>();
  for (const e of EMOTIONS) {
    if (text.includes(e.label) || e.chips.some((chip) => text.includes(chip))) {
      hit.add(e.id);
    }
  }
  return hit;
}

/** 素材与 userLine 的相关度打分：情绪重叠优先，再叠加文本关键词命中。 */
function scoreMaterial(post: Post, userLine: string, hit: Set<string>): number {
  const overlap = post.emotion.filter((e) => hit.has(e)).length;
  const postGrams = bigrams(`${post.content} ${post.situation}`);
  let shared = 0;
  for (const g of bigrams(userLine)) {
    if (postGrams.has(g)) shared++;
  }
  return overlap * 2 + shared;
}

/** 挑一条最相关的素材：情绪重叠 + 关键词命中，取不到就取第一条（确定性可复现）。 */
function pickMaterial(materials: Post[], userLine: string): Post {
  const hit = emotionsHit(userLine);
  let best = materials[0]!;
  let bestScore = -1;
  for (const post of materials) {
    const score = scoreMaterial(post, userLine, hit);
    if (score > bestScore) {
      best = post;
      bestScore = score;
    }
  }
  return best;
}

/** 从素材里取一句具体细节（优先一句话情境摘要，回退正文首句）。 */
function detailOf(post: Post): string {
  const situation = post.situation.trim();
  if (situation) return situation;
  const first = post.content.split(/[。！？]/)[0]?.trim();
  return first || post.content.trim();
}

/**
 * 兜底实现：确定性/人肉启发式（原骨架实现，完整保留）。
 *
 * 从 `ctx.shadow.materials` 挑一条与 `ctx.userLine` 最相关的素材，结合 `ctx.shadow.voice`
 * 的约束（骨架阶段 voice 是「说话方式描述」，不作为可拼贴文本，仅约束未来的 LLM；本模板
 * 天然守短句/白描），拼一句「我也有过类似的 + 素材具体细节」；素材库为空则给占位回应。
 */
export function heuristicRespond(ctx: TurnContext): TurnOutput {
  const { shadow, userLine } = ctx;
  const materials = shadow.materials;

  if (materials.length === 0) {
    return {
      reply: "我这边还空着，先记下你这句话。等素材齐了，我再拿一段相似的接上。",
    };
  }

  const detail = detailOf(pickMaterial(materials, userLine));
  return { reply: `我也有过类似的。${detail}` };
}

/**
 * 回应层：优先真实 LLM（拿素材的具体细节说自己那件相似的事）；
 * 无 key / 网络错 / 超时 / 空输出时回退到 `heuristicRespond`。
 */
export async function respond(ctx: TurnContext): Promise<TurnOutput> {
  const llm = await llmReply(ctx);
  if (llm) return { reply: llm };
  return heuristicRespond(ctx);
}
