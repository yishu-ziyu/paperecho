import assert from "node:assert/strict";
import { spawn, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SCRATCH_ROOT_ENV,
  createOwnedRoot,
  decideEnvRestore,
  ensurePortClosedOwned,
  isPathInsideRoot,
  isSafeOwnedRootToRemove,
  killOwnedChromium,
  listOwnedRoot,
  ownedChromiumPids,
  portClosed,
  portListenerPids,
  readGateLockPid,
  removeOwnedRoot,
} from "./signal-cleanup.ownership.mjs";

// Owned-resource verification for the gate's signal cleanup path.
// Spawns the REAL gate script (default) — or the file named by
// SIGNAL_PROBE_GATE (negative-proof hook: point it at the pre-fix gate) —
// waits for server boot, SIGTERMs mid-run (single case, or a second SIGTERM
// ~150ms later while the first cleanup is still in flight), and asserts the
// full cleanup: exit 143, .env restored byte-identical, port freed, OWNED
// scratch gone, no OWNED chromium strays.
//
// Ownership rule (this file's only authority):
// - The probe creates a unique owned root per scenario and passes it via
//   PE_RELEASE_GATE_SCRATCH_ROOT; the gate creates its pe-release-* scratch
//   ONLY inside it. Reclaim = rm that root. Global tmpdir scans are gone.
// - Chromium ownership = command line contains the owned root. Unrelated
//   pe-release processes never match and must survive.
// - Port ownership = gate child PID, a PID recorded at server-ready time, or
//   a live descendant of the gate child. Unregistered listeners are never
//   signaled — the probe reports ownership-unclear instead.
// - .env backup ownership = repo lock holder PID equals this scenario's gate
//   child PID. Otherwise the probe leaves .env/bak untouched for a human.
//
// Unprovable ownership => anomaly + failure, scene preserved. Never kill/rm
// on a guess. Never reads or prints .env CONTENT — only sha256 equality.
const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const GATE = resolve(
  process.env.SIGNAL_PROBE_GATE ?? join(REPO, "scripts", "e2e", "game-release-smoke.mjs"),
);
const DOTENV = join(REPO, ".env");
const DOTENV_BAK = join(REPO, ".env.release-gate-bak");
const DOTENV_LOCK = join(REPO, ".env.release-gate-lock");
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

function waitExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((res) => {
    const timer = setTimeout(() => res({ timeout: true }), timeoutMs);
    child.on("exit", (code, signal) => { clearTimeout(timer); res({ code, signal }); });
  });
}

function isPidAlive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * One gate-kill scenario with owned-only self-cleanup. The child lifecycle is
 * wrapped in try/catch/finally: child dies before ready / assertion fails /
 * 45s exit timeout / probe bug — the finally ALWAYS (a) SIGKILLs the OWNED
 * surviving child and waits (bounded) for its real exit, (b) restores .env
 * ONLY when the lock proves this run owns the backup (both files present or
 * unowned bak-only -> never delete, record the anomaly), (c) reclaims the
 * port ONLY when every listener is provably owned (else anomaly, no signals),
 * (d) SIGKILLs ONLY owned chromium (cmdline contains the owned root),
 * (e) removes ONLY the owned root. Unrelated pe-release-* dirs and processes
 * created alongside the run must survive all of it; the scenario creates one
 * of each per run and asserts their survival. Child stdout/stderr stay in
 * memory; on success nothing is written anywhere, on failure they are dumped
 * into the gitignored artifacts/release-smoke/.
 */
async function runSignalScenario({ candidates, label, secondSignalMs }) {
  const port = pickFreePort(candidates);
  const hashBefore = dotenvHash();
  // Owned root for THIS scenario. The gate's scratch/profile live only here.
  const ownedRoot = createOwnedRoot();
  assert.equal(
    isSafeOwnedRootToRemove(ownedRoot),
    true,
    `owned root failed safety guard: ${ownedRoot}`,
  );
  const child = spawn("node", [GATE, "--port", String(port)], {
    cwd: REPO,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, [SCRATCH_ROOT_ENV]: ownedRoot },
  });
  const gatePid = child.pid;
  let stderr = "";
  let stdout = "";
  child.stderr.on("data", (d) => { stderr += String(d); });
  child.stdout.on("data", (d) => { stdout += String(d); });
  const anomalies = [];
  // Unrelated resources this scenario creates (test-owned, must survive).
  // - unrelatedDir: pe-release-* name in the shared tmpdir (old global scans
  //   would have deleted it).
  // - unrelatedProc: cmdline contains user-data-dir=.*pe-release but lives
  //   under a different path (old pgrep-diff kills would have killed it).
  let unrelatedDir = null;
  let unrelatedSentinel = null;
  let unrelatedHashBefore = null;
  let unrelatedProc = null;

  const cleanupUnrelatedTestResources = () => {
    if (unrelatedProc && unrelatedProc.exitCode === null && unrelatedProc.signalCode === null) {
      try { unrelatedProc.kill("SIGKILL"); } catch { /* ignore */ }
    }
    if (unrelatedDir) {
      try { rmSync(unrelatedDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  };

  // Owned port listeners recorded while the gate is alive (server-ready).
  let ownedPortPids = [];

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
    // Gate proved it honors the owned root when its scratch log points inside.
    const scratchLog = (stderr.match(/\[release-smoke\] scratch=(\S+)/) ?? [])[1] ?? null;
    assert.ok(scratchLog, "gate did not log its owned scratch path");
    assert.equal(
      isPathInsideRoot(scratchLog, ownedRoot),
      true,
      `gate scratch escaped owned root: ${scratchLog} not inside ${ownedRoot}`,
    );
    // Record the port owner while the gate is alive: a free port we picked
    // that the gate just bound must be owned by this run.
    ownedPortPids = portListenerPids(port);
    assert.ok(ownedPortPids.length > 0, `no LISTEN owner found for gate port ${port}`);

    // Unrelated resources appear AFTER the gate is up (proves the "started
    // during the run" case from the acceptance contract).
    unrelatedDir = mkdtempSync(join(tmpdir(), "pe-release-unrelated-"));
    unrelatedSentinel = join(unrelatedDir, "sentinel.txt");
    writeFileSync(unrelatedSentinel, `unrelated-${label}-${Date.now()}\n`);
    unrelatedHashBefore = createHash("sha256").update(readFileSync(unrelatedSentinel)).digest("hex");
    unrelatedProc = spawn(
      "node",
      ["-e", `setInterval(()=>{},1000)// user-data-dir=${unrelatedDir}-profile pe-release`],
      { stdio: "ignore" },
    );
    await delay(500);
    assert.equal(
      isPidAlive(unrelatedProc.pid),
      true,
      "unrelated test process failed to start",
    );

    await delay(20000); // mid title-matrix: browser + vite + scratch all live

    // Owned scratch must be live inside the root before the kill.
    const ownedDuring = listOwnedRoot(ownedRoot);
    assert.ok(
      ownedDuring.some((n) => n.startsWith("pe-release-")),
      `owned scratch missing inside ${ownedRoot}: [${ownedDuring.join(",")}]`,
    );

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

    // Port freed (by the gate's own owned cleanup — the probe has not acted yet).
    assert.equal(await portClosed(port, 15000), true, `port ${port} still listening after SIGTERM`);
    // Owned scratch reclaimed by the gate; unrelated dir untouched.
    const ownedAfter = listOwnedRoot(ownedRoot);
    assert.deepEqual(
      ownedAfter.filter((n) => n.startsWith("pe-release-")),
      [],
      `owned scratch leftover inside ${ownedRoot}: [${ownedAfter.join(",")}]`,
    );
    assert.equal(existsSync(unrelatedSentinel), true, "unrelated pe-release dir was touched");
    assert.equal(
      createHash("sha256").update(readFileSync(unrelatedSentinel)).digest("hex"),
      unrelatedHashBefore,
      "unrelated sentinel hash changed",
    );
    // No OWNED chromium may survive. Unrelated pe-release procs must survive.
    const t1 = Date.now();
    for (;;) {
      const leaked = ownedChromiumPids(ownedRoot);
      if (leaked.length === 0) break;
      if (Date.now() - t1 > 15000) assert.fail(`owned chromium strays survive SIGTERM: ${leaked.join(",")}`);
      await delay(500);
    }
    assert.equal(
      ownedChromiumPids(ownedRoot).includes(Number(unrelatedProc.pid)),
      false,
      "unrelated process misclassified as owned",
    );
    assert.equal(isPidAlive(unrelatedProc.pid), true, "unrelated process died during gate run");
    return { port, ownedRoot };
  } catch (e) {
    // Failure forensics into the gitignored artifacts dir; success path
    // never writes a log at all.
    try {
      mkdirSync(FAILURE_LOG_DIR, { recursive: true });
      writeFileSync(
        join(FAILURE_LOG_DIR, `signal-probe-fail-${label}.log`),
        `gate=${GATE}\nport=${port}\nownedRoot=${ownedRoot}\ngatePid=${gatePid}\nownedPortPids=${ownedPortPids.join(",")}\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`,
      );
    } catch { /* ignore */ }
    throw e;
  } finally {
    // ---- probe self-cleanup: owned resources ONLY ----
    // (a) SIGKILL the OWNED surviving child, bounded wait for the real exit.
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
      const t2 = Date.now();
      while (child.exitCode === null && child.signalCode === null && Date.now() - t2 < 10000) {
        await delay(200);
      }
    }
    // (b) .env / backup / lock: restore ONLY when the lock proves this run
    //     owns the backup. Coexistence or unowned bak-only -> anomaly, untouched.
    try {
      const bak = existsSync(DOTENV_BAK);
      const env = existsSync(DOTENV);
      const lockPid = readGateLockPid(DOTENV_LOCK);
      const decision = decideEnvRestore({ bakExists: bak, envExists: env, lockPid, childPid: gatePid });
      if (decision.action === "restore") {
        renameSync(DOTENV_BAK, DOTENV);
      } else if (bak) {
        anomalies.push(decision.reason);
      }
    } catch (e) {
      anomalies.push(`.env recovery failed: ${e.message}`);
    }
    // (c) Port: reclaim ONLY when every listener is provably owned.
    //     Unregistered owners => anomaly, no signals sent.
    try {
      const portNote = await ensurePortClosedOwned(port, { gatePid, ownedPortPids });
      if (portNote) anomalies.push(portNote);
    } catch (e) {
      anomalies.push(`port recovery failed: ${e.message}`);
    }
    // (d) Chromium: ONLY owned (cmdline contains the owned root).
    try {
      killOwnedChromium(ownedRoot);
    } catch { /* best-effort */ }
    // Prove the probe's own chromium sweep spared the unrelated process
    // BEFORE the test tears it down itself.
    try {
      if (unrelatedProc && isPidAlive(unrelatedProc.pid)) {
        assert.equal(
          ownedChromiumPids(ownedRoot).includes(Number(unrelatedProc.pid)),
          false,
          "probe misclassified unrelated process as owned",
        );
      }
    } catch (e) {
      anomalies.push(`unrelated-process check failed: ${e.message}`);
    }
    // (e) Scratch: ONLY the owned root. Never scan the global tmpdir.
    try {
      if (!removeOwnedRoot(ownedRoot)) {
        anomalies.push(`owned root not removed (guard refused or missing): ${ownedRoot}`);
      }
    } catch (e) {
      anomalies.push(`owned root removal failed: ${e.message}`);
    }
    // Unrelated dir must still be intact AFTER the probe's owned sweep.
    // Only then may the test tear down its own unrelated resources.
    try {
      if (unrelatedSentinel && existsSync(unrelatedSentinel) && unrelatedHashBefore) {
        const h = createHash("sha256").update(readFileSync(unrelatedSentinel)).digest("hex");
        if (h !== unrelatedHashBefore) anomalies.push("unrelated sentinel hash changed during probe cleanup");
      } else if (unrelatedSentinel) {
        anomalies.push("unrelated pe-release dir went missing during probe cleanup");
      }
      if (unrelatedProc) {
        // Reap the test-owned process without ever routing it through the
        // owned-chromium path (it was never owned).
        if (!isPidAlive(unrelatedProc.pid)) {
          anomalies.push(`unrelated test process (pid ${unrelatedProc.pid}) died during probe cleanup`);
        }
      }
    } catch (e) {
      anomalies.push(`unrelated-resource verification failed: ${e.message}`);
    } finally {
      cleanupUnrelatedTestResources();
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
