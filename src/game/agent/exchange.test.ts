import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptFelt,
  advanceExchange,
  exchangeCue,
  fallbackReturnLetter,
  initialExchange,
  isNewPersonalDetail,
  isSilentUnlock,
  lineForLayer,
  SEAL_CLIENT_TIMEOUT_MS,
  SEAL_REMEMBER_TIMEOUT_MS,
  SEAL_WRITE_TIMEOUT_MS,
  shouldSealNow,
} from "./exchange.ts";

describe("isNewPersonalDetail", () => {
  it("rejects stance / echo / short", () => {
    assert.equal(isNewPersonalDetail("我也是", [], ""), false);
    assert.equal(isNewPersonalDetail("我懂", [], ""), false);
    assert.equal(isNewPersonalDetail("嗯", [], ""), false);
    assert.equal(
      isNewPersonalDetail("下班回来我对着手机扒了半小时饭", ["下班回来我对着手机扒了半小时饭"], ""),
      false,
    );
  });

  it("accepts a concrete first-person fact", () => {
    assert.equal(
      isNewPersonalDetail("下班回来我对着手机扒了半小时饭，其实也没在看什么。", [], ""),
      true,
    );
  });

  it("accepts everyday facts that missed the old word list", () => {
    assert.equal(isNewPersonalDetail("我今天被老板当众点名了", [], ""), true);
    assert.equal(isNewPersonalDetail("我回家路上一直没回那条消息", [], ""), true);
    assert.equal(isNewPersonalDetail("我被放鸽子了，在店门口站了十分钟", [], ""), true);
  });

  it("still rejects stance and feeling-only lines", () => {
    assert.equal(isNewPersonalDetail("我没事", [], ""), false);
    assert.equal(isNewPersonalDetail("我还好", [], ""), false);
    assert.equal(isNewPersonalDetail("我今天很难受", [], ""), false);
    assert.equal(isNewPersonalDetail("我真的很难受一直都是这样", [], ""), false);
  });

  it("rejects the current line if it already sits in priorPlayer", () => {
    const line = "那几页我塞进抽屉最下层，到现在都没打开。";
    assert.equal(isNewPersonalDetail(line, [], "灯还开着"), true);
    assert.equal(isNewPersonalDetail(line, [line], "灯还开着"), false);
  });
});

describe("advanceExchange", () => {
  it("opens at L1 and never skips", () => {
    const s0 = initialExchange();
    assert.equal(s0.unlocked, 1);
    const a1 = advanceExchange(s0, "我也是", [], "灯还开着");
    assert.equal(a1.state.unlocked, 1);
    assert.equal(a1.speak, 1);
    assert.equal(a1.judgment.new_detail, false);

    const a2 = advanceExchange(
      a1.state,
      "下班回来我对着手机扒了半小时饭，其实也没在看什么。",
      [],
      "灯还开着",
    );
    assert.equal(a2.state.unlocked, 2);
    assert.equal(a2.speak, 2);
    assert.equal(a2.mode, "full");

    const a3 = advanceExchange(
      a2.state,
      "我把客厅的灯和电视都开着，就想让屋里听起来有第二个人。",
      ["下班回来我对着手机扒了半小时饭，其实也没在看什么。"],
      "我那晚也没睡",
    );
    assert.equal(a3.state.unlocked, 3);
    assert.equal(a3.speak, 3);
  });

  it("half-opens on 2 silent turns, soft-unlocks on 3", () => {
    let s = initialExchange();
    const first = advanceExchange(s, "我也是", [], "灯还开着");
    s = first.state;
    const second = advanceExchange(s, "嗯嗯", ["我也是"], "灯还开着");
    assert.equal(second.mode, "half");
    assert.equal(second.speak, 2);
    assert.equal(second.state.unlocked, 1);
    const third = advanceExchange(second.state, "好吧", ["我也是", "嗯嗯"], "灯还开着");
    assert.equal(third.mode, "full");
    assert.equal(third.state.unlocked, 2);
    assert.equal(third.judgment.new_detail, false);
  });

  it("seals from the exchange, not from opening count", () => {
    const s0 = initialExchange();
    assert.equal(shouldSealNow(s0), false);
    const a1 = advanceExchange(s0, "我也是", [], "灯还开着");
    const a2 = advanceExchange(a1.state, "嗯嗯", ["我也是"], "灯还开着");
    assert.equal(shouldSealNow(a2.state), false);
    const a3 = advanceExchange(a2.state, "好吧", ["我也是", "嗯嗯"], "灯还开着");
    assert.equal(isSilentUnlock(a2.state, a3), true);
    assert.equal(shouldSealNow(a3.state), false);
    const done = { unlocked: 3 as const, silentTurns: 0 };
    assert.equal(shouldSealNow(done), true);
    assert.equal(isSilentUnlock(s0, a1), false);
  });
});

describe("seal letter / layer fallback", () => {
  it("store waits for both seal steps and no longer seals on round count", async () => {
    const { readFile } = await import("node:fs/promises");
    const store = await readFile(new URL("../store.ts", import.meta.url), "utf8");
    const chains = await readFile(new URL("./chains.ts", import.meta.url), "utf8");
    const encounter = await readFile(new URL("../phases/EncounterPhase.tsx", import.meta.url), "utf8");
    assert.match(store, /SEAL_CLIENT_TIMEOUT_MS/);
    assert.equal(store.includes("round >= 3"), false);
    assert.equal(store.includes("14000"), false);
    assert.match(store, /shouldSealNow/);
    assert.match(store, /fallbackReturnLetter/);
    assert.match(chains, /SEAL_REMEMBER_TIMEOUT_MS/);
    assert.match(chains, /SEAL_WRITE_TIMEOUT_MS/);
    assert.match(chains, /lineForLayer/);
    assert.equal(encounter.includes("round >= 3"), false);
    assert.match(encounter, /回信正在折/);
  });

  it("match/turn/seal bank remembered facts into archival", async () => {
    const { readFile } = await import("node:fs/promises");
    const store = await readFile(new URL("../store.ts", import.meta.url), "utf8");
    const uses = store.match(/res\.facts/g) ?? [];
    assert.ok(uses.length >= 3);
    assert.match(store, /applyFacts\([\s\S]*?res\.facts/);
    assert.match(store, /persistArchival\(grown\)/);
    assert.match(store, /archival: grown/);
  });

  it("covers both seal steps on the client clock", () => {
    assert.equal(SEAL_CLIENT_TIMEOUT_MS, SEAL_REMEMBER_TIMEOUT_MS + SEAL_WRITE_TIMEOUT_MS);
    assert.ok(SEAL_CLIENT_TIMEOUT_MS >= 45_000);
  });

  it("timeout letter quotes the player, not a story-card template", () => {
    assert.equal(fallbackReturnLetter("群里只回了收到"), "你那句「群里只回了收到」我还留着。灯还开着。");
    assert.equal(fallbackReturnLetter(""), "灯还开着。你那句话我没扔。");
  });

  it("picks the line for this layer instead of always the greeting", () => {
    const echo = {
      greeting: "今天电脑还亮着，群里没人回。",
      replies: ["那晚压在身上，我没跟人说。", "后来那页我没再打开过。"],
    };
    assert.equal(lineForLayer(echo, 1), echo.greeting);
    assert.equal(lineForLayer(echo, 2), echo.replies[0]);
    assert.equal(lineForLayer(echo, 3), echo.replies[1]);
    assert.match(lineForLayer(echo, 2, "half"), /…$/);
  });
});

describe("acceptFelt / cue", () => {
  it("drops emotion-id felt, keeps a picture phrase", () => {
    assert.equal(acceptFelt("wronged,anger,unseen", "旧的"), "旧的");
    assert.equal(acceptFelt("anxious,tired", ""), "");
    assert.equal(acceptFelt("新屋子所有的声音都要重新认一遍", "旧的"), "新屋子所有的声音都要重新认一遍");
  });

  it("never mentions layer numbers in the cue", () => {
    for (const speak of [1, 2, 3] as const) {
      assert.equal(/L[123]|第[一二三]层/.test(exchangeCue(speak, "full")), false);
    }
    assert.equal(/L[123]/.test(exchangeCue(2, "half")), false);
  });
});
