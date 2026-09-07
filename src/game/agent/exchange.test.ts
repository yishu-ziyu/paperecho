import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptFelt,
  advanceExchange,
  exchangeCue,
  fallbackReturnLetter,
  hasMetaLeak,
  initialExchange,
  isNewPersonalDetail,
  lineForLayer,
  SEAL_CLIENT_TIMEOUT_MS,
  SEAL_REMEMBER_TIMEOUT_MS,
  SEAL_WRITE_TIMEOUT_MS,
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

  it("keeps advancing past depth 3 without any seal signal", () => {
    let s = initialExchange();
    const a1 = advanceExchange(s, "今天被老板当众点名了，我当场没接话。", [], "灯还开着");
    assert.equal(a1.state.unlocked, 2);
    s = a1.state;
    const a2 = advanceExchange(
      s,
      "我把客厅的灯和电视都开着，就想让屋里听起来有第二个人。",
      ["今天被老板当众点名了，我当场没接话。"],
      "灯还开着",
    );
    assert.equal(a2.state.unlocked, 3);
    s = a2.state;
    // 已到 depth 3 之后：故事进度不再封顶对话寿命，每轮照常产出 state/speak。
    const lines = [
      "下班路上我把那条消息点开又关了，没回。",
      "我在工位把明天的清单写完了，还是睡不着。",
      "刚才老板又给我发消息了，我装作没看见。",
      "我把手机扣在沙发上，去厨房烧了壶水。",
      "群里只回了收到，我把电脑合上了。",
      "电梯里我数着楼层，没有看任何人。",
    ];
    let prior = ["今天被老板当众点名了，我当场没接话。", "我把客厅的灯和电视都开着，就想让屋里听起来有第二个人。"];
    let lastEcho = "我那晚也没睡";
    for (let i = 0; i < lines.length; i++) {
      const step = advanceExchange(s, lines[i]!, prior, lastEcho);
      assert.equal(step.state.unlocked, 3, `turn ${i + 1}`);
      assert.equal(step.speak >= 1 && step.speak <= 3, true, `turn ${i + 1}`);
      assert.equal(typeof step.mode, "string");
      assert.equal(typeof step.judgment.new_detail, "boolean");
      // ExchangeAdvance 里不存在任何 seal 信号。
      assert.deepEqual(Object.keys(step).sort(), ["judgment", "mode", "speak", "state"]);
      s = step.state;
      prior = [...prior, lines[i]!];
      lastEcho = "";
    }
    assert.equal(s.unlocked, 3);
  });
});

describe("seal letter / layer fallback", () => {
  it("store waits for both seal steps and never auto-seals", async () => {
    const { readFile } = await import("node:fs/promises");
    const store = await readFile(new URL("../store.ts", import.meta.url), "utf8");
    const chains = await readFile(new URL("./chains.ts", import.meta.url), "utf8");
    const exchangeSrc = await readFile(new URL("./exchange.ts", import.meta.url), "utf8");
    const encounter = await readFile(new URL("../phases/EncounterPhase.tsx", import.meta.url), "utf8");
    assert.match(store, /SEAL_CLIENT_TIMEOUT_MS/);
    assert.equal(store.includes("round >= 3"), false);
    assert.equal(store.includes("14000"), false);
    assert.match(store, /fallbackReturnLetter/);
    assert.match(chains, /SEAL_REMEMBER_TIMEOUT_MS/);
    assert.match(chains, /SEAL_WRITE_TIMEOUT_MS/);
    assert.match(chains, /lineForLayer/);
    assert.equal(encounter.includes("round >= 3"), false);
    assert.match(encounter, /回信正在折/);

    // 自动 seal 全部拆除：store 不再引用 shouldSealNow / silentUnlock。
    assert.equal(store.includes("shouldSealNow"), false);
    assert.equal(store.includes("silentUnlock"), false);
    assert.equal(exchangeSrc.includes("shouldSealNow"), false);
    assert.equal(exchangeSrc.includes("isSilentUnlock"), false);

    // runSeal( 只出现在显式 sealTonight 动作里，且该动作是 store 上唯一的调用点。
    const occurrences = [...store.matchAll(/runSeal\(/g)].map((m) => m.index ?? -1);
    assert.equal(occurrences.length, 1);
    const sealTonightStart = store.indexOf("sealTonight: () => {");
    const saveReturnStart = store.indexOf("saveReturn: () => {");
    assert.ok(sealTonightStart > 0);
    assert.ok(occurrences[0]! > sealTonightStart && occurrences[0]! < saveReturnStart);
    // 显式折回去仍把玩家送进回信（Encounter → Return 流程不破）。
    assert.match(store.slice(sealTonightStart, saveReturnStart), /phase: "return"/);

    // UI 入口：EncounterPhase 经 store action 显式折回去（两步确认）。
    assert.match(encounter, /sealTonight/);
    assert.match(encounter, /再点一次，把今晚折回去/);

    // turn 主路径：research 结果进 turn 上下文，不再被丢弃。
    assert.match(chains, /const research = await researchStep\("turn", rt\)/);
    assert.match(chains, /buildTurnContext\(session, research/);
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

describe("hasMetaLeak（出口 meta 词表）", () => {
  it("词表逐词命中，大小写不敏感", () => {
    for (const line of [
      "我在世界档案里看到一个和你很像的人。",
      "search_cases 里那条让我想到你。",
      "SEARCH_ARCHIVE 翻到一条。",
      "Remember 写下了你这句话。",
      "这是一个 tool call 的结果。",
      "TOOLCALL 的输出不算话。",
      "我在检索结果里看到一条。",
      "检索到一条相近的。",
      "这是 prompt 的要求。",
      "system prompt 里写了。",
    ]) {
      assert.equal(hasMetaLeak(line), true, line);
    }
  });

  it("「素材库」当本系统来源描述时命中（来源泄露窄规则）", () => {
    for (const line of [
      "我刚在素材库里看到一条和你很像的。",
      "我刚在素材库里看到一个和你情况很像的人。",
      "我从素材库查到一条相近的。",
      "我去素材库搜到过类似的人。",
      "素材库里有个人和你很像。",
      "素材库里有一条和你情况很像的夜。",
      "咱素材库里正好有一个和你像的。",
    ]) {
      assert.equal(hasMetaLeak(line), true, line);
    }
  });

  it("正常夜谈不误杀（资料、数据库等词放行）", () => {
    for (const line of [
      "我把资料删了。",
      "改了一晚上数据库。",
      "我把台灯换到窗边了，亮得能看见灰。",
      "备忘录里还留着去年的票根。",
      "我记性不好，全记在纸上。",
    ]) {
      assert.equal(hasMetaLeak(line), false, line);
    }
  });

  it("「素材库」误杀测试：玩家聊自己的素材库，模型复述不拦", () => {
    for (const line of [
      "我今天整理公司的素材库整理到凌晨。",
      "你整理公司素材库辛苦了，比我还狠。",
      "我昨晚翻了翻素材库，啥灵感都没翻出来。",
      "我们公司的素材库月底要清空，我得先备份。",
      "素材库快满了，删了一下午旧片子。",
      "我也整理过一晚上文件，最后桌面还是一团乱。",
    ]) {
      assert.equal(hasMetaLeak(line), false, line);
    }
  });
});
