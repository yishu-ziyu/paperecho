import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLLECTED } from "../collect.ts";
import { foreignPlace, STORIES } from "../stories.ts";
import { isCompleteFact } from "./memory.ts";
import { synthesize } from "./pipeline/persona.ts";
import { makeProfile } from "./pipeline/profile.ts";
import { archiveStories, storyToPost } from "./pipeline/sources/local.ts";
import { cleanOneLine } from "./chains.ts";
import { runAgentTool, type ToolCtx } from "./tools.ts";

describe("match research via PostSource", () => {
  it("feeds synthesize materials, not locked story names", () => {
    const profile = makeProfile(["unseen", "tired"]);
    const pool = archiveStories();
    const shadow = synthesize(pool.map(storyToPost), profile);
    assert.match(shadow.handle, /跟你一样/);
    assert.ok(shadow.materials.length > 0);
    const blob = `${shadow.handle}\n${shadow.voice}\n${shadow.materials.map((p) => `${p.situation}\n${p.content}`).join("\n")}`;
    for (const story of [...STORIES, ...COLLECTED]) {
      assert.equal(blob.includes(`${story.name} · ${story.city}`), false);
    }
    assert.equal(/search_cases|Firecrawl|AnySearch/.test(blob), false);
    assert.equal(/\b(gloom|wronged|anxious|tired|lonely|anger|calm|unseen)(,(gloom|wronged|anxious|tired|lonely|anger|calm|unseen))+\b/.test(blob), false);
  });
});

describe("remember completeness", () => {
  it("refuses a clipped fact and keeps a full one", () => {
    const ctx: ToolCtx = { archival: [], fingerprint: [], region: "east", remembered: [] };
    assert.equal(runAgentTool("remember", { fact: "其实也没" }, ctx), "半截话，没写下。");
    assert.equal(ctx.remembered.length, 0);
    assert.equal(
      runAgentTool("remember", { fact: "下班回来我对着手机扒了半小时饭，其实也没在看什么。" }, ctx),
      "已写下。",
    );
    assert.equal(ctx.remembered[0]?.includes("半小时饭"), true);
    assert.ok((ctx.remembered[0]?.length ?? 0) > 24);
  });

  it("refuses the echo's own night", () => {
    const ctx: ToolCtx = {
      archival: [],
      fingerprint: [],
      region: "east",
      remembered: [],
      playerTexts: ["我还笑着说是我俩一起弄的，指甲把手心掐出了印。"],
    };
    assert.equal(
      runAgentTool("remember", { fact: "玩家以前改方案到三点半，第二天开会没人提那几行数据是她扒的。" }, ctx),
      "这不是对方的事，没写下。",
    );
    assert.equal(ctx.remembered.length, 0);
  });
});

describe("cleanOneLine quotes", () => {
  it("closes a hanging Chinese quote", () => {
    assert.equal(cleanOneLine("像骨头。「没说完"), "像骨头。「没说完」");
  });
});

describe("isCompleteFact", () => {
  it("keeps a full line and drops clips", () => {
    assert.equal(isCompleteFact("下班回来我对着手机扒了半小时饭，其实也没在看什么。"), true);
    assert.equal(isCompleteFact("其实也没"), false);
    assert.equal(isCompleteFact("这家的"), false);
    assert.equal(isCompleteFact("你那条「如果搞砸了呢"), false);
  });
});

describe("foreignPlace extra-lexicon", () => {
  it("flags Paris while the identity sits in Chicago", () => {
    assert.equal(foreignPlace("我在Paris买了块柠檬派，明早配咖啡。", "Jonah", "Chicago"), true);
  });

  it("lets Chicago keep its own lake", () => {
    assert.equal(foreignPlace("密歇根湖风很大，清单还亮着。", "Jonah", "Chicago"), false);
  });
});
