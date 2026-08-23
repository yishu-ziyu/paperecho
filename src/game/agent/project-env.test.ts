import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyProjectLlmEnv,
  isRealLlmKey,
  minimaxBaseUrl,
  parseDotEnv,
} from "./project-env.ts";

describe("project MiniMax env", () => {
  it("parses MiniMax keys from a dotenv file", () => {
    const file = parseDotEnv(`
# comment
MINIMAX_CN_API_KEY=sk-cp-testkeytestkeytestkey
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic
MINIMAX_MODEL=MiniMax-M3
HTTPS_PROXY=http://127.0.0.1:7897
`);
    assert.equal(file.MINIMAX_CN_API_KEY?.startsWith("sk-cp-"), true);
    assert.equal(file.MINIMAX_BASE_URL, "https://api.minimaxi.com/anthropic");
    assert.equal(file.HTTPS_PROXY, "http://127.0.0.1:7897");
  });

  it("lets the project file beat a hijacked ANTHROPIC proxy token", () => {
    const env: Record<string, string | undefined> = {
      ANTHROPIC_AUTH_TOKEN: "PROXY_xxxx",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:15721",
      MINIMAX_CN_API_KEY: "PROXY_stale",
    };
    applyProjectLlmEnv(
      {
        MINIMAX_CN_API_KEY: "sk-cp-from-project-file-123456",
        MINIMAX_BASE_URL: "https://api.minimaxi.com/anthropic",
      },
      env,
    );
    assert.equal(env.MINIMAX_CN_API_KEY, "sk-cp-from-project-file-123456");
    assert.equal(env.ANTHROPIC_BASE_URL, "http://127.0.0.1:15721");
    assert.equal(env.MINIMAX_BASE_URL, "https://api.minimaxi.com/anthropic");
  });

  it("rejects shim tokens and localhost base URLs", () => {
    assert.equal(isRealLlmKey("PROXY_abc"), false);
    assert.equal(isRealLlmKey("short"), false);
    assert.equal(isRealLlmKey("sk-cp-gC-real-key-value-here-ok"), true);
    const prev = process.env.MINIMAX_BASE_URL;
    process.env.MINIMAX_BASE_URL = "http://127.0.0.1:15721";
    try {
      assert.equal(minimaxBaseUrl(), "https://api.minimaxi.com/anthropic");
    } finally {
      if (prev === undefined) delete process.env.MINIMAX_BASE_URL;
      else process.env.MINIMAX_BASE_URL = prev;
    }
  });
});
