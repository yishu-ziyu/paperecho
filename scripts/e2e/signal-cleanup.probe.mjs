import assert from "node:assert/strict";
import { spawn, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Bounded subprocess verification for the gate's signal cleanup path.
// Spawns the REAL gate script (default) — or the file named by
// SIGNAL_PROBE_GATE (negative-proof hook: point it at the pre-fix gate) —
// waits for server boot, SIGTERMs mid-run (single case, or a second SIGTERM
// ~150ms later while the first cleanup is still in flight), and asserts the
// full cleanup: exit 143, .env restored byte-identical, port freed, scratch
// gone, no stray chromium.
// Never reads or prints .env CONTENT — only sha256 equality (boolean).
const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const GATE = resolve(
  process.env.SIGNAL_PROBE_GATE ?? join(REPO, "scripts", "e2e", "game-release-smoke.mjs"),
);
const DOTENV = join(REPO, ".env");
const DOTENV_BAK = join(REPO, ".env.release-gate-bak");
// Gitignored (artifacts/ is in .gitignore): failure forensics land here,
// never in /tmp and never in git.
const FAILURE_LOG_DIR = join(REPO, "artifacts", "release-smoke");

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

function waitExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((res) => {
    const timer = setTimeout(() => res({ timeout: true }), timeoutMs);
    child.on("exit", (code, signal) => { clearTimeout(timer); res({ code, signal }); });
  });
}

/**
 * Reclaim `port` if a SIGKILLed gate left an orphaned vite listening on it:
 * locate the LISTEN owner, SIGTERM, and SIGKILL only if it survives. Returns
 * null when the port ends closed, else a human-readable anomaly.
 */
async function ensurePortClosed(port) {
  if (await portClosed(port, 3000)) return null;
  let pids = [];
  try {
    pids = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN || true`, { encoding: "utf8" })
      .split("\n").map((s) => s.trim()).filter(Boolean).map(Number);
  } catch { /* lsof unavailable: fall through to the final check */ }
  for (const pid of pids) {
    try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
  }
  if (pids.length > 0 && !(await portClosed(port, 5000))) {
    for (const pid of pids) {
      try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
    }
  }
  return (await portClosed(port, 5000))
    ? null
    : `port ${port} still listening after recovery (tried: ${pids.join(",") || "owner not found"})`;
}

/** Best-effort SIGKILL of pe-release chromium processes this run created. */
function killChromiumStrays(beforeSet) {
  try {
    const out = execSync('pgrep -f "user-data-dir=.*pe-release" || true', { encoding: "utf8" });
    for (const pid of out.split("\n").map((s) => s.trim()).filter(Boolean)) {
      if (!beforeSet.has(pid)) {
        try { process.kill(Number(pid), "SIGKILL"); } catch { /* already gone */ }
      }
    }
  } catch { /* best-effort */ }
}

/**
 * One gate-kill scenario with full self-cleanup. The child lifecycle is
 * wrapped in try/catch/finally: child dies before ready / assertion fails /
 * 45s exit timeout / probe bug — the finally ALWAYS (a) SIGKILLs a surviving
 * child and waits (bounded) for its real exit, (b) restores .env from a
 * bak-only state via atomic rename (both files present -> never delete,
 * record the anomaly), (c) ends with the port closed (SIGTERM->SIGKILL a
 * vite orphan), (d) SIGKILLs pe-release chromium strays, (e) removes
 * pe-release scratch dirs this run created. Child stdout/stderr stay in
 * memory; on success nothing is written anywhere, on failure they are dumped
 * into the gitignored artifacts/release-smoke/.
 */
async function runSignalScenario({ candidates, label, secondSignalMs }) {
  const port = pickFreePort(candidates);
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
  const anomalies = [];

  try {
    // Wait for server boot (bounded), then let the run reach the live
    // browser matrix so the cleanup has a browser + server + scratch to kill.
    const t0 = Date.now();
    while (!stderr.includes("[release-smoke] server-ready")) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`gate child died before server-ready (code=${child.exitCode})`);
      }
      if (Date.now() - t0 > 150000) {
        throw new Error("gate never reached server-ready within 150s");
      }
      await delay(500);
    }
    await delay(20000); // mid title-matrix: browser + vite + scratch all live

    child.kill("SIGTERM");
    if (secondSignalMs !== null) {
      await delay(secondSignalMs); // lands while the first cleanup is still running
      child.kill("SIGTERM");
    }
    const exit = await waitExit(child, 45000);
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
    return { port };
  } catch (e) {
    // Failure forensics into the gitignored artifacts dir; success path
    // never writes a log at all.
    try {
      mkdirSync(FAILURE_LOG_DIR, { recursive: true });
      writeFileSync(
        join(FAILURE_LOG_DIR, `signal-probe-fail-${label}.log`),
        `gate=${GATE}\nport=${port}\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`,
      );
    } catch { /* ignore */ }
    throw e;
  } finally {
    // ---- probe self-cleanup: never leave worse pollution than the bug under test ----
    // (a) SIGKILL a surviving child, bounded wait for the real exit.
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
      const t2 = Date.now();
      while (child.exitCode === null && child.signalCode === null && Date.now() - t2 < 10000) {
        await delay(200);
      }
    }
    // (b) .env / backup: bak-only -> atomic rename restore; both present ->
    //     never delete on the probe's own authority, record for a human.
    try {
      const bak = existsSync(DOTENV_BAK);
      const env = existsSync(DOTENV);
      if (bak && !env) renameSync(DOTENV_BAK, DOTENV);
      else if (bak && env) {
        anomalies.push(".env and .env.release-gate-bak coexist — left untouched, human inspection required");
      }
    } catch (e) {
      anomalies.push(`.env recovery failed: ${e.message}`);
    }
    // (c) Port must end closed even if the gate was SIGKILLed.
    const portNote = await ensurePortClosed(port);
    if (portNote) anomalies.push(portNote);
    // (d) Chromium strays (best-effort) and (e) scratch dirs this run created.
    killChromiumStrays(chromiumBefore);
    for (const n of scratchSet()) {
      if (!scratchBefore.has(n)) {
        try { rmSync(join(tmpdir(), n), { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }
    for (const a of anomalies) console.error(`[signal-probe:${label}] ANOMALY: ${a}`);
  }
}

// Disjoint candidate pools: the two cases must never contend for a port.
const SINGLE_PORTS = [8197, 8198, 8199, 8201, 8202];
const REPEATED_PORTS = [8211, 8212, 8213, 8214, 8215];

describe("signal-cleanup: SIGTERM runs the full production cleanup", () => {
  it("single SIGTERM: restores .env, frees the port, removes scratch, kills chromium",
    { timeout: 300000 },
    async () => { await runSignalScenario({ candidates: SINGLE_PORTS, label: "single", secondSignalMs: null }); });
});

describe("signal-cleanup: repeated SIGTERM awaits ONE shared cleanup", () => {
  it("second SIGTERM ~150ms into cleanup: still exit 143, .env restored, port freed, nothing left",
    { timeout: 300000 },
    async () => { await runSignalScenario({ candidates: REPEATED_PORTS, label: "repeated", secondSignalMs: 150 }); });
});
