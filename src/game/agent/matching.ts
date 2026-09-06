/**
 * Paper Echo — 统一可解释匹配链（Task 2A）。
 *
 * 「为什么是这个人」必须来自同一条可解释的链：anchor Story 决定 Echo 是谁。
 * decideMatch 从 archiveStories()（手写 STORIES + 已 rewrite+QA 的 COLLECTED，22 条）
 * 里选出 anchor，并给出逐候选 evidence（textRank/emotionRank/regionRank/fusedRank/source）。
 *
 * - 纯函数：无网络、不读 localStorage/window、不取时间戳、同输入必同输出。
 * - 三路 signal（全池排序，并列 tie-break 一律 story.id 字典序）：
 *   1. text/situation：query（letter+mirror+playerLine）对 story 文本（opening+lines）
 *      的加权 token 覆盖率。token 复用 memory.tokensOf（CJK 单字+双字 + ASCII 词）；
 *      双字/词权重 1、单字 0.3（单字多为「我/的/了」级噪声）；idf = ln(N/df)，
 *      全池都有的 token 权重恰为 0。覆盖率 = 命中权重 / 该 story 全词权重，
 *      消除「长故事天然命中多」的偏置。禁止 exact-substring（baseline 的 includes 已证明无效）。
 *   2. emotion：story.feels ∩ query.feels 计数（保留 2 比 1 的强度差，不做 max 归一）。
 *   3. region：同 region 的二元偏好分（非过滤）。
 * - fusion：fused = TEXT_WEIGHT·(cov/maxCov) + emoOverlap + REGION_WEIGHT·sameRegion，
 *   maxCov=0（query 无有效 token）时 text 项整体为 0 → fallbackEcho 的空 query 路径
 *   自然退化为「emotion+region 决定」。
 *   为什么不是纯 RRF（k=10）：同一套 18 条 fixture、同一套 rank 函数下的实测对照
 *   （见 docs/matching-eval.md）：dense 变体在 textW=1..5 全部 17/18——f14 无解
 *   （它要 emotion 的 2v1 差让 s6 压过 text 近并列的替代者，rank 融合里「text#1 vs #2」
 *   只差一档，权重再大也只是同比例放大）；ordinal 变体 17/18（f14 落到 id 靠前的 s1）；
 *   k=60 时 f04 也丢。把 text 保留为连续分数、emotion/region 用原始计数/二元偏好，
 *   是 18 条全部通过的最小公式。
 * - avoid：与 matchStory 同语义——按 story.name 硬避让，池空才回退全池。
 * - supporting：fused 序中 anchor 之后、text rank ≤ SUPPORTING_TEXT_RANK_MAX（处境相关）
 *   的前 ≤2 条；不达标就是空数组。「一个人是一个人」：materials 里 anchor 永远第一。
 */
import type { EmotionId, RegionId, Story } from "../types.ts";
import { tokensOf } from "./memory.ts";
import { archiveStories } from "./pipeline/sources/local.ts";
import type { Post } from "./pipeline/source.ts";

export interface MatchQuery {
  /** 玩家折进飞机的原话（letterFromChips 产物；可为空串） */
  letter: string;
  /** 镜子句 */
  mirror?: string;
  /** 对话中的一句（turn 兜底路径用） */
  playerLine?: string;
  /** 产品口径 ownedOf(fp, 0.3) 之后的 feels */
  feels: EmotionId[];
  region: RegionId;
  /** 以前遇过的名字（story.name），硬避让 */
  avoid?: string[];
}

export interface CandidateEvidence {
  id: string;
  textRank: number;
  emotionRank: number;
  regionRank: number;
  fusedRank: number;
  source: "handwritten" | "collected";
}

export interface MatchDecision {
  anchor: Story;
  supporting: Story[];
  ranked: Story[];
  evidence: CandidateEvidence[];
}

/** text 项计 3 倍：eval 定出的最小可行权重（见文件头与 docs/matching-eval.md）。 */
export const TEXT_WEIGHT = 3;
/** region 是偏好不是过滤：同区 +0.3，远小于 baseline 的 1.4。 */
export const REGION_WEIGHT = 0.3;
/** supporting 的处境相关性闸：text rank 前 5 才配当「别人的夜」。 */
export const SUPPORTING_TEXT_RANK_MAX = 5;
/** live 帖入 supporting 的处境相关性下限（原始 idf 加权和；≈ 一个稀有大词/双字）。 */
export const LIVE_AFFINITY_MIN = 2;

const CHAR_TOKEN_WEIGHT = 0.3;

/**
 * query 侧的指代 bigram 不携带处境信息，匹配前剔掉：
 * - 「那/这」开头的双字（那句/那条/那句话里的 那句/那张/那边…）只是回指，不描述处境；
 * - 第二字是「我/你」的双字（话我/过我/让我…）是跨名词短语边界的切词伪影。
 * f14 的实证：query「那句话我…打完又删掉」会凭 那句/句话/话我 三个伪影 bigram
 * 命中 s5 的「那句话我没说完」，压过真正处境同线的 s6（删了三次+灯开着）。
 * 只剔 query 侧；story 侧原样保留（id 分母不受影响）。
 */
function isDeicticBigram(token: string): boolean {
  if (token.length !== 2) return false;
  return "那这".includes(token[0]!) || "我你".includes(token[1]!);
}

/** query 的匹配用 token：tokensOf 去掉指代 bigram。 */
function queryTokens(text: string): Set<string> {
  const tokens = tokensOf(text);
  for (const t of [...tokens]) {
    if (isDeicticBigram(t)) tokens.delete(t);
  }
  return tokens;
}

function tokenWeight(token: string): number {
  return token.length >= 2 ? 1 : CHAR_TOKEN_WEIGHT;
}

interface CorpusStats {
  /** token → ln(N/df)；全池都有 → 0 */
  idf: Map<string, number>;
  /** story id → 该 story 全部 token 的权重和（覆盖率的分母） */
  totalWeight: Map<string, number>;
  /** story id → token 集（opening+lines，不含 returnLetter/name/city） */
  tokens: Map<string, Set<string>>;
}

function buildStats(pool: Story[]): CorpusStats {
  const tokens = new Map<string, Set<string>>();
  const df = new Map<string, number>();
  for (const s of pool) {
    const set = tokensOf(`${s.opening}\n${s.lines.join("\n")}`);
    tokens.set(s.id, set);
    for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = pool.length;
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, d >= n ? 0 : Math.log(n / d));
  const totalWeight = new Map<string, number>();
  for (const s of pool) {
    let w = 0;
    for (const t of tokens.get(s.id)!) w += tokenWeight(t) * (idf.get(t) ?? 0);
    totalWeight.set(s.id, w);
  }
  return { idf, totalWeight, tokens };
}

/** story 文本被 query 覆盖的加权比例（0..1）。query 为空 → 全 0。 */
function coverageScores(pool: Story[], queryText: string, stats: CorpusStats): Map<string, number> {
  const q = queryTokens(queryText);
  const out = new Map<string, number>();
  for (const s of pool) {
    let shared = 0;
    for (const t of stats.tokens.get(s.id)!) {
      if (q.has(t)) shared += tokenWeight(t) * (stats.idf.get(t) ?? 0);
    }
    const total = stats.totalWeight.get(s.id) ?? 0;
    out.set(s.id, total > 0 ? shared / total : 0);
  }
  return out;
}

function emotionScores(pool: Story[], feels: EmotionId[]): Map<string, number> {
  const want = new Set(feels);
  return new Map(pool.map((s) => [s.id, s.feels.filter((f) => want.has(f)).length]));
}

function regionScores(pool: Story[], region: RegionId): Map<string, number> {
  return new Map(pool.map((s) => [s.id, s.region === region ? 1 : 0]));
}

/** 由分数出名次（dense：并列共享同一名次，下一组紧随 +1；组内按 id 序保证确定性）。 */
function denseRanks(scores: Map<string, number>): Map<string, number> {
  const ids = [...scores.keys()].sort((a, b) => {
    const d = scores.get(b)! - scores.get(a)!;
    return d !== 0 ? d : a.localeCompare(b);
  });
  const ranks = new Map<string, number>();
  let rank = 0;
  let prev: number | undefined;
  for (const id of ids) {
    const score = scores.get(id)!;
    if (prev === undefined || score !== prev) rank += 1;
    ranks.set(id, rank);
    prev = score;
  }
  return ranks;
}

function queryTextOf(query: Pick<MatchQuery, "letter" | "mirror" | "playerLine">): string {
  return [query.letter, query.mirror, query.playerLine]
    .filter((t) => Boolean(t?.trim()))
    .join(" ");
}

/** 评测/对照用：RRF 融合（Σ w/(k+rank)），只在本仓库的 eval 对照里出现。 */
export function decideMatchRRF(
  query: MatchQuery,
  opts: { k: number; textWeight: number; emotionDense: boolean } = {
    k: 10,
    textWeight: 1,
    emotionDense: true,
  },
): MatchDecision {
  const poolAll = archiveStories();
  const skip = new Set((query.avoid ?? []).filter(Boolean));
  const eligible = poolAll.filter((s) => !skip.has(s.name));
  const pool = eligible.length ? eligible : [...poolAll];

  const stats = buildStats(pool);
  const cov = coverageScores(pool, queryTextOf(query), stats);
  const emo = emotionScores(pool, query.feels);
  const reg = regionScores(pool, query.region);
  const textRanks = denseRanks(cov);
  const emoRanks = opts.emotionDense
    ? denseRanks(emo)
    : ordinalRanks(emo);
  const regRanks = denseRanks(reg);

  const fused = new Map<string, number>();
  for (const s of pool) {
    fused.set(
      s.id,
      opts.textWeight / (opts.k + textRanks.get(s.id)!) +
        1 / (opts.k + emoRanks.get(s.id)!) +
        1 / (opts.k + regRanks.get(s.id)!),
    );
  }
  return finishDecision(pool, fused, { cov, emo, reg, textRanks, emoRanks, regRanks });
}

/** ordinal 名次（并列按 id 展开）；与 denseRanks 对照实验用。 */
function ordinalRanks(scores: Map<string, number>): Map<string, number> {
  const ids = [...scores.keys()].sort((a, b) => {
    const d = scores.get(b)! - scores.get(a)!;
    return d !== 0 ? d : a.localeCompare(b);
  });
  return new Map(ids.map((id, i) => [id, i + 1]));
}

function finishDecision(
  pool: Story[],
  fused: Map<string, number>,
  signals: {
    cov: Map<string, number>;
    emo: Map<string, number>;
    reg: Map<string, number>;
    textRanks: Map<string, number>;
    emoRanks: Map<string, number>;
    regRanks: Map<string, number>;
  },
): MatchDecision {
  const ranked = [...pool].sort((a, b) => {
    const d = fused.get(b.id)! - fused.get(a.id)!;
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
  const evidence: CandidateEvidence[] = ranked.map((s, i) => ({
    id: s.id,
    textRank: signals.textRanks.get(s.id)!,
    emotionRank: signals.emoRanks.get(s.id)!,
    regionRank: signals.regRanks.get(s.id)!,
    fusedRank: i + 1,
    source: s.source ?? "handwritten",
  }));
  const anchor = ranked[0]!;
  const supporting = ranked
    .slice(1)
    .filter((s) => (signals.textRanks.get(s.id) ?? Number.MAX_SAFE_INTEGER) <= SUPPORTING_TEXT_RANK_MAX)
    .slice(0, 2);
  return { anchor, supporting, ranked, evidence };
}

/**
 * 统一入口：三路 signal + 加权线性融合，产出 MatchDecision。
 * 同输入必同输出；并列一律 id 字典序。
 */
export function decideMatch(query: MatchQuery): MatchDecision {
  const poolAll = archiveStories();
  const skip = new Set((query.avoid ?? []).filter(Boolean));
  const eligible = poolAll.filter((s) => !skip.has(s.name));
  const pool = eligible.length ? eligible : [...poolAll];

  const stats = buildStats(pool);
  const cov = coverageScores(pool, queryTextOf(query), stats);
  const emo = emotionScores(pool, query.feels);
  const reg = regionScores(pool, query.region);

  const maxCov = Math.max(0, ...cov.values());
  const fused = new Map<string, number>();
  for (const s of pool) {
    const textTerm = maxCov > 0 ? TEXT_WEIGHT * (cov.get(s.id)! / maxCov) : 0;
    fused.set(s.id, textTerm + (emo.get(s.id) ?? 0) + REGION_WEIGHT * (reg.get(s.id) ?? 0));
  }
  return finishDecision(pool, fused, {
    cov,
    emo,
    reg,
    textRanks: denseRanks(cov),
    emoRanks: denseRanks(emo),
    regRanks: denseRanks(reg),
  });
}

/**
 * live 帖的处境相关性闸：返回按相关度降序、≥ LIVE_AFFINITY_MIN 的前 cap 条。
 * idf 统计基于 archiveStories 池（与 decideMatch 同一套词权），确定性。
 */
export function pickLiveMaterials(queryText: string, posts: Post[], cap = 2): Post[] {
  const text = queryText.trim();
  if (!text || !posts.length) return [];
  const stats = buildStats(archiveStories());
  const q = queryTokens(text);
  const scored = posts.map((p) => {
    let shared = 0;
    for (const t of tokensOf(`${p.situation} ${p.content}`)) {
      if (q.has(t)) shared += tokenWeight(t) * (stats.idf.get(t) ?? 0);
    }
    return { p, n: shared };
  });
  return scored
    .filter((x) => x.n >= LIVE_AFFINITY_MIN)
    .sort((a, b) => b.n - a.n || a.p.content.localeCompare(b.p.content))
    .slice(0, cap)
    .map((x) => x.p);
}
