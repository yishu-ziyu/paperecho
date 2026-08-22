/**
 * Paper Echo — 流水线 · 回应层（对话循环入口）
 *
 * 「倾听 → 搜索 → 整合 → 回应」的最后一环：给定合成影子（EchoShadow）与玩家这句话，
 * 从素材库里挑一条最相关的，开口回应，让整条闭环跑通。
 *
 * TODO(LLM)：本阶段 `respond` 是确定性/人肉启发式。未来换成 LLM 生成时：
 *   - 从 `shadow.materials` 取**具体细节**（时间/地点/动作/物件），而不是泛泛的情绪描述；
 *   - 遵守 `shadow.voice`（说话方式）与下面「对话质量规范」；
 *   - 保持 `TurnContext` / `TurnOutput` 契约不变，只替换本函数的内部实现。
 *
 * ── 对话质量规范（同时是未来 LLM 的 prompt 规范，见 docs/ai-architecture.md）──
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
import { EMOTIONS } from "../../emotions";
import type { EchoShadow } from "./persona";
import type { Post } from "./source";

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
 * 回应层最小实现：确定性/人肉启发式。
 *
 * 从 `ctx.shadow.materials` 挑一条与 `ctx.userLine` 最相关的素材，结合 `ctx.shadow.voice`
 * 的约束（骨架阶段 voice 是「说话方式描述」，不作为可拼贴文本，仅约束未来的 LLM；本模板
 * 天然守短句/白描），拼一句「我也有过类似的 + 素材具体细节」；素材库为空则给占位回应。
 */
export function respond(ctx: TurnContext): TurnOutput {
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
