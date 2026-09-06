/**
 * Paper Echo — 匹配评测 harness（Task 2A，纯确定性，无网络）。
 *
 * Before 执行链（baselineMatchFn 记录的就是它，Phase 1 冻结保留）：
 *   match 链 makeRuntime → `fallbackEcho(fingerprint, region, avoidNames)`
 *   → ownedOf(fp, 0.3) 取 feels → matchStory(feels, region, avoid)。
 *   matchStory 的评分 = 情绪 overlap×2 + region 相同 +1.4，只扫手写 STORIES
 *   （COLLECTED 不在候选池里，结构性不可见）；avoid 硬避让，全被避开才回退全池。
 *
 * After（Phase 2，本文件 newMatchFn 驱动）：`decideMatch`（./matching.ts）
 *   候选池 archiveStories()（STORIES + COLLECTED，22 条），三路 signal + 加权融合，
 *   anchor 定 Echo 身份；fallbackEcho 内部也改走 decideMatch（空 query → text 项为 0，
 *   由 emotion+region 决定）。baselineMatchFn 不再对拍 fallbackEcho——fallbackEcho
 *   已切换到新 matcher，对拍会循环引用两个实现；它作为 Before 记录原样冻结。
 *
 * 口径说明：fixture.emotions 直接当作产品链里 `ownedOf(fp, 0.3)` 之后的 feels 使用。
 * 等价性由测试断言（closeness=1 的 Fingerprint 喂 ownedOf(·, 0.3) 原样返回该集合）。
 */
import { ownedOf } from "../emotions.ts";
import { fallbackEcho } from "../kernel.ts";
import { STORIES } from "../stories.ts";
import type { EmotionId, Fingerprint, RegionId, Story } from "../types.ts";
import { archiveStories } from "./pipeline/sources/local.ts";
import { decideMatch } from "./matching.ts";
import { MATCH_FIXTURES, type MatchFixture } from "./matching.fixtures.ts";

export interface RankedMatchFn {
  (q: MatchFixture): { ranked: Story[]; top1: Story };
}

export interface FixtureResult {
  id: string;
  /** baseline 实际选出的 story id */
  top1: string;
  /** acceptableIds ∩ ranked.slice(0,3) 非空 */
  top3Hit: boolean;
  expected: string[];
  /** top1 命中 acceptableIds */
  pass: boolean;
}

export interface EvalReport {
  total: number;
  top1Hits: number;
  top3Hits: number;
  top1Rate: number;
  top3Rate: number;
  perFixture: FixtureResult[];
  /** COLLECTED 场景（acceptableIds 含 COLLECTED id）中 top1 命中的条数 */
  collectedTop1: number;
}

/** fixture.emotions → 等价 Fingerprint（closeness 全 1 ≥ 0.3，ownedOf 原样返回）。 */
export function fingerprintFromEmotions(emotions: EmotionId[]): Fingerprint[] {
  return emotions.map((id) => ({ id, closeness: 1 }));
}

/** 口径自检：ownedOf(fp, 0.3) 在 closeness=1 输入下原样返回 emotions。 */
export function feelsOfFixture(q: MatchFixture): EmotionId[] {
  return ownedOf(fingerprintFromEmotions(q.emotions), 0.3).map((f) => f.id);
}

/**
 * Before（Phase 1 冻结的 baseline，不再随产品代码变化）：
 * matchStory 的评分（overlap×2 + region 1.4，avoid 硬避让、池空才回退），
 * ranked 用同一评分全排序。排序用稳定 sort（分数相同保持数组原序），
 * 与 matchStory 内「严格大于才替换」的扫描结果一致，因此 top1 就是 Phase 1 时代
 * fallbackEcho 选出的身份。Phase 2 起 fallbackEcho 已切到 decideMatch，
 * 本函数只作为 Before 记录与对照数字的来源。
 */
export function baselineMatchFn(): RankedMatchFn {
  return (q) => {
    const region: RegionId = q.region ?? "east";
    const skip = new Set((q.avoid ?? []).filter(Boolean));
    const feels = feelsOfFixture(q);
    const scoreOf = (s: Story): number =>
      s.feels.filter((f) => feels.includes(f)).length * 2 + (s.region === region ? 1.4 : 0);
    // 真实链 matchStory 只扫 STORIES：COLLECTED 不进候选池。
    const eligible = STORIES.filter((s) => !skip.has(s.name));
    const pool = eligible.length ? eligible : [...STORIES];
    const ranked = pool.sort((a, b) => scoreOf(b) - scoreOf(a));
    return { ranked, top1: ranked[0]! };
  };
}

function collectedIds(): Set<string> {
  return new Set(
    archiveStories()
      .filter((s) => s.source === "collected")
      .map((s) => s.id),
  );
}

/** 池中 COLLECTED 数（供报告说明候选池构成）。 */
export function collectedAvailable(): number {
  return collectedIds().size;
}

/** 跑一份评估：top1/top3 命中 + 汇总 + COLLECTED 场景命中数。 */
export function evaluate(fn: RankedMatchFn): EvalReport {
  const collected = collectedIds();
  const perFixture = MATCH_FIXTURES.map((q) => {
    const { ranked, top1 } = fn(q);
    const top3 = ranked.slice(0, 3).map((s) => s.id);
    const pass = q.acceptableIds.includes(top1.id);
    return {
      id: q.id,
      top1: top1.id,
      top3Hit: q.acceptableIds.some((id) => top3.includes(id)),
      expected: q.acceptableIds,
      pass,
    } satisfies FixtureResult;
  });
  const total = perFixture.length;
  const top1Hits = perFixture.filter((r) => r.pass).length;
  const top3Hits = perFixture.filter((r) => r.top3Hit).length;
  const collectedScenarios = new Set(
    MATCH_FIXTURES.filter((q) => q.acceptableIds.some((id) => collected.has(id))).map((q) => q.id),
  );
  const collectedTop1 = perFixture.filter((r) => collectedScenarios.has(r.id) && r.pass).length;
  return {
    total,
    top1Hits,
    top3Hits,
    top1Rate: total ? top1Hits / total : 0,
    top3Rate: total ? top3Hits / total : 0,
    perFixture,
    collectedTop1,
  };
}

/**
 * fallbackEcho 的身份选择（name/city）——薄封装，保证评测侧不存在自己另造的映射。
 * Phase 2 起 fallbackEcho 内部走 decideMatch（空 query → emotion+region 决定）。
 */
export function fallbackIdentity(
  emotions: EmotionId[],
  region: RegionId,
  avoid: string[] = [],
): { name: string; city: string } {
  const echo = fallbackEcho(fingerprintFromEmotions(emotions), region, avoid);
  return { name: echo.name, city: echo.city };
}

/**
 * Phase 2 的新 matcher：decideMatch 驱动的 RankedMatchFn。
 * query = letter + mirror（fixtures 的处境文本），feels 用产品口径。
 */
export function newMatchFn(): RankedMatchFn {
  return (q) => {
    const decision = decideMatch({
      letter: q.letter,
      mirror: q.mirror,
      feels: feelsOfFixture(q),
      region: q.region ?? "east",
      avoid: q.avoid,
    });
    return { ranked: decision.ranked, top1: decision.anchor };
  };
}

// ---------------------------------------------------------------------------
// 查重：query 必须是语义改写，与任何 Story 原句无 ≥6 连续字重叠。
// 归一化 = 小写化 + 只保留字母/数字/汉字（去掉空白与标点，防「改标点抄原文」）。
// ---------------------------------------------------------------------------

const RUN = 6;

function normalize(text: string): string {
  return (text.toLowerCase().match(/[a-z0-9\u4e00-\u9fff]+/g) ?? []).join("");
}

/** 找出 query 与全池原句的第一处 ≥6 连续字重叠（调试用；无则 null）。 */
export function firstCopiedRun(query: string): string | null {
  const q = normalize(query);
  if (q.length < RUN) return null;
  for (const story of archiveStories()) {
    for (const text of [story.opening, ...story.lines, story.returnLetter]) {
      const t = normalize(text);
      for (let i = 0; i + RUN <= q.length; i++) {
        const run = q.slice(i, i + RUN);
        if (t.includes(run)) return run;
      }
    }
  }
  return null;
}

/** query 与全池（STORIES + COLLECTED）任意原句是否存在 ≥6 连续字重叠。 */
export function copiesStoryText(query: string): boolean {
  return firstCopiedRun(query) !== null;
}
