import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Story } from "../../src/game/types.ts";
import {
  cleanHit,
  hasEightCharLeak,
  parseStoryJson,
  qaStory,
  stripBoilerplate,
} from "./lib.ts";

const SAMPLE: Story = {
  id: "c001",
  name: "周晚",
  city: "苏州",
  region: "east",
  feels: ["tired", "unseen"],
  opening: "我把文件夹合上，群里还停在那句收到。灯没关。",
  lines: ["抽屉最下层多了一包打印稿。", "那条消息我看了两遍，没有回。"],
  returnLetter: "那包稿还在。你要是也留着一包，先别清。",
  source: "collected",
};

describe("collect clean + qa", () => {
  it("drops counseling copy and contact lines", () => {
    const hit = cleanHit({
      url: "https://www.jianshu.com/p/abc",
      title: "x",
      platform: "jianshu",
      query: "q",
      text: "你不需要永远坚强，我们陪你把碎掉的情绪捡起来。加我微信 13800138000。",
    });
    assert.equal(hit, null);
  });

  it("keeps a first-person night of enough length", () => {
    const body =
      "我改到十一点，群里只回了收到。灯还开着。我把截图发给自己，又把手机扣在桌上。风扇一直转。那句话我打了又删。".repeat(
        2,
      );
    const hit = cleanHit({
      url: "https://www.jianshu.com/p/ok",
      title: "夜",
      platform: "jianshu",
      query: "q",
      text: body,
    });
    assert.ok(hit);
    assert.ok(hit!.text.includes("我"));
  });

  it("strips emails from boilerplate", () => {
    const t = stripBoilerplate("我还坐着。\n联系 foo@example.com 下载客户端");
    assert.equal(t.includes("@"), false);
  });

  it("catches eight-char leaks", () => {
    assert.equal(hasEightCharLeak("我改了十七稿方案，群里只回了一句收到。", "群里只回了一句收到还亮着"), true);
    assert.equal(hasEightCharLeak("我改了十七稿方案，群里只回了一句收到。", "文件夹合上了，灯还开着。"), false);
  });

  it("rejects a rewrite that copies the source", () => {
    const original = "我改了十七稿方案，群里只回了一句收到。灯还开着，像在等一个不存在的点头。";
    const bad: Story = {
      ...SAMPLE,
      opening: "我改了十七稿方案，群里只回了一句收到。",
      lines: ["灯还开着，像在等一个不存在的点头。", "那句收到我到现在都没回。"],
    };
    const fail = qaStory(bad, original, []);
    assert.ok(fail);
    assert.ok(fail!.reason === "eight_char" || fail!.reason === "jaccard_original" || fail!.reason === "parrot_core");
  });

  it("accepts a distant rewrite", () => {
    const original =
      "昨晚会议室空调很响。方案改到版本十二，主管在群里丢了个收到两个字。我把U盘拔下来，走廊灯一排一排灭。";
    const fail = qaStory(SAMPLE, original, []);
    assert.equal(fail, null);
  });

  it("rejects a letter that calls the fictional name", () => {
    const original = "车间灯一排一排灭。我把工牌摘下来，罚款单还在口袋里。手还在抖。";
    const bad: Story = {
      ...SAMPLE,
      name: "阿枳",
      returnLetter: "阿枳，今天的罚款先记着，别把自己也算进罚单里。",
    };
    assert.equal(qaStory(bad, original, [])?.reason, "name_in_text");
  });

  it("parses model json even with fences", () => {
    const raw = "```json\n" + JSON.stringify(SAMPLE) + "\n```";
    const story = parseStoryJson(raw, "c009", {
      url: "https://www.jianshu.com/p/x",
      title: "t",
      text: "placeholder text that is long enough and uses 我 somewhere in the night",
      platform: "jianshu",
      query: "q",
      emotionHint: ["tired"],
    });
    assert.ok(story);
    assert.equal(story!.id, "c009");
    assert.equal(story!.source, "collected");
  });
});
