import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { META_LEAK, parseArgs, serverFnOf } from "./game-release-smoke.mjs";

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64");
const fnUrl = (exp) =>
  `http://127.0.0.1:8123/_serverFn/${b64({ file: "/src/game/agent/server.ts?tsc-serverfn-split", export: exp })}`;

describe("game-release-smoke: parseArgs", () => {
  it("defaults match the documented matrix (3/5/2/2)", () => {
    const a = parseArgs([]);
    assert.equal(a.titleFresh, 3);
    assert.equal(a.titleReload, 5);
    assert.equal(a.enter, 2);
    assert.equal(a.space, 2);
  });

  it("overrides counts, port and out", () => {
    const a = parseArgs(["--title-fresh", "10", "--title-reload=20", "--port", "9001", "--out", "r.json"]);
    assert.equal(a.titleFresh, 10);
    assert.equal(a.titleReload, 20);
    assert.equal(a.port, 9001);
    assert.match(a.out, /r\.json$/);
  });

  it("rejects unknown flags and non-numbers", () => {
    assert.throws(() => parseArgs(["--nope", "1"]), /unknown arg/);
    assert.throws(() => parseArgs(["--title-fresh", "x"]), /needs a number/);
  });
});

describe("game-release-smoke: serverFnOf", () => {
  for (const name of ["runMatch", "runTurn", "runSeal", "runVoice"]) {
    it(`classifies ${name}`, () => {
      assert.equal(serverFnOf(fnUrl(`${name}_createServerFn_handler`)), name);
    });
  }

  it("labels unknown exports instead of guessing", () => {
    assert.match(serverFnOf(fnUrl("runNap_createServerFn_handler")), /^unknown:/);
  });

  it("returns null for non-server-fn URLs, undecodable for garbage", () => {
    assert.equal(serverFnOf("http://127.0.0.1:8123/"), null);
    assert.equal(serverFnOf("http://127.0.0.1:8123/_serverFn/abcd"), "undecodable");
  });
});

describe("game-release-smoke: META_LEAK mirror", () => {
  it("hits internal-source self-descriptions", () => {
    assert.match("我刚在素材库里看到一个和你情况很像的人。", META_LEAK);
    assert.match("我刚在世界档案里看到一个和你很像的人。", META_LEAK);
  });

  it("does not kill ordinary night talk", () => {
    assert.doesNotMatch("我把台灯换到窗边了，亮得能看见灰。", META_LEAK);
    assert.doesNotMatch("我今天整理公司的素材库整理到凌晨。", META_LEAK);
  });
});
