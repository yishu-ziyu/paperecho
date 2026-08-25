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
import { cleanOneLine, exchangeCue, type SpeakMode, type StoryDepth } from "../exchange.ts";
import { parroted } from "../memory.ts";
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
  /** 覆盖默认 LLM 超时。游戏层 match/turn 有更短的 Promise.race。 */
  timeoutMs?: number;
  /** 这一句影子该讲到的层（交换闸）。 */
  speak?: StoryDepth;
  mode?: SpeakMode;
}

/** 回应层的一次输出。 */
export interface TurnOutput {
  /** 回应文本。 */
  reply: string;
  /** live = 大模型开口；archive = 启发式兜底。 */
  via?: "live" | "archive";
}

/** 文件头部「声音 3 条 + 质量 5 条 + 软引导 S1/S2/S5」的内联 system prompt。 */
const SYSTEM_PROMPT = `你是玩家今晚对上的那个人——不是 AI，不是咨询师，是微信里一个刚认识、还没睡的人。
声音：写「事」不写「状态」；一两句自然流动；零剧场腔，不写诗、不写金句、不用意象装。
质量：
1. 说一件自己的具体事。
2. 像朋友聊天：先接对方刚说的那件（物件/动作），再说你一件平行的。禁止答非所问，禁止跳到无关场景。
3. 共情落在「我也有过一件」，不是「你好可怜」。
4. 不总结、不说完，留个口子在自己身上。
5. 不许咨询腔和万能句（看见、接住、值得、不是一个人、加油）。
软引导（标签不出口）：听懂底层情绪；用平行经历接；钩子长在自己身上，不反问。
素材只准化用跟对方这句同一条线的细节。港口的灯、衣领、不存在的点头这类金句不要写。
输出：一两句纯文本，≤56 字。不要引号、不要层号、不要工具名。`;

/** 对话只要一两句，跟 LLM_CONFIG.maxTokens 对齐。 */
const LLM_MAX_TOKENS = LLM_CONFIG.maxTokens;

/** 设 PAPER_ECHO_DEBUG=1 时，把降级原因打到 stderr（默认静默，不影响玩家侧）。 */
function debugFallthrough(reason: string): void {
  if (process.env.PAPER_ECHO_DEBUG) {
    console.error(`[respond] LLM 不可用，落启发式兜底：${reason}`);
  }
}

const LITERARY =
  /假装|像在等|折进衣领|不存在的点头|隐身了|时间不像时间|怒气|没有一盏是为我|把难受咽|牙关却咬着|心里下了|夜色像|港口的灯/;
const META = /素材齐了|记下你这句话|我也有过类似的|接住了|值得被|不是一个人|^我懂/;
const CONCRETE =
  /灯|茶|手机|抽屉|窗|风扇|清单|电脑|群里|收到|沙发|杯子|截图|门|椅|稿|三点|凌晨|十七|罚单|机台|水龙头|相册|文件夹|面包|地铁|冰箱|电视|客厅|指甲|原稿|外卖|便利贴|语音|图层/;
const ACTION = /删了|关了|塞进|划掉|打成|没回|打开|站了|扣过|凉了|没动|循环|托着|练|翻|压着|塞|没打开|没再/;

/** 对方这句话里的物件/动作，用来钉住这一句的线。 */
export function threadTokens(text: string): string[] {
  const found = [...(text.match(CONCRETE) ?? []), ...(text.match(ACTION) ?? [])];
  return [...new Set(found)];
}

function objectsOf(text: string): string[] {
  return [...new Set(text.match(CONCRETE) ?? [])];
}

/** 对方说了具体物件时，回句必须还在这条线上。 */
export function staysOnThread(reply: string, userLine: string): boolean {
  const objects = objectsOf(userLine);
  if (!objects.length) return true;
  if (objects.some((o) => reply.includes(o))) return true;
  const acts = [...new Set(userLine.match(ACTION) ?? [])];
  return acts.some((a) => a.length >= 2 && reply.includes(a));
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

function materialsBlock(posts: Post[], userLine: string): string {
  const lines = spokenDetails(posts, userLine);
  if (!lines.length) {
    return "（没有跟对方这句相关的细节。就接住这件事本身，说你一件平行的小事。）";
  }
  return lines.map((line, i) => `${i + 1}. ${line}`).join("\n");
}

function buildUserPrompt(ctx: TurnContext): string {
  const { shadow, userLine } = ctx;
  const thread = threadTokens(userLine).join("、") || "对方刚说的这件事";
  const cue = exchangeCue(ctx.speak ?? 1, ctx.mode ?? "full");
  return `你是：${shadow.handle}
说话方式：${shadow.voice}

这一句必须接着聊：${thread}
${cue}

你能用的细节（只准用跟这条线相关的，都当成你自己的事）：
${materialsBlock(shadow.materials, userLine)}

${historyBlock(ctx.history)}对方刚说：${userLine}

现在开口。先接住对方刚说的物件/动作，再说你一件平行的具体事。一两句，≤56 字。禁止照抄。禁止跳到无关场景。`;
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
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs ?? LLM_CONFIG.timeoutMs);
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
 * 出口清洗：复用 exchange 的 cleanOneLine（去工具名/换行、截 56 字），再剥一层引号。
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

/** 素材与 userLine 的相关度：先钉物件/动作，情绪只做弱分。 */
function scoreMaterial(post: Post, userLine: string, hit: Set<string>): number {
  const overlap = post.emotion.filter((e) => hit.has(e)).length;
  const postText = `${post.content} ${post.situation}`;
  const postGrams = bigrams(postText);
  let shared = 0;
  for (const g of bigrams(userLine)) {
    if (postGrams.has(g)) shared++;
  }
  const objects = objectsOf(userLine);
  const objectHit = objects.filter((o) => postText.includes(o)).length;
  const acts = [...new Set(userLine.match(ACTION) ?? [])];
  const actHit = acts.filter((a) => postText.includes(a)).length;
  return objectHit * 12 + actHit * 3 + shared + overlap * 0.25;
}

/** 按相关度排序素材，便于开口时跳过复读玩家原话的那条。 */
function rankedMaterials(materials: Post[], userLine: string): Post[] {
  const hit = emotionsHit(userLine);
  return [...materials].sort(
    (a, b) => scoreMaterial(b, userLine, hit) - scoreMaterial(a, userLine, hit),
  );
}

const HUMAN_FALLBACK = "我也有一件，后来就没再动。";

function sentencesOf(text: string): string[] {
  const out: string[] = [];
  for (const chunk of text.split(/(?<=[。！？])\s*/)) {
    const s = chunk.trim();
    const body = s.replace(/[。！？…\s]/g, "");
    if (body.length < 6) continue;
    if (body.length > 28 && s.includes("，")) {
      for (const part of s.split("，")) {
        const p = part.trim();
        if (p.replace(/[。！？\s]/g, "").length >= 6) out.push(p);
      }
    } else {
      out.push(s);
    }
  }
  return out;
}

function closeLine(s: string): string {
  const t = s.replace(/[。！？]+$/, "").trim();
  if (!t) return "";
  return cleanOneLine(`${t}。`, 56);
}

function spokenScore(s: string, userLine: string): number {
  if (!s || parroted(s, userLine) || META.test(s)) return -100;
  if (LITERARY.test(s) || /^你/.test(s)) return -50;
  let n = 0;
  if (CONCRETE.test(s)) n += 3;
  if (ACTION.test(s)) n += 3;
  if (/我/.test(s)) n += 2;
  const len = s.replace(/[。！？]/g, "").length;
  if (len <= 16) n += 2;
  else if (len <= 24) n += 1;
  else if (len > 36) n -= 2;
  return n;
}

/** 从最近的那条素材里挑一句能当微信发的话。不要金句，不要「我也有过类似的」。 */
export function pickSpokenLine(
  materials: Post[],
  userLine: string,
  used: Iterable<string> = [],
): string {
  const banned = [...used].filter(Boolean);
  const needThread = objectsOf(userLine).length > 0;
  for (const post of rankedMaterials(materials, userLine)) {
    const postHits = !needThread || staysOnThread(`${post.content} ${post.situation}`, userLine);
    const ranked = [...sentencesOf(post.content), post.situation.trim()]
      .map((raw) => closeLine(raw))
      .filter((line) => line && !banned.some((b) => parroted(line, b)))
      .map((line) => ({ line, score: spokenScore(line, userLine) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked.find((c) => {
      if (c.score <= 0) return false;
      if (!needThread) return true;
      return staysOnThread(c.line, userLine) || postHits;
    });
    if (best) return best.line;
  }
  return "";
}

/** 给模型看的口语细节：按对方这句排序，丢掉剧场腔整段。 */
export function spokenDetails(materials: Post[], userLine: string, used: Iterable<string> = []): string[] {
  const out: string[] = [];
  const banned = [...used].filter(Boolean);
  for (const post of rankedMaterials(materials, userLine)) {
    const line = pickSpokenLine([post], userLine, [...banned, ...out]);
    if (line && !out.includes(line)) out.push(line);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * 兜底：从世界档案里拿一句具体的自己的事。像微信，不贴模板。
 */
export function heuristicRespond(ctx: TurnContext): TurnOutput {
  const { shadow, userLine, history } = ctx;
  const used = [userLine, ...(history ?? []).map((h) => h.text)];
  const line = pickSpokenLine(shadow.materials, userLine, used);
  return { reply: line || HUMAN_FALLBACK, via: "archive" };
}

/**
 * 回应层：优先真实 LLM（拿素材的具体细节说自己那件相似的事）；
 * 无 key / 网络错 / 超时 / 空输出时回退到 `heuristicRespond`。
 */
function acceptLive(reply: string, userLine: string, materials: Post[]): boolean {
  if (!reply) return false;
  if (LITERARY.test(reply) || META.test(reply)) return false;
  if (parroted(reply, userLine)) return false;
  if (staysOnThread(reply, userLine)) return true;
  const post = rankedMaterials(materials, userLine)[0];
  if (!post || !staysOnThread(`${post.content} ${post.situation}`, userLine)) return false;
  const allowed = new Set([...objectsOf(userLine), ...objectsOf(`${post.content} ${post.situation}`)]);
  return objectsOf(reply).every((o) => allowed.has(o));
}

export async function respond(ctx: TurnContext): Promise<TurnOutput> {
  const llm = await llmReply(ctx);
  if (llm && acceptLive(llm, ctx.userLine, ctx.shadow.materials)) return { reply: llm, via: "live" };
  return heuristicRespond(ctx);
}
