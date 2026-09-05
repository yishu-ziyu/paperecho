import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  companionFromJourney,
  continueGreeting,
  echoFromCompanion,
  FALLBACK_NAME,
  growAwayThing,
  lockedEchoForMatch,
  rememberNight,
  stableName,
} from "./companion.ts";
import { matchStory } from "./stories.ts";
import type { EchoPerson, Journey } from "./types.ts";

const echo: EchoPerson = {
  name: "林予",
  city: "杭州",
  felt: "灯还开着",
  greeting: "我改了十七稿方案，群里只回了收到。",
  replies: ["十七稿我打成一包，塞进抽屉最下层。"],
  returnLetter: "抽屉那包还在。",
  source: "archive",
};

function night(over: Partial<Parameters<typeof rememberNight>[0]> = {}) {
  return rememberNight({
    echo,
    transcript: [
      { who: "echo", text: echo.greeting },
      { who: "you", text: "我也是" },
      { who: "echo", text: "十七稿我打成一包，塞进抽屉最下层。" },
      { who: "you", text: "灯我也没关" },
    ],
    fingerprint: [
      { id: "tired", closeness: 0.8 },
      { id: "unseen", closeness: 0.6 },
    ],
    letter: "灯我也没关",
    ...over,
  });
}

function asJourney(saved: ReturnType<typeof night>, name = saved.echo.name, city = saved.echo.city): Journey {
  return {
    id: `j-${name}`,
    createdAt: 1,
    fingerprint: [
      { id: "tired", closeness: 0.8 },
      { id: "unseen", closeness: 0.6 },
    ],
    mirror: "灯我也没关",
    letter: "灯我也没关",
    chips: [],
    region: "east",
    echo: { ...saved.echo, name, city },
    transcript: [
      { who: "echo", text: "十七稿我打成一包，塞进抽屉最下层。" },
      { who: "you", text: "灯我也没关" },
    ],
    returnLetter: echo.returnLetter,
    awayThing: saved.awayThing,
  };
}

describe("same person next night", () => {
  it("keeps the name that already exists", () => {
    const saved = night();
    assert.equal(saved.echo.name, "林予");
    assert.equal(stableName(""), FALLBACK_NAME);
    assert.equal(night({ echo: { ...echo, name: "" } }).echo.name, FALLBACK_NAME);
  });

  it("remembers the talk because they talked, including a stance line", () => {
    const saved = night();
    const journey: Journey = {
      ...asJourney(saved),
      transcript: [
        { who: "echo", text: echo.greeting },
        { who: "you", text: "我也是" },
        { who: "echo", text: "十七稿我打成一包，塞进抽屉最下层。" },
        { who: "you", text: "灯我也没关" },
      ],
    };
    const c = companionFromJourney(journey);
    assert.equal(c.lastYou, "灯我也没关");
    assert.equal(c.transcript.some((t) => t.text === "我也是"), true);
    assert.deepEqual(c.lastEmotions, ["tired", "unseen"]);
    assert.equal(c.lastEcho.includes("抽屉"), true);
  });

  it("grows from a model line, or keeps the previous one", () => {
    const away = growAwayThing(
      "十七稿我打成一包，塞进抽屉最下层。",
      "抽屉我后来自己又碰过一次，还搁在原处。",
    );
    assert.equal(away, "抽屉我后来自己又碰过一次，还搁在原处。");
    assert.equal(/想你|我懂你|接住|加油/.test(away), false);
    const reuse = growAwayThing("十七稿我打成一包，塞进抽屉最下层。");
    assert.equal(reuse, "十七稿我打成一包，塞进抽屉最下层。");
  });

  it("seeking a name locks that person; a blank throw does not", () => {
    const saved = night();
    const lin = asJourney(saved, "林予", "杭州");
    const mara: Journey = {
      ...asJourney(saved, "Mara", "Lisbon"),
      id: "j-mara",
      echo: {
        ...saved.echo,
        name: "Mara",
        city: "Lisbon",
        greeting: "窗开着。我在群里打了又删。",
      },
      transcript: [
        { who: "echo", text: "窗开着。我在群里打了又删。" },
        { who: "you", text: "我也是" },
      ],
    };
    assert.equal(lockedEchoForMatch([mara, lin]), null);
    const lockedLin = lockedEchoForMatch([mara, lin], "林予");
    assert.ok(lockedLin);
    assert.equal(lockedLin.name, "林予");
    assert.equal(lockedLin.city, "杭州");
    const lockedMara = lockedEchoForMatch([mara, lin], "Mara");
    assert.ok(lockedMara);
    assert.equal(lockedMara.name, "Mara");
    assert.equal(lockedMara.city, "Lisbon");
    const greet = continueGreeting(companionFromJourney(lin), {
      letter: "群里又只回了收到",
      emotions: ["lonely"],
    }, "窗还开着，灯我后来拧暗了。");
    assert.equal(greet, "窗还开着，灯我后来拧暗了。");
    assert.equal(/想你|Mara|Jonah|港口|今晚又改到很晚|屋里还是我自己/.test(greet), false);
    const reuse = continueGreeting(companionFromJourney(lin), { emotions: ["lonely"] });
    assert.equal(reuse, lin.awayThing || companionFromJourney(lin).lastEcho);
    assert.equal(/今晚又改到很晚|屋里还是我自己/.test(reuse), false);
    const again = echoFromCompanion(companionFromJourney(lin), greet);
    assert.equal(again.name, lockedLin.name);
  });

  it("first night has no locked person", () => {
    assert.equal(lockedEchoForMatch([]), null);
    assert.equal(lockedEchoForMatch([], "林予"), null);
  });

  it("new match skips already-met names", () => {
    const next = matchStory(["unseen", "tired"], "east", ["林予"]);
    assert.notEqual(next.name, "林予");
  });

  it("launch and match both read the leftover person, and archive can seek", async () => {
    const { readFile } = await import("node:fs/promises");
    const store = await readFile(new URL("./store.ts", import.meta.url), "utf8");
    const chains = await readFile(new URL("./agent/chains.ts", import.meta.url), "utf8");
    const archive = await readFile(new URL("./phases/ArchivePhase.tsx", import.meta.url), "utf8");
    assert.match(store, /lockedEchoForMatch/);
    assert.match(store, /rememberNight/);
    assert.match(store, /seekName/);
    assert.match(store, /seekPerson/);
    assert.match(archive, /再去找他/);
    assert.match(chains, /kind: "greet"/);
    assert.match(chains, /returning/);
    assert.equal(/continueGreeting/.test(chains), false);
    assert.equal(/speakFromDays/.test(store), false);
  });
});
