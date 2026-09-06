/**
 * 匹配评测验收测试（Task 2A）。
 *
 * Phase 1 部分：fixtures 质量规则 + baselineMatchFn（Before，冻结不动的旧评分）的数字。
 * Phase 2 部分：decideMatch（After）过 contract 门槛（Top1 ≥ 80%、Top3 ≥ 95%、
 * collectedTop1 ≥ 3）、region sanity、avoid、信号/融合单测、identity coherence e2e
 * （no-key fetch=0）、gatherShadow live 三态（经 liveSource 参数注入）。
 *
 * 关于旧「baselineMatchFn 与真实 fallbackEcho 逐条对拍」断言：fallbackEcho 自 Phase 2 起
 * 内部改走 decideMatch（contract 明确要求：候选池 = archiveStories，COLLECTED 可成为 display identity），
 * 再对拍会变成「新实现对拍新实现」。baselineMatchFn 保留为 Phase 1 冻结实现（Before 记录），
 * 对真实 fallbackEcho 的结构性断言见下方「fallbackEcho（空 query）走新 matcher」。
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMOTIONS, ownedOf } from "../emotions.ts";
import { REGIONS, STORIES, storyToEcho } from "../stories.ts";
import type { RegionId } from "../types.ts";
import { echoChain } from "./chains.ts";
import { decideMatch, SUPPORTING_TEXT_RANK_MAX } from "./matching.ts";
import {
  baselineMatchFn,
  collectedAvailable,
  copiesStoryText,
  evaluate,
  fingerprintFromEmotions,
  firstCopiedRun,
  newMatchFn,
} from "./matching.eval.ts";
import {
  MATCH_FIXTURES,
  type MatchFixture,
} from "./matching.fixtures.ts";
import { tokensOf } from "./memory.ts";
import { archiveStories } from "./pipeline/sources/local.ts";
import type { Post, PostSource } from "./pipeline/source.ts";
import { gatherShadow, type ToolCtx } from "./tools.ts";
import type { NightInput } from "./types.ts";

const POOL = archiveStories();
const COLLECTED_IDS = new Set(POOL.filter((s) => s.source === "collected").map((s) => s.id));

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function fixtureById(id: string): MatchFixture {
  const f = MATCH_FIXTURES.find((x) => x.id === id);
  assert.ok(f, `fixture ${id} 不存在`);
  return f;
}

function decideOf(f: MatchFixture) {
  return decideMatch({
    letter: f.letter,
    mirror: f.mirror,
    feels: fingerprintFromEmotions(f.emotions).map((x) => x.id),
    region: f.region ?? "east",
    avoid: f.avoid,
  });
}

describe("MATCH_FIXTURES 质量（Evaluator 1 的 fixture 规则）", () => {
  it("≥16 条、id 唯一、必填字段完整、答案与 avoid 都真实存在", () => {
    assert.ok(MATCH_FIXTURES.length >= 16, `fixtures 只有 ${MATCH_FIXTURES.length} 条`);
    assert.equal(new Set(MATCH_FIXTURES.map((f) => f.id)).size, MATCH_FIXTURES.length, "id 重复");
    const poolIds = new Set(POOL.map((s) => s.id));
    const poolNames = new Set(POOL.map((s) => s.name));
    for (const f of MATCH_FIXTURES) {
      assert.ok(f.letter.trim().length >= 10, `${f.id} letter 太短`);
      assert.ok(f.emotions.length >= 1, `${f.id} emotions 为空`);
      assert.ok(f.acceptableIds.length >= 1, `${f.id} acceptableIds 为空`);
      for (const id of f.acceptableIds) {
        assert.ok(poolIds.has(id), `${f.id} 答案 ${id} 不在候选池里`);
      }
      for (const name of f.avoid ?? []) {
        assert.ok(poolNames.has(name), `${f.id} avoid 的 ${name} 不在池里`);
      }
    }
  });

  it("emotions / region 都是合法枚举值", () => {
    const emotionIds = new Set(EMOTIONS.map((e) => e.id));
    const regionIds = new Set(REGIONS.map((r) => r.id));
    for (const f of MATCH_FIXTURES) {
      for (const e of f.emotions) {
        assert.ok(emotionIds.has(e), `${f.id} 有未知情绪 ${e}`);
      }
      if (f.region !== undefined) {
        assert.ok(regionIds.has(f.region as RegionId), `${f.id} 有未知 region ${f.region}`);
      }
    }
  });

  it("COLLECTED 场景 ≥6 条", () => {
    const n = MATCH_FIXTURES.filter((f) => f.acceptableIds.some((id) => COLLECTED_IDS.has(id))).length;
    assert.ok(n >= 6, `COLLECTED 场景只有 ${n} 条`);
  });

  it("每条 query（letter+mirror）都不与任何 Story 原句有 ≥6 连续字重叠", () => {
    for (const f of MATCH_FIXTURES) {
      assert.equal(copiesStoryText(f.letter), false, `${f.id} letter 抄了 Story 原句：${firstCopiedRun(f.letter)}`);
      if (f.mirror !== undefined) {
        assert.equal(
          copiesStoryText(f.mirror),
          false,
          `${f.id} mirror 抄了 Story 原句：${firstCopiedRun(f.mirror)}`,
        );
      }
    }
  });
});

describe("harness 诚实性（口径自检 + Before 冻结）", () => {
  it("fixture.emotions 就是产品口径 ownedOf(fp, 0.3) 的输出（closeness=1 等价输入）", () => {
    for (const f of MATCH_FIXTURES) {
      const feels = ownedOf(fingerprintFromEmotions(f.emotions), 0.3).map((x) => x.id);
      assert.deepEqual(feels, f.emotions, `${f.id} 的 emotions 经 ownedOf 后变了`);
    }
  });

  it("fallbackEcho（空 query）走新 matcher：display identity 必出自 safe candidate pool（archiveStories）", () => {
    // Phase 2 起 fallbackEcho 内部 = decideMatch(空 query)；COLLECTED 也可以成为 display identity，
    // 这里断言的是结构性事实（identity 来自 safe candidate pool），不再逐条对拍旧评分。
    const identities = new Set(POOL.map((s) => `${storyToEcho(s).name}/${storyToEcho(s).city}`));
    for (const f of MATCH_FIXTURES) {
      const id = fallbackIdentityFor(f);
      assert.ok(identities.has(id), `${f.id} fallback 身份 ${id} 不在池里`);
    }
  });

  it("baseline 排名全部来自手写池（Before 的结构性事实，冻结复核）", () => {
    assert.ok(collectedAvailable() >= 6, "池里应有预采集改写稿");
    const handwritten = new Set(STORIES.map((s) => s.id));
    for (const f of MATCH_FIXTURES) {
      const { ranked } = baselineMatchFn()(f);
      assert.ok(
        ranked.every((s) => handwritten.has(s.id)),
        `${f.id} 的 ranked 混入了手写池之外的 story`,
      );
    }
  });
});

function fallbackIdentityFor(f: MatchFixture): string {
  // display identity = decideMatch(空 query) → storyToEcho(anchor) 的 name/city，与 kernel.fallbackEcho 同一条链。
  const d = decideMatch({
    letter: "",
    feels: fingerprintFromEmotions(f.emotions).map((x) => x.id),
    region: f.region ?? "east",
    avoid: f.avoid,
  });
  const echo = storyToEcho(d.anchor);
  return `${echo.name}/${echo.city}`;
}

describe("evaluate(baselineMatchFn) — Before 数字（Phase 1 冻结）", () => {
  it("指标自洽，并打印每条 fixture 的 baseline 结果（输出即证据）", () => {
    const fn = baselineMatchFn();
    const report = evaluate(fn);
    assert.equal(report.total, MATCH_FIXTURES.length);
    for (const r of report.perFixture) {
      const f = fixtureById(r.id);
      assert.equal(r.pass, f.acceptableIds.includes(r.top1), `${r.id} pass 判定不诚实`);
      const { ranked } = fn(f);
      assert.equal(
        r.top3Hit,
        f.acceptableIds.some((id) => ranked.slice(0, 3).map((s) => s.id).includes(id)),
        `${r.id} top3Hit 判定不诚实`,
      );
    }
    console.log(
      `\n=== Before（matchStory：overlap×2 + region 1.4，STORIES-only；COLLECTED 池 ${collectedAvailable()} 条不可见）===`,
    );
    console.log(`Top1 ${report.top1Hits}/${report.total} (${(report.top1Rate * 100).toFixed(1)}%)  ` +
      `Top3 ${report.top3Hits}/${report.total} (${(report.top3Rate * 100).toFixed(1)}%)  ` +
      `collectedTop1 ${report.collectedTop1}`);
  });
});

describe("decideMatch（After）— contract Evaluator 1 门槛", () => {
  const fn = newMatchFn();
  const report = evaluate(fn);

  it("Top1 ≥ 80%", () => {
    assert.ok(report.top1Rate >= 0.8, `Top1 ${report.top1Hits}/${report.total} = ${(report.top1Rate * 100).toFixed(1)}%`);
  });

  it("Top3 ≥ 95%", () => {
    assert.ok(report.top3Rate >= 0.95, `Top3 ${report.top3Hits}/${report.total} = ${(report.top3Rate * 100).toFixed(1)}%`);
  });

  it("≥3 条 COLLECTED 场景 acceptable Top-1", () => {
    assert.ok(report.collectedTop1 >= 3, `collectedTop1 只有 ${report.collectedTop1}`);
  });

  it("打印 After 每条结果（输出即证据）", () => {
    console.log(`\n=== After（decideMatch：text 覆盖率×3 + emotion 计数 + region 0.3，池 ${POOL.length} 条）===`);
    for (const r of report.perFixture) {
      const f = fixtureById(r.id);
      const d = decideOf(f);
      const ev = d.evidence.find((e) => e.id === d.anchor.id)!;
      const echo = storyToEcho(d.anchor);
      const source = d.anchor.source ?? "handwritten";
      console.log(
        `${pad(r.id, 5)}${pad(`${r.top1} ${echo.name}/${echo.city} source=${source}`, 42)}${pad(`exp=${r.expected.join("|")}`, 14)}${pad(r.pass ? "hit" : "MISS", 6)}${r.top3Hit ? "hit" : "miss"}  text#${ev.textRank} emo#${ev.emotionRank} region#${ev.regionRank}`,
      );
    }
    console.log(
      `Top1 ${report.top1Hits}/${report.total} (${(report.top1Rate * 100).toFixed(1)}%)  ` +
        `Top3 ${report.top3Hits}/${report.total} (${(report.top3Rate * 100).toFixed(1)}%)  ` +
        `collectedTop1 ${report.collectedTop1}`,
    );
    // 输出里的断言再落一次地：打印的每条都必须与重跑一致（确定性）。
    for (const r of report.perFixture) {
      const again = evaluate(fn).perFixture.find((x) => x.id === r.id)!;
      assert.equal(again.top1, r.top1, `${r.id} 两次评估结果不一致（harness 不确定性）`);
    }
  });
});

describe("decideMatch 单元：信号 / evidence / supporting / 确定性", () => {
  it("evidence 与 ranked 对齐，anchor 必为 fused#1，supporting ≤2 且 textRank ≤ SUPPORTING_TEXT_RANK_MAX、coverage > 0", () => {
    for (const f of MATCH_FIXTURES) {
      const d = decideOf(f);
      assert.equal(d.evidence.length, d.ranked.length, `${f.id} evidence 与 ranked 不对齐`);
      assert.equal(d.evidence[0]!.id, d.anchor.id, `${f.id} evidence[0] 不是 anchor`);
      assert.equal(d.evidence[0]!.fusedRank, 1, `${f.id} anchor 不是 fused#1`);
      assert.ok(d.ranked.every((s) => d.evidence.some((e) => e.id === s.id && e.fusedRank === d.ranked.indexOf(s) + 1)));
      assert.ok(d.supporting.length <= 2, `${f.id} supporting 超过 2 条`);
      const query = [f.letter, f.mirror].filter((t) => t?.trim()).join(" ");
      for (const s of d.supporting) {
        const ev = d.evidence.find((e) => e.id === s.id)!;
        assert.ok(ev.textRank <= SUPPORTING_TEXT_RANK_MAX, `${f.id} supporting ${s.id} text#${ev.textRank} 不达标`);
        // 正相关闸（review Finding 1B）：零文本相关的 Story 不得成为 supporting。
        const storyText = `${s.opening}\n${s.lines.join("\n")}`;
        assert.ok(
          [...tokensOf(query)].some((t) => tokensOf(storyText).has(t)),
          `${f.id} supporting ${s.id} 与 query 无任何共享 token`,
        );
        assert.notEqual(s.id, d.anchor.id);
      }
    }
  });

  it("空 query（fallbackEcho 路径）：text 榜全并列，由 emotion+region 决定", () => {
    const d = decideMatch({ letter: "", feels: ["anxious"], region: "america" });
    assert.ok(d.evidence.every((e) => e.textRank === 1), "空 query 的 text 榜应全并列");
    // america + anxious：情绪计数并列，region 同区者（s3/s8）领先，id 序收尾 → s3。
    assert.equal(d.anchor.id, "s3");
  });

  it("text signal：处境词决定 textRank（f03 的 s12 是 text#1，尽管 region 不合）", () => {
    const d = decideOf(fixtureById("f03"));
    const ev = d.evidence.find((e) => e.id === "s12")!;
    assert.equal(ev.textRank, 1);
  });

  it("同输入必同输出（确定性）", () => {
    const f = fixtureById("f15");
    const a = decideOf(f);
    const b = decideOf(f);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  });

  it("avoid 硬避让：被避开的名字不出现在 ranked（f14 不含 Mara），池空才回退全池", () => {
    const d14 = decideOf(fixtureById("f14"));
    assert.equal(d14.ranked.some((s) => s.name === "Mara"), false);
    const everything = POOL.map((s) => s.name);
    const dAll = decideMatch({ letter: "", feels: ["tired"], region: "east", avoid: everything });
    assert.ok(dAll.ranked.length === POOL.length, "全被避开时应回退全池");
  });

  it("supporting 是 anchor 之后的处境相关者，anchor 自己不在其中", () => {
    const d = decideOf(fixtureById("f08"));
    assert.equal(d.anchor.id, "c002");
    assert.ok(!d.supporting.some((s) => s.id === "c002"));
  });
});

describe("region sanity / avoid（contract Evaluator 1 尾两条）", () => {
  it("B 高文本相关不因 region 不同被 A 稳定压过（f03/f06/f07 都是跨 region 的 text#1 取胜）", () => {
    for (const id of ["f03", "f06", "f07"]) {
      const f = fixtureById(id);
      const d = decideOf(f);
      const ev = d.evidence.find((e) => e.id === d.anchor.id)!;
      assert.equal(d.anchor.id, f.acceptableIds[0], `${id} anchor 应为 ${f.acceptableIds[0]}`);
      assert.equal(ev.textRank, 1, `${id} anchor 应是 text#1`);
      assert.notEqual(ev.regionRank, 1, `${id} anchor 不应在该 query 的 region 内（region 只是偏好）`);
    }
  });

  it("region 一致时偏好仍在生效（对照：f05 的 anchor 就在同区）", () => {
    const ev = decideOf(fixtureById("f05")).evidence.find((e) => e.id === "s4")!;
    assert.equal(ev.regionRank, 1);
  });

  it("avoid 后存在合理替代时必须选替代（f14：避开 Mara → s6，而不是退回不相关的人）", () => {
    const d = decideOf(fixtureById("f14"));
    assert.equal(d.anchor.id, "s6");
  });
});

// ---------------------------------------------------------------------------
// Identity coherence e2e（contract Evaluator 2）：no-key、无假流、fetch=0。
// decideMatch 选出的 anchor Story 必须唯一决定 display identity（Echo.name/city）与
// anchor narrative source（greeting/replies/returnLetter 种子）；material provenance：
// shadow materials 首位含 anchor 自己的 story 行，hits 里有 anchor 证据行。
// ---------------------------------------------------------------------------

function matchInput(f: MatchFixture): NightInput {
  return {
    fingerprint: fingerprintFromEmotions(f.emotions),
    letter: f.letter,
    mirror: f.mirror ?? "",
    region: f.region ?? "east",
    archival: [],
    recall: [],
    round: 0,
    echo: null,
    avoidNames: f.avoid ?? [],
    session: [],
  };
}

async function withoutNetwork<T>(fn: () => Promise<T>): Promise<{ out: T; fetchCalls: number }> {
  const savedKey = process.env.MINIMAX_CN_API_KEY;
  const savedAlt = process.env.AI_PING_API_KEY;
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((..._args: unknown[]) => {
    calls += 1;
    throw new Error("network must not be touched without a key");
  }) as typeof fetch;
  delete process.env.MINIMAX_CN_API_KEY;
  delete process.env.AI_PING_API_KEY;
  try {
    return { out: await fn(), fetchCalls: calls };
  } finally {
    globalThis.fetch = realFetch;
    if (savedKey !== undefined) process.env.MINIMAX_CN_API_KEY = savedKey;
    if (savedAlt !== undefined) process.env.AI_PING_API_KEY = savedAlt;
  }
}

describe("identity coherence e2e（no-key，fetch=0）", () => {
  it("COLLECTED anchor（f08 → c002）：阿枳/厦门，returnLetter/greeting/materials/hits 全部同源", async () => {
    const c002 = POOL.find((s) => s.id === "c002")!;
    const { out: res, fetchCalls } = await withoutNetwork(() => echoChain.match(matchInput(fixtureById("f08"))));
    assert.equal(fetchCalls, 0, "no-key match 不得触网");
    assert.equal(res.echo.name, c002.name);
    assert.equal(res.echo.city, c002.city);
    assert.equal(res.echo.returnLetter, c002.returnLetter, "returnLetter 必须是 anchor 原文");
    assert.equal(res.echo.greeting, c002.lines[0], "no-key 开口 = anchor 自己的行");
    const joined = res.hits.join("\n");
    assert.ok(joined.includes("anchor=c002"), `hits 缺 anchor 证据行：${joined.slice(0, 200)}`);
    assert.ok(joined.includes(c002.lines[0]!), "shadow 首材料应含 anchor 自己的行");
    assert.equal(res.match?.anchorId, "c002");
    assert.equal(res.match?.anchorSource, "collected");
    assert.equal(res.match?.top[0]?.id, "c002");
  });

  it("STORIES anchor（f01 → s1）：林予/杭州，同一条链同源", async () => {
    const s1 = POOL.find((s) => s.id === "s1")!;
    const { out: res, fetchCalls } = await withoutNetwork(() => echoChain.match(matchInput(fixtureById("f01"))));
    assert.equal(fetchCalls, 0);
    assert.equal(res.echo.name, s1.name);
    assert.equal(res.echo.city, s1.city);
    assert.equal(res.echo.returnLetter, s1.returnLetter);
    const joined = res.hits.join("\n");
    assert.ok(joined.includes("anchor=s1"));
    assert.ok(joined.includes(s1.lines[0]!));
    assert.equal(res.match?.anchorSource, "handwritten");
    // material provenance 不分裂：greeting/replies 的种子全部来自 anchor Story s1。
    for (const line of res.echo.replies.slice(0, s1.lines.length)) {
      assert.equal(
        [...s1.lines, s1.opening].some((own) => line === own || line === res.echo.greeting),
        true,
        `replies 出现非 anchor 的行：${line}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// gatherShadow live 三态（contract Evaluator 3）：经 liveSource 参数注入 fake/slow/failed。
// ---------------------------------------------------------------------------

function livePost(content: string): Post {
  // raw live discovery 的结构证明：Post 类型上没有 name/city 字段。
  return { platform: "web", content, emotion: ["tired"], situation: "现场摘要" };
}

function baseCtx(): ToolCtx {
  return {
    archival: [],
    fingerprint: [
      { id: "tired", closeness: 0.9 },
      { id: "unseen", closeness: 0.8 },
    ],
    region: "east",
    remembered: [],
    story: "我改到很晚，群里只回了收到。",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("gatherShadow live 三态（注入 fake/slow/failed liveSource）", () => {
  it("local ≥5 时 live 仍被调用（库满不再跳过 live）", async () => {
    let calls = 0;
    const src: PostSource = {
      id: "fake:live",
      async search() {
        calls += 1;
        return [livePost("现场帖：凌晨的便利店里我把关东煮捧了很久。")];
      },
    };
    const shadow = await gatherShadow(baseCtx(), true, src);
    assert.equal(calls, 1, "live 应始终被启动");
    assert.ok(shadow.materials.length >= 5, "库素材仍是主体");
  });

  it("slow live 超预算不挡 match：local 结果先返回，slow 帖不进素材", async () => {
    const saved = process.env.PAPER_ECHO_LIVE_MS;
    process.env.PAPER_ECHO_LIVE_MS = "60";
    const src: PostSource = {
      id: "fake:slow",
      async search() {
        await sleep(1500);
        return [livePost("slow 帖：这条不该出现在素材里。")];
      },
    };
    const started = Date.now();
    try {
      const shadow = await gatherShadow(baseCtx(), true, src);
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 1000, `gatherShadow 被 slow live 拖到 ${elapsed}ms`);
      assert.ok(shadow.materials.length >= 5);
      assert.equal(shadow.materials.some((p) => p.content.includes("slow 帖")), false);
    } finally {
      if (saved === undefined) delete process.env.PAPER_ECHO_LIVE_MS;
      else process.env.PAPER_ECHO_LIVE_MS = saved;
    }
  });

  it("failed live → 纯 local 正常返回", async () => {
    const src: PostSource = {
      id: "fake:fail",
      async search() {
        throw new Error("boom");
      },
    };
    const shadow = await gatherShadow(baseCtx(), true, src);
    const localOnly = await gatherShadow(baseCtx(), false);
    assert.deepEqual(shadow.materials, localOnly.materials);
    assert.ok(shadow.materials.length >= 5);
  });

  it("raw live discovery 结构上无法成为 display identity：Post 无 name/city；anchor 恒出自 safe candidate pool（archiveStories = STORIES + COLLECTED）", async () => {
    const p = livePost("现场帖：我把台灯搬到窗边，纸箱还没拆。");
    assert.equal("name" in p, false);
    assert.equal("city" in p, false);
    const poolIds = new Set(POOL.map((s) => s.id));
    for (const f of MATCH_FIXTURES) {
      const d = decideOf(f);
      assert.ok(poolIds.has(d.anchor.id), `${d.anchor.id} 不在池里`);
      assert.ok(
        ["handwritten", "collected"].includes(d.anchor.source ?? "handwritten"),
        "anchor source 只能是 handwritten/collected",
      );
    }
  });

  it("Test B — zero-affinity supporting：全池 coverage=0 的 dense 并列不得自动产生 supporting", () => {
    // 空 query：所有候选 coverage=0、dense textRank 并列 1。旧闸（只看 rank）会让
    // anchor 之后的任意两条成为 supporting；coverage > 0 闸必须一票否决。
    const d = decideMatch({ letter: "", feels: ["tired"], region: "east" });
    assert.ok(d.evidence.every((e) => e.textRank === 1), "空 query 的 text 榜应全并列");
    assert.equal(d.supporting.length, 0, "零文本相关时不得出现 supporting");
  });

  it("Test C — approved supporting 仍可用：真实相关的 supporting 进入 generation materials", async () => {
    // f10（厨房/冰箱/洗碗）锚定 c008，c014 共享「冰箱/嗡嗡」处境词，是真正的 approved supporting。
    const d = decideOf(fixtureById("f10"));
    assert.equal(d.anchor.id, "c008");
    assert.ok(d.supporting.length >= 1, "真实相关的 supporting 应获批准");
    const { out: res } = await withoutNetwork(() => echoChain.match(matchInput(fixtureById("f10"))));
    const blob = res.hits.find((h) => h.includes("\n---\n")) ?? "";
    for (const s of d.supporting) {
      assert.ok(blob.includes(s.lines[0]!), `approved supporting ${s.id} 应进入 respond materials`);
    }
  });
});

// ---------------------------------------------------------------------------
// review 第二轮（docs/contract-matching-review-fixes.md）：generation material allowlist + raw live discovery-only。
// ---------------------------------------------------------------------------

/** hits 里那份 world-archive blob（= respond 实际收到的 materials 的原文块）。 */
function materialsBlob(hits: string[]): string {
  return hits.find((h) => h.includes("\n---\n")) ?? "";
}

describe("Finding 1 — match generation material allowlist（anchor Story + approved supporting Stories）", () => {
  it("Test A — generation material allowlist 之外的 Story 不得出现在 respond materials（含 userLine 高相关者）", async () => {
    // f08 锚定 c002（车间/模具/十二小时白班）。旧实现的 base.materials 会把情绪同分的
    // 其它 Story（c001 凉茶 / c014 手账 / s1 方案……）回填进 materials，respond 按
    // userLine 重排后任何一条都可能被当前 Echo 说成自己的经历。allowlist 化后，
    // blob（= respond 收到的 materials 原文）里只允许 anchor 与 approved supporting 出现。
    const f = fixtureById("f08");
    const d = decideOf(f);
    const allowed = new Set([d.anchor.id, ...d.supporting.map((s) => s.id)]);
    const { out: res } = await withoutNetwork(() => echoChain.match(matchInput(f)));
    const blob = materialsBlob(res.hits);
    assert.ok(blob.length > 0, "hits 应包含 world-archive materials blob");
    for (const story of POOL) {
      if (allowed.has(story.id)) continue;
      for (const line of [story.opening, ...story.lines]) {
        assert.equal(
          blob.includes(line),
          false,
          `未批准的 ${story.id} 泄漏进 materials：「${line.slice(0, 24)}…」`,
        );
      }
    }
    assert.ok(blob.includes(d.anchor.lines[0]!), "anchor 自己的行必须在 materials 首位");
  });
});

describe("Finding 2 — raw live = discovery only（cleanHit 不是匿名化）", () => {
  const PII_TEXT =
    "我叫张三，在深圳南山区腾讯工作，昨晚加班到凌晨三点才走出园区。我的博客是 https://weibo.com/u/12345，邮箱 zhangsan@qq.com，电话 13800138000，@zhangsan_vip 随时找我。";
  const UNIQUE_SENTENCE = "只有原文里才有的连续八个子都不重复的独特句子标记";
  const CONTACT_TEXT = "联系我 zhangsan@qq.com 或 13800138000，微博 @zhangsan_vip，主页 https://example.com/~zhangsan";

  function piiSource(): PostSource {
    return {
      id: "fake:pii",
      async search() {
        return [livePost(PII_TEXT), livePost(`车间夜班记。${UNIQUE_SENTENCE}。下班路上想到的。`), livePost(CONTACT_TEXT)];
      },
    };
  }

  it("PII test — 真名/城市/公司名不进 materials", async () => {
    const shadow = await gatherShadow(baseCtx(), true, piiSource());
    const joined = shadow.materials.map((m) => `${m.situation} ${m.content}`).join("\n");
    for (const banned of ["张三", "腾讯", "南山区", "weibo.com", "zhangsan@qq.com", "13800138000", "@zhangsan_vip", UNIQUE_SENTENCE]) {
      assert.equal(joined.includes(banned), false, `raw live 内容「${banned}」泄漏进 materials`);
    }
    // raw live discovery 仍保留在 shadow.livePosts 供观测与后台 ingest，只是不进当前 generation materials。
    assert.equal(shadow.livePosts?.length, 3, "live discovery 结果应保留在 livePosts 供观测/ingest");
  });

  it("Source-overlap test — ≥8 连续字独特原句不进 materials", async () => {
    const shadow = await gatherShadow(baseCtx(), true, piiSource());
    const joined = shadow.materials.map((m) => m.content).join("\n");
    assert.equal(joined.includes(UNIQUE_SENTENCE), false, "raw 原句不得进入 prompt 素材");
  });

  it("Contact test — email/phone/@handle/URL 不进 materials", async () => {
    const shadow = await gatherShadow(baseCtx(), true, piiSource());
    const joined = shadow.materials.map((m) => `${m.situation} ${m.content}`).join("\n");
    for (const banned of ["zhangsan@qq.com", "13800138000", "@zhangsan_vip", "https://"]) {
      assert.equal(joined.includes(banned), false, `联系方式「${banned}」泄漏进 materials`);
    }
  });
});
