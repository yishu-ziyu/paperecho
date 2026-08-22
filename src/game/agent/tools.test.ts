import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLLECTED } from "../collect.ts";
import { foreignPlace, STORIES } from "../stories.ts";
import { isCompleteFact } from "./memory.ts";
import { libraryFirstMaterials, synthesize } from "./pipeline/persona.ts";
import type { Post } from "./pipeline/source.ts";
import { makeProfile } from "./pipeline/profile.ts";
import { archiveStories, storyToPost } from "./pipeline/sources/local.ts";
import { queriesOf } from "./pipeline/sources/live.ts";
import { cleanOneLine } from "./chains.ts";
import { formatCaseHits, formatCaseHitsLive, runAgentTool, type ToolCtx } from "./tools.ts";

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

describe("match research library-first", () => {
  it("formatCaseHits is the library path and stays name-free", () => {
    const ctx: ToolCtx = {
      archival: [],
      fingerprint: [
        { id: "tired", closeness: 0.9 },
        { id: "unseen", closeness: 0.8 },
      ],
      region: "east",
      remembered: [],
      story: "我改到很晚，群里只回了收到。",
    };
    const blob = formatCaseHits(ctx);
    assert.match(blob, /跟你一样/);
    assert.equal(/search_cases|Firecrawl|AnySearch/.test(blob), false);
    for (const story of [...STORIES, ...COLLECTED]) {
      assert.equal(blob.includes(`${story.name} · ${story.city}`), false);
    }
  });

  it("formatCaseHitsLive still returns the library when live is off", async () => {
    const ctx: ToolCtx = {
      archival: [],
      fingerprint: [
        { id: "tired", closeness: 0.9 },
        { id: "unseen", closeness: 0.8 },
      ],
      region: "east",
      remembered: [],
      story: "我改到很晚，群里只回了收到。",
    };
    const blob = await formatCaseHitsLive(ctx);
    const lib = formatCaseHits(ctx);
    assert.match(blob, /跟你一样/);
    assert.equal(blob.split("\n")[0], lib.split("\n")[0]);
    assert.ok(blob.split("---").length >= 2);
    assert.equal(/search_cases|Firecrawl|AnySearch/.test(blob), false);
  });
});

describe("live query", () => {
  it("builds a first-person public-page query from emotions and the written line", () => {
    const qs = queriesOf(makeProfile(["tired", "unseen"], "我改到很晚，群里只回了收到。"));
    assert.ok(qs.length >= 1);
    assert.match(qs.join("\n"), /日记/);
    assert.equal(/Firecrawl|AnySearch/.test(qs.join("")), false);
  });
});

describe("library occupies five materials", () => {
  it("keeps library posts even when live overlap is higher", () => {
    const profile = makeProfile(["tired", "unseen"]);
    const local: Post[] = Array.from({ length: 5 }, (_, i) => ({
      platform: "archive",
      content: `库里第${i + 1}夜我改到很晚群里只回了收到。`,
      emotion: ["tired" as const],
      situation: `库摘要${i + 1}`,
    }));
    const live: Post[] = [
      {
        platform: "web",
        content: "现场帖我改到三点半还在等已读，想被看见。",
        emotion: ["tired" as const, "unseen" as const],
        situation: "现场摘要",
      },
    ];
    const mixed = synthesize([...local, ...live], profile);
    assert.equal(mixed.materials.some((p) => p.content.includes("现场帖")), true);
    const kept = libraryFirstMaterials(local, live, profile);
    assert.equal(kept.length, 5);
    assert.equal(kept.every((p) => p.platform === "archive"), true);
    assert.equal(kept.some((p) => p.content.includes("现场帖")), false);
  });

  it("lets live fill empty slots when the library is short", () => {
    const profile = makeProfile(["tired"]);
    const local: Post[] = [
      {
        platform: "archive",
        content: "库里只有这一夜我对着灯坐着。",
        emotion: ["tired" as const],
        situation: "库一条",
      },
    ];
    const live: Post[] = [
      {
        platform: "web",
        content: "现场补上的夜我把充电器拔了。",
        emotion: ["tired" as const],
        situation: "现场一条",
      },
    ];
    const kept = libraryFirstMaterials(local, live, profile);
    assert.equal(kept.length, 2);
    assert.equal(kept[0]?.content.includes("库里"), true);
    assert.equal(kept[1]?.content.includes("现场补上"), true);
  });
});
