import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { META_LEAK, buildGateServerEnv, parseArgs, scrubbedCredentialNames, serverFnOf } from "./game-release-smoke.mjs";

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

describe("game-release-smoke: buildGateServerEnv", () => {
  const fakeBase = () => ({
    PATH: "/usr/bin",
    HOME: "/tmp/fake-home",
    MINIMAX_CN_API_KEY: "fake",
    AI_PING_API_KEY: "fake",
    ANTHROPIC_API_KEY: "fake",
    ANTHROPIC_AUTH_TOKEN: "fake",
    FIRECRAWL_API_KEY: "fake",
    ANYSEARCH_API_KEY: "fake",
    PAPER_ECHO_LIVE: "1",
    VITE_AUTH_ENABLED: "true",
    HTTPS_PROXY: "http://proxy.invalid:8080",
  });

  it("removes all model + search keys, forces LIVE=0 and auth=false", () => {
    const out = buildGateServerEnv(fakeBase());
    for (const k of [
      "MINIMAX_CN_API_KEY", "AI_PING_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN",
      "FIRECRAWL_API_KEY", "ANYSEARCH_API_KEY", "HTTPS_PROXY", "PAPER_ECHO_LLM",
    ]) {
      assert.equal(out[k], undefined, `leaked: ${k}`);
    }
    assert.equal(out.PAPER_ECHO_LIVE, "0");
    assert.equal(out.VITE_AUTH_ENABLED, "false");
    assert.equal(out.PATH, "/usr/bin"); // unrelated vars survive
  });

  it("does not mutate the input object", () => {
    const base = fakeBase();
    buildGateServerEnv(base);
    assert.equal(base.FIRECRAWL_API_KEY, "fake");
    assert.equal(base.ANYSEARCH_API_KEY, "fake");
    assert.equal(base.PAPER_ECHO_LIVE, "1");
    assert.equal(base.VITE_AUTH_ENABLED, "true");
    assert.equal(base.MINIMAX_CN_API_KEY, "fake");
  });

  it("reports scrubbed NAMES only (never values)", () => {
    const names = scrubbedCredentialNames(fakeBase());
    assert.ok(names.includes("FIRECRAWL_API_KEY"));
    assert.ok(names.includes("ANYSEARCH_API_KEY"));
    assert.ok(names.includes("MINIMAX_CN_API_KEY"));
    assert.ok(!names.includes("PATH"));
    for (const n of names) assert.match(n, /^[A-Z_]+$/);
  });
});

describe("game-release-smoke: runMatch baseline order", () => {
  it("baseline is read BEFORE the first launch gesture (no race)", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "game-release-smoke.mjs"), "utf8");
    const baselineAt = src.indexOf("const matchCallsBeforeLaunch = R.requestCounts.runMatch");
    const launchAt = src.indexOf('page.locator("[data-throw-well]")');
    const assertAt = src.indexOf("matchCallsBeforeLaunch !==");
    assert.ok(baselineAt > 0 && launchAt > 0 && assertAt > 0, "markers present");
    assert.ok(baselineAt < launchAt, "baseline must precede the slingshot gesture");
    assert.ok(launchAt < assertAt, "assertion must follow the match");
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

describe("game-release-smoke: shared-promise cleanup/shutdown", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "game-release-smoke.mjs"), "utf8");

  it("cleanupDone boolean is gone; cleanup is a shared cleanupPromise", () => {
    assert.doesNotMatch(src, /\bcleanupDone\b/, "boolean re-entry guard must not return");
    assert.match(src, /\bcleanupPromise\b/, "shared cleanupPromise missing");
    assert.match(src, /if\s*\(!cleanupPromise\)/, "cleanup body must be created only on first call");
  });

  it("shutdown starts once via a shared shutdownPromise", () => {
    assert.match(src, /\bshutdownPromise\b/, "shared shutdownPromise missing");
    assert.match(src, /if\s*\(!shutdownPromise\)/, "shutdown must start only on the first signal");
  });

  it("SIGINT/SIGTERM stay as two process.on listeners (never process.once)", () => {
    assert.match(src, /process\.on\("SIGINT"/);
    assert.match(src, /process\.on\("SIGTERM"/);
    assert.doesNotMatch(src, /process\.once\("SIG/);
  });

  it("process.exit appears exactly twice: inside shutdown's promise body + top-level entry", () => {
    const exits = [...src.matchAll(/\bprocess\.exit\s*\(/g)].map((m) => m.index);
    assert.equal(exits.length, 2, `want exactly 2 process.exit sites, got ${exits.length}`);
    // The signal exit lives in the shutdown body (after the shared cleanup);
    // cleanup itself must contain no exit site.
    const shutdownBody = src.slice(src.indexOf("function shutdown("), src.indexOf("const finish ="));
    assert.match(shutdownBody, /process\.exit/, "signal exit must live in shutdown");
  });
});
