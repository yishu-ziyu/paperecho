import assert from "node:assert/strict";
import { spawn, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Bounded subprocess verification for the gate's unified cleanup path.
// Spawns the REAL gate script (production cleanup implementation, not a fake),
// waits for server boot, SIGTERMs it mid-run, and asserts full cleanup.
// Never reads or prints .env CONTENT — only sha256 equality (boolean).
const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const GATE = join(REPO, "scripts", "e2e", "game-release-smoke.mjs");
const DOTENV = join(REPO, ".env");
const DOTENV_BAK = join(REPO, ".env.release-gate-bak");

function dotenvHash() {
  try {
    return createHash("sha256").update(readFileSync(DOTENV)).digest("hex");
  } catch {
    return null; // no .env: nothing to hide, still assert no bak + cleanup
  }
}

function scratchSet() {
  return new Set(readdirSync(tmpdir()).filter((n) => n.startsWith("pe-release-")));
}

function chromiumGatePids() {
  try {
    const out = execSync('pgrep -f "user-data-dir=.*pe-release" || true', { encoding: "utf8" });
    return new Set(out.split("\n").map((s) => s.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function pickFreePort(candidates) {
  for (const port of candidates) {
    try {
      execSync(`node -e "require('node:net').createConnection({host:'127.0.0.1',port:${port}}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"`, { timeout: 5000 });
    } catch {
      return port; // connection refused => free
    }
  }
  throw new Error("no free probe port");
}

async function portClosed(port, timeoutMs = 15000) {
  const net = await import("node:net");
  const t0 = Date.now();
  for (;;) {
    let closed = false;
    try {
      await new Promise((res, rej) => {
        const s = net.createConnection({ host: "127.0.0.1", port }, () => { s.end(); rej(new Error("open")); });
        s.on("error", () => res());
      });
      closed = true;
    } catch { /* still open */ }
    if (closed) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await delay(500);
  }
}

describe("signal-cleanup: SIGTERM runs the full production cleanup", () => {
  it("restores .env, frees the port, removes scratch, kills chromium", { timeout: 300000 }, async () => {
    const port = pickFreePort([8197, 8198, 8199, 8201, 8202]);
    const hashBefore = dotenvHash();
    const scratchBefore = scratchSet();
    const chromiumBefore = chromiumGatePids();

    const child = spawn("node", [GATE, "--port", String(port)], {
      cwd: REPO, stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.stdout.on("data", (d) => { stdout += String(d); });
    const childLog = `/tmp/signal-probe-child-${port}.log`;
    child.on("exit", () => {
      // Best-effort forensics: if the child died on its own (not via our
      // SIGTERM), its own output explains whether the gate flaked.
      try {
        writeFileSync(childLog, `STDERR:\n${stderr}\nSTDOUT:\n${stdout}`);
      } catch { /* ignore */ }
    });

    // Wait for server boot (bounded), then let the run reach the live
    // browser matrix so the cleanup has a browser + server + scratch to kill.
    const t0 = Date.now();
    while (!stderr.includes("[release-smoke] server-ready")) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`gate child died before server-ready (code=${child.exitCode})`);
      }
      if (Date.now() - t0 > 150000) {
        child.kill("SIGKILL");
        throw new Error("gate never reached server-ready within 150s");
      }
      await delay(500);
    }
    await delay(20000); // mid title-matrix: browser + vite + scratch all live

    child.kill("SIGTERM");
    const exit = await new Promise((res) => {
      const timer = setTimeout(() => res({ timeout: true }), 45000);
      child.on("exit", (code, signal) => { clearTimeout(timer); res({ code, signal }); });
    });
    assert.equal(exit.timeout ?? false, false, "child did not exit within 45s of SIGTERM");
    assert.equal(exit.code, 143, `want signal-exit code 143, got code=${exit.code} signal=${exit.signal}`);

    // .env restored with identical hash (content never printed, only compared).
    assert.equal(dotenvHash(), hashBefore, ".env hash changed across SIGTERM run");
    assert.equal(existsSync(DOTENV_BAK), false, ".env.release-gate-bak left behind");

    // Port freed, scratch gone, no new chromium user-data processes.
    assert.equal(await portClosed(port), true, `port ${port} still listening after SIGTERM`);
    const scratchAfter = scratchSet();
    for (const n of scratchAfter) {
      assert.ok(scratchBefore.has(n), `scratch leftover: ${n}`);
    }
    const t1 = Date.now();
    for (;;) {
      const now = chromiumGatePids();
      const leaked = [...now].filter((p) => !chromiumBefore.has(p));
      if (leaked.length === 0) break;
      if (Date.now() - t1 > 15000) assert.fail(`chromium strays survive SIGTERM: ${leaked.join(",")}`);
      await delay(500);
    }
  });
});
