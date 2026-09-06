/**
 * EchoSession / turn 链验收测试（contract-encounter-agent-session 第 4–8 条）。
 *
 * 链路级测试用脚本化假流（StreamFn）注入：第 1 轮让模型调 remember 工具，
 * 第 2 轮回最终文本；同时捕获每次收到的 context，验证早期轮次与档案旧事真的进了 prompt。
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessage, Context } from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { MemoryRecord } from "../types.ts";
import { echoChain, guardTurnReply } from "./chains.ts";
import { buildTurnContext, restoreEchoSession, TURN_AGENT_TIMEOUT_MS } from "./session.ts";
import { runAgentTool } from "./tools.ts";
import type { NightInput, RecallItem } from "./types.ts";

const ECHO = {
  name: "林予",
  city: "杭州",
  felt: "灯还开着",
  greeting: "我改了十七稿方案，群里只回了收到。",
  replies: [],
  returnLetter: "",
  source: "archive" as const,
};

const MEMORY: MemoryRecord = {
  id: "m-mentor",
  memory: "我导师又给我发消息了，我装作没看见。",
  emotions: ["anxious"],
  region: "east",
  createdAt: Date.now(),
};

/** 5 轮 transcript：第 2 轮玩家把「老板」补成正身的「导师」。 */
function fiveTurnRecall(): RecallItem[] {
  return [
    { who: "echo", text: ECHO.greeting },
    { who: "you", text: "我今天把工位搬到了窗边，换了盏亮的台灯。" },
    { who: "echo", text: "窗边的灯我也有，亮得能看见灰。" },
    { who: "you", text: "我刚才说那个老板，其实是我导师。" },
    { who: "echo", text: "导师这两个字，压的人不一样。" },
  ];
}

function nightInput(over: Partial<NightInput> = {}): NightInput {
  return {
    fingerprint: [],
    letter: "我把最好的那面都给出去了，换来一句还好。",
    mirror: "灯我也没关",
    region: "east",
    echo: ECHO,
    playerLine: "他又给我发消息了，我把手机扣在桌上了。",
    recall: fiveTurnRecall(),
    archival: [MEMORY],
    exchange: { unlocked: 1, silentTurns: 0 },
    round: 3,
    ...over,
  };
}

const USAGE = {
  input: 10,
  output: 4,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 14,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistantMessage(content: AssistantMessage["content"], stopReason: "toolUse" | "stop"): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    provider: "minimax-cn",
    model: "fake",
    usage: USAGE,
    stopReason,
    timestamp: Date.now(),
  };
}

/**
 * 最小假流：按调用次序吐出脚本里的 assistant 消息，并把每次收到的 context 存进 captured。
 * 协议：start → (toolcall|text) 事件 → done。
 */
function scriptedStream(
  script: (call: number, ctx: Context) => AssistantMessage,
  captured: Context[],
): StreamFn {
  let call = 0;
  return (_model, context) => {
    captured.push(context);
    const msg = script(call, context);
    call += 1;
    const stream = createAssistantMessageEventStream();
    for (const block of msg.content) {
      if (block.type === "toolCall") {
        stream.push({ type: "toolcall_start", contentIndex: 0, partial: msg });
        stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: block, partial: msg });
      } else if (block.type === "text") {
        stream.push({ type: "text_start", contentIndex: 0, partial: msg });
        stream.push({ type: "text_end", contentIndex: 0, content: block.text, partial: msg });
      }
    }
    stream.push({
      type: "done",
      reason: msg.stopReason === "toolUse" ? "toolUse" : "stop",
      message: msg,
    });
    return stream;
  };
}

function contextText(ctx: Context): string {
  return `${ctx.systemPrompt ?? ""}\n${JSON.stringify(ctx.messages)}`;
}

describe("buildTurnContext (contract 4)", () => {
  it("round 5 still sees rounds 1–2 verbatim", () => {
    const session = restoreEchoSession(nightInput());
    const { user } = buildTurnContext(session, "【检索到的资料】信柜旧事……", {
      speak: 2,
      mode: "full",
    });
    // 第 2 轮玩家句（解「他」是谁的关键）与第 1 轮玩家句都在。
    assert.ok(user.includes("我刚才说那个老板，其实是我导师。"), user);
    assert.ok(user.includes("我今天把工位搬到了窗边，换了盏亮的台灯。"), user);
    // 开场信 + 镜句 + 当前玩家句。
    assert.ok(user.includes("我把最好的那面都给出去了，换来一句还好。"), user);
    assert.ok(user.includes("灯我也没关"), user);
    assert.ok(user.includes("他又给我发消息了，我把手机扣在桌上了。"), user);
    // 检索原文块与层指令。
    assert.ok(user.includes("【检索到的资料】信柜旧事……"), user);
    assert.ok(user.includes("当时落在身上的感觉"), user); // exchangeCue(speak=2)
    // 当前玩家句不重复出现两次。
    assert.equal([...user.matchAll(/对方刚说：他又给我发消息了/g)].length, 1);
  });

  it("keeps every early player line past 10 items; early echo lines may drop", () => {
    const recall: RecallItem[] = [
      { who: "you", text: "第一条早期的玩家句子讲的是搬家纸箱一直堆在门口没拆完的事。" },
      { who: "echo", text: "早期回声的一句，超过了十条的窗口。" },
      { who: "you", text: "第二条早期的玩家句子说公司楼下的便利店要关门了。" },
      ...Array.from({ length: 8 }, (_, i) => ({
        who: i % 2 === 0 ? ("echo" as const) : ("you" as const),
        text: `中段第${i + 1}句：我把桌上的杯子挪了个位置。`,
      })),
      { who: "echo", text: "最近的回声一句。" },
    ];
    const session = restoreEchoSession(nightInput({ recall, playerLine: "现在这句也在。" }));
    const { user } = buildTurnContext(session, "资料");
    assert.ok(user.includes("第一条早期的玩家句子"), user); // 早期玩家句保留（可截断，不丢条）
    assert.ok(user.includes("第二条早期的玩家句子"), user);
    assert.equal(user.includes("早期回声的一句"), false); // 早期 echo 句可省略
    assert.ok(user.includes("最近的回声一句。"), user); // 最近 10 条逐字
  });

  it("carries identity, facts, continuity and the shared persona rules", () => {
    const session = restoreEchoSession(
      nightInput({ days: [{ date: "09-05", text: "我把台灯搬去了窗边。" }] }),
    );
    assert.equal(session.echo.name, "林予");
    assert.equal(session.night.round, 3);
    assert.ok(session.playerFacts.some((f) => f.includes("我导师又给我发消息了")));
    assert.equal(session.continuity.lastEcho, "导师这两个字，压的人不一样。");
    assert.equal(session.persona.includes("日子本"), true);
    assert.equal(session.exchange.unlocked, 1);
    // turn agent 预算：22s agent + 14s 兜底仍在 store 的 40s 内。
    assert.ok(TURN_AGENT_TIMEOUT_MS === 22_000);
    assert.ok(TURN_AGENT_TIMEOUT_MS + 14_000 < 40_000);
  });
});

describe("search_archive hits reach the turn context (contract 5)", () => {
  it("the archival memory text lands in the built user prompt", () => {
    const session = restoreEchoSession(nightInput());
    // research 由 chains.researchStep 用同一检索函数产出；这里取它的原文喂给 buildTurnContext。
    const archive = runAgentTool("search_archive", { query: session.night.playerLine }, {
      archival: [MEMORY],
      fingerprint: [],
      region: "east",
      remembered: [],
    });
    assert.ok(archive.includes("我导师又给我发消息了，我装作没看见。"), archive);
    const { user } = buildTurnContext(session, `【玩家信柜里的旧事】\n${archive}`);
    assert.ok(user.includes("我导师又给我发消息了，我装作没看见。"), user);
  });
});

describe("turn chain with a scripted fake stream (contracts 4/5/6)", () => {
  it("remember tool writes ctx.remembered → res.facts; captured prompt keeps early turns and archive memory", async () => {
    const captured: Context[] = [];
    const FACT = "我导师又给我发消息了，我装作没看见。";
    const streamFn = scriptedStream((call) => {
      if (call === 0) {
        return assistantMessage(
          [{ type: "toolCall", id: "call-1", name: "remember", arguments: { fact: FACT } }],
          "toolUse",
        );
      }
      return assistantMessage(
        [{ type: "text", text: "我把手机扣在沙发扶手上，群里的红点还亮着。" }],
        "stop",
      );
    }, captured);

    const res = await echoChain.turn(nightInput(), { streamFn });

    // remember 闭环的前半：工具写入 → chain 的 facts 非空（store 侧 applyFacts+persistArchival 由源码断言覆盖）。
    assert.ok(res.facts.includes(FACT), JSON.stringify(res.facts));
    // 回复来自假流的最终文本，过了出口 guard。
    assert.equal(res.spoken, "我把手机扣在沙发扶手上，群里的红点还亮着。");
    assert.equal(res.meter.via, "live");

    // 第 1 次模型调用的上下文：早期轮次 + 档案旧事 + 开场信，全部在场。
    const first = contextText(captured[0]!);
    assert.ok(first.includes("我刚才说那个老板，其实是我导师。"), first);
    assert.ok(first.includes("我今天把工位搬到了窗边"), first);
    assert.ok(first.includes("我导师又给我发消息了，我装作没看见。"), first);
    assert.ok(first.includes("换来一句还好"), first);
    // 工具确实暴露给了模型。
    assert.ok(captured[0]!.tools?.some((t) => t.name === "remember"));
    assert.ok(captured[0]!.tools?.some((t) => t.name === "search_archive"));
    // hits 仍供 JudgePanel。
    assert.ok(res.hits.length >= 1);
  });

  it("depth 3 keeps producing replies (contract 2)", async () => {
    const captured: Context[] = [];
    const streamFn = scriptedStream(
      () => assistantMessage([{ type: "text", text: "后来我把那张工牌收进了抽屉最底层。" }], "stop"),
      captured,
    );
    const res = await echoChain.turn(nightInput({ exchange: { unlocked: 3, silentTurns: 0 } }), {
      streamFn,
    });
    assert.equal(res.spoken, "后来我把那张工牌收进了抽屉最底层。");
    assert.equal(res.exchange.unlocked, 3);
    assert.equal(res.speak, 3);
  });
});

describe("stolen voice guard (contract 7)", () => {
  it("refuses the player's memory said back as 我, falls through to fallback", async () => {
    const archival = [MEMORY];
    assert.equal(guardTurnReply("我导师又给我发消息了，真烦。", archival, []), "");
    // 干净的平行自己的事留下。
    assert.equal(
      guardTurnReply("我把台灯搬到窗边，纸箱还没拆完。", archival, []),
      "我把台灯搬到窗边，纸箱还没拆完。",
    );
    // 复读玩家 / 工具名残渣都拒。
    assert.equal(
      guardTurnReply("他又给我发消息了，我把手机扣在桌上了。", [], [
        "他又给我发消息了，我把手机扣在桌上了。",
      ]),
      "",
    );
    assert.equal(guardTurnReply("search_archive 查到三条", [], []), "");

    // 链路级：假流把玩家记忆说成自己的 → guard 拒掉 → 落 daybook 兜底，不再二次网络。
    const captured: Context[] = [];
    const streamFn = scriptedStream(
      () => assistantMessage([{ type: "text", text: "我导师又给我发消息了，真烦。" }], "stop"),
      captured,
    );
    const res = await echoChain.turn(nightInput(), { streamFn });
    assert.equal(res.spoken.includes("我导师又给我发消息了"), false, res.spoken);
    assert.equal(res.meter.via, "archive");
  });
});

describe("no key stays playable (contract 8)", () => {
  it("turn resolves fast through the daybook fallback without any network", async () => {
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
      const started = Date.now();
      const res = await echoChain.turn(nightInput());
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 10_000, `turn took ${elapsed}ms`);
      assert.equal(calls, 0);
      assert.equal(res.meter.via, "archive");
      // daybook/page 兜底给出一句人话（greeting 不等于上一句 echo）。
      assert.equal(res.spoken, ECHO.greeting);
    } finally {
      globalThis.fetch = realFetch;
      if (savedKey !== undefined) process.env.MINIMAX_CN_API_KEY = savedKey;
      if (savedAlt !== undefined) process.env.AI_PING_API_KEY = savedAlt;
    }
  });

  it("seal short-circuits to the fallback letter without a key", async () => {
    const savedKey = process.env.MINIMAX_CN_API_KEY;
    const savedAlt = process.env.AI_PING_API_KEY;
    delete process.env.MINIMAX_CN_API_KEY;
    delete process.env.AI_PING_API_KEY;
    try {
      const res = await echoChain.seal(nightInput({ echo: { ...ECHO, returnLetter: "抽屉那包还在。" } }));
      assert.equal(res.spoken, "抽屉那包还在。");
      assert.equal(res.meter.via, "archive");
    } finally {
      if (savedKey !== undefined) process.env.MINIMAX_CN_API_KEY = savedKey;
      if (savedAlt !== undefined) process.env.AI_PING_API_KEY = savedAlt;
    }
  });
});
