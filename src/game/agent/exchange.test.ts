import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptFelt,
  advanceExchange,
  exchangeCue,
  initialExchange,
  isNewPersonalDetail,
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
