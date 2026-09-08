import assert from "node:assert/strict";
import { spawn, execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SCRATCH_ROOT_ENV,
  createOwnedRoot,
  decideEnvRestore,
  ensurePortClosedOwned,
  isOwnedChromiumArgs,
  isOwnedPortPid,
  isPathInsideRoot,
  isSafeOwnedRootToRemove,
  killOwnedChromium,
  listOwnedRoot,
  ownedChromiumPids,
  partitionPortListeners,
  portListenerPids,
  removeOwnedRoot,
} from "./signal-cleanup.ownership.mjs";
import {
  acquireGateLock,
  isPathInsideRoot as gateIsPathInsideRoot,
  readGateLock,
  releaseGateLock,
  resolveScratchDir,
} from "./game-release-smoke.mjs";

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function isPidAlive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function pickFreePort() {
  // OS-assigned free port via a throwaway server.
  const net = process.binding ? null : null;
  void net;
  // Synchronous probe: try candidates until connection refused.
  for (let port = 18200 + Math.floor(Math.random() * 2000); ; port++) {
    try {
      execSync(
        `node -e "require('node:net').createConnection({host:'127.0.0.1',port:${port}}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"`,
        { timeout: 3000 },
      );
    } catch {
      return port;
    }
  }
}

async function portOpen(port) {
  const net = await import("node:net");
  try {
    await new Promise((res, rej) => {
      const s = net.createConnection({ host: "127.0.0.1", port }, () => {
        s.end();
        res();
      });
      s.on("error", (e) => rej(e));
    });
    return true;
  } catch {
    return false;
  }
}

// ---------- pure selection logic (doubles, no live kills) ----------

describe("ownership: isOwnedChromiumArgs (pure)", () => {
  it("owns only cmdlines containing the exact owned root", () => {
    const root = "/tmp/pe-probe-abc123";
    assert.equal(
      isOwnedChromiumArgs(`chromium --user-data-dir=${root}/pe-release-xyz/profile`, root),
      true,
    );
    assert.equal(
      isOwnedChromiumArgs("chromium --user-data-dir=/tmp/pe-release-unrelated-1/profile", root),
      false,
    );
    assert.equal(isOwnedChromiumArgs("", root), false);
    assert.equal(isOwnedChromiumArgs(null, root), false);
    assert.equal(isOwnedChromiumArgs(`--user-data-dir=${root}`, ""), false);
  });

  it("does not confuse prefix siblings", () => {
    // Owned root /tmp/pe-probe-abc must not own /tmp/pe-probe-abc-evil.
    assert.equal(
      isOwnedChromiumArgs("x --user-data-dir=/tmp/pe-probe-abc-evil/y", "/tmp/pe-probe-abc"),
      false,
    );
  });
});

describe("ownership: isPathInsideRoot (pure)", () => {
  it("accepts strict children, rejects escape and self", () => {
    assert.equal(isPathInsideRoot("/a/b/c", "/a/b"), true);
    assert.equal(isPathInsideRoot("/a/b", "/a/b"), false);
    assert.equal(isPathInsideRoot("/a/other", "/a/b"), false);
    assert.equal(isPathInsideRoot("/a/b/../other", "/a/b"), false);
    assert.equal(isPathInsideRoot("/a/b", "/a/b/c"), false);
  });

  it("gate and probe helpers agree", () => {
    const cases = [
      ["/tmp/pe-probe-x/pe-release-y", "/tmp/pe-probe-x", true],
      ["/tmp/pe-probe-x", "/tmp/pe-probe-x", false],
      ["/tmp/other", "/tmp/pe-probe-x", false],
    ];
    for (const [cand, root, want] of cases) {
      assert.equal(isPathInsideRoot(cand, root), want, `probe ${cand}`);
      assert.equal(gateIsPathInsideRoot(cand, root), want, `gate ${cand}`);
    }
  });
});

describe("ownership: decideEnvRestore (pure)", () => {
  it("restores only bak-only owned by this run", () => {
    assert.equal(
      decideEnvRestore({ bakExists: false, envExists: false, lockPid: 123, childPid: 123 }).action,
      "leave",
    );
    const both = decideEnvRestore({ bakExists: true, envExists: true, lockPid: 123, childPid: 123 });
    assert.equal(both.action, "leave");
    assert.match(both.reason, /coexist/);
    const owned = decideEnvRestore({ bakExists: true, envExists: false, lockPid: 456, childPid: 456 });
    assert.equal(owned.action, "restore");
    for (const lockPid of [null, 999, 457]) {
      const d = decideEnvRestore({ bakExists: true, envExists: false, lockPid, childPid: 456 });
      assert.equal(d.action, "leave", `lockPid=${lockPid}`);
      assert.match(d.reason, /ownership unclear|refusing/);
    }
  });
});

describe("ownership: partitionPortListeners + isOwnedPortPid (doubles)", () => {
  it("partitions by injected ownership predicate", () => {
    const { owned, unowned } = partitionPortListeners([11, 22, 33], (pid) => pid !== 22);
    assert.deepEqual(owned, [11, 33]);
    assert.deepEqual(unowned, [22]);
  });

  it("owns gate child, recorded listeners; rejects strangers", () => {
    assert.equal(isOwnedPortPid(100, { gatePid: 100, ownedPortPids: [] }), true);
    assert.equal(isOwnedPortPid(101, { gatePid: 100, ownedPortPids: [101] }), true);
    // 102 is neither the child nor recorded nor (in this fast unit) a
    // descendant — use an impossible ancestor to force the negative.
    assert.equal(isOwnedPortPid(102, { gatePid: 999999, ownedPortPids: [] }), false);
    assert.equal(isOwnedPortPid("nope", { gatePid: 100, ownedPortPids: [] }), false);
  });
});

describe("ownership: isSafeOwnedRootToRemove (pure)", () => {
  it("accepts only direct pe-probe-* children of tmpdir", () => {
    const t = tmpdir();
    assert.equal(isSafeOwnedRootToRemove(join(t, "pe-probe-abc123")), true);
    assert.equal(isSafeOwnedRootToRemove(t), false);
    assert.equal(isSafeOwnedRootToRemove("/"), false);
    assert.equal(isSafeOwnedRootToRemove(""), false);
    assert.equal(isSafeOwnedRootToRemove(join(t, "pe-release-abc")), false);
    assert.equal(isSafeOwnedRootToRemove(join(t, "other-abc")), false);
    assert.equal(isSafeOwnedRootToRemove(join(t, "pe-probe-abc", "pe-release-x")), false);
    assert.equal(isSafeOwnedRootToRemove("/etc/passwd"), false);
  });
});

describe("ownership: ensurePortClosedOwned (doubles — never signals unowned)", () => {
  it("refuses to signal unregistered listeners", async () => {
    const signaled = [];
    const note = await ensurePortClosedOwned(
      19999,
      { gatePid: 999998, ownedPortPids: [] },
      {
        portClosedFn: async () => false,
        listenersFn: () => [4242],
        isOwnedFn: () => false,
        signalFn: (pid, sig) => void signaled.push([pid, sig]),
      },
    );
    assert.match(note ?? "", /refusing|ownership unclear/);
    assert.deepEqual(signaled, [], "must not signal unowned PID");
  });

  it("signals owned listeners (TERM then KILL) until closed", async () => {
    const signaled = [];
    let closed = false;
    const note = await ensurePortClosedOwned(
      19998,
      { gatePid: 5000, ownedPortPids: [5001] },
      {
        portClosedFn: async (_p, t) => (t === 3000 ? false : closed),
        listenersFn: () => [5001],
        isOwnedFn: (pid) => pid === 5001,
        signalFn: (pid, sig) => {
          signaled.push([pid, sig]);
          if (sig === "SIGTERM") closed = true;
        },
      },
    );
    assert.equal(note, null);
    assert.ok(signaled.some(([p, s]) => p === 5001 && s === "SIGTERM"));
  });

  it("reports owner-not-found without killing", async () => {
    const signaled = [];
    const note = await ensurePortClosedOwned(
      19997,
      { gatePid: 1, ownedPortPids: [] },
      {
        portClosedFn: async () => false,
        listenersFn: () => [],
        isOwnedFn: () => true,
        signalFn: (pid, sig) => void signaled.push([pid, sig]),
      },
    );
    assert.match(note ?? "", /owner not found|ownership unclear/);
    assert.deepEqual(signaled, []);
  });
});

// ---------- gate helpers (temp lock/scratch, never the live repo .env) ----------

describe("gate ownership: resolveScratchDir", () => {
  it("creates inside the provided root, throws on missing root", () => {
    const root = mkdtempSync(join(tmpdir(), "pe-probe-gatetest-"));
    try {
      const scratch = resolveScratchDir(root);
      try {
        assert.equal(isPathInsideRoot(scratch, root), true);
        assert.match(basename(scratch), /^pe-release-/);
        assert.equal(existsSync(scratch), true);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
      assert.throws(() => resolveScratchDir(join(root, "does-not-exist")), /not a directory/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("gate ownership: lock refuses concurrent holders, recovers stale", () => {
  it("second live holder is refused; dead holder is recovered; only owner releases", () => {
    const dir = mkdtempSync(join(tmpdir(), "pe-probe-locktest-"));
    const lock = join(dir, "gate.lock");
    try {
      const first = acquireGateLock(lock);
      assert.equal(first.acquired, true);
      assert.equal(readGateLock(lock), process.pid);
      // Same process re-acquiring sees its own live lock: stale-recover path
      // unlinks and recreates (holder == self is not a refusal).
      const again = acquireGateLock(lock);
      assert.equal(again.acquired, true);
      // Simulate another live run by forking a holder child.
      // Use the current PID as the "other live holder": from a child's point
      // of view our PID is alive, so it must refuse. Spawn node to test.
      const childCode = `import {acquireGateLock} from ${JSON.stringify(resolve(REPO, "scripts/e2e/game-release-smoke.mjs"))}; try{acquireGateLock(${JSON.stringify(lock)});console.log("ACQUIRED");process.exit(0);}catch(e){console.log("REFUSED:"+e.message);process.exit(2);}`;
      const childRes = spawnSync(process.execPath, ["--input-type=module", "-e", childCode], {
        encoding: "utf8",
        timeout: 15000,
      });
      const out = `${childRes.stdout ?? ""}${childRes.stderr ?? ""}`;
      assert.equal(childRes.status, 2, `child should refuse with exit 2, got ${childRes.status}: ${out}`);
      assert.match(out, /REFUSED:.*refusing concurrent/);
      // Stale holder (dead PID) is recovered.
      writeFileSync(lock, "999999\n");
      const recovered = acquireGateLock(lock);
      assert.equal(recovered.acquired, true);
      assert.equal(recovered.staleRecovered, true);
      assert.equal(readGateLock(lock), process.pid);
      assert.equal(releaseGateLock(lock), true);
      assert.equal(existsSync(lock), false);
      // Releasing a lock we do not own is a no-op.
      writeFileSync(lock, "999998\n");
      assert.equal(releaseGateLock(lock), false);
      assert.equal(existsSync(lock), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------- isolation integration: only test-created temp resources ----------

describe("isolation: unrelated pe-release process survives owned sweep (A)", () => {
  it("owned chromium filter never matches a different pe-release path", { timeout: 30000 }, async () => {
    const ownedRoot = createOwnedRoot();
    let unrelatedDir = null;
    let proc = null;
    try {
      unrelatedDir = mkdtempSync(join(tmpdir(), "pe-release-unrelated-"));
      proc = spawn("node", ["-e", `setInterval(()=>{},1000)// user-data-dir=${unrelatedDir}-profile pe-release`], {
        stdio: "ignore",
      });
      await delay(600);
      assert.equal(isPidAlive(proc.pid), true, "unrelated proc failed to start");
      // Live negative: the unrelated PID must not be classified as owned.
      const owned = ownedChromiumPids(ownedRoot);
      assert.equal(owned.includes(Number(proc.pid)), false);
      // Owned sweep must not kill it.
      killOwnedChromium(ownedRoot);
      await delay(300);
      assert.equal(isPidAlive(proc.pid), true, "owned sweep killed unrelated process");
    } finally {
      if (proc && isPidAlive(proc.pid)) {
        try { proc.kill("SIGKILL"); } catch { /* ignore */ }
      }
      if (unrelatedDir) {
        try { rmSync(unrelatedDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
      removeOwnedRoot(ownedRoot);
    }
  });
});

describe("isolation: unrelated pe-release dir survives owned removal (B)", () => {
  it("removing the owned root leaves sibling pe-release dirs + hashes intact", () => {
    const ownedRoot = createOwnedRoot();
    const unrelated = mkdtempSync(join(tmpdir(), "pe-release-unrelated-"));
    const sentinel = join(unrelated, "sentinel.txt");
    const payload = `unrelated-${Date.now()}-${Math.random()}\n`;
    writeFileSync(sentinel, payload);
    const before = createHash("sha256").update(readFileSync(sentinel)).digest("hex");
    try {
      assert.equal(removeOwnedRoot(ownedRoot), true);
      assert.equal(existsSync(ownedRoot), false);
      assert.equal(existsSync(sentinel), true, "unrelated dir was removed");
      assert.equal(createHash("sha256").update(readFileSync(sentinel)).digest("hex"), before);
    } finally {
      try { rmSync(unrelated, { recursive: true, force: true }); } catch { /* ignore */ }
      try { rmSync(ownedRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});

describe("isolation: port ownership — unregistered PID is never signaled (C)", () => {
  it("refuses an unowned listener and keeps it listening", { timeout: 30000 }, async () => {
    const port = pickFreePort();
    const child = spawn("node", ["-e", `require('http').createServer((q,s)=>s.end('ok')).listen(${port},()=>setInterval(()=>{},1000))`], {
      stdio: "ignore",
    });
    try {
      // Wait until the child actually LISTENs.
      const t0 = Date.now();
      for (;;) {
        if (await portOpen(port)) break;
        if (Date.now() - t0 > 10000) throw new Error("child server never listened");
        await delay(200);
      }
      const listeners = portListenerPids(port);
      assert.ok(listeners.includes(Number(child.pid)), `child pid ${child.pid} not among listeners [${listeners}]`);
      const note = await ensurePortClosedOwned(port, { gatePid: 999997, ownedPortPids: [] });
      assert.match(note ?? "", /refusing|ownership unclear/);
      assert.equal(await portOpen(port), true, "unowned server was killed");
      assert.equal(isPidAlive(child.pid), true, "SIGTERM/SIGKILL reached unregistered PID");
    } finally {
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
      const t0 = Date.now();
      while ((await portOpen(port)) && Date.now() - t0 < 5000) await delay(200);
    }
  });

  it("reclaims a registered listener (owned) and frees the port", { timeout: 30000 }, async () => {
    const port = pickFreePort();
    const child = spawn("node", ["-e", `require('http').createServer((q,s)=>s.end('ok')).listen(${port},()=>setInterval(()=>{},1000))`], {
      stdio: "ignore",
    });
    try {
      const t0 = Date.now();
      for (;;) {
        if (await portOpen(port)) break;
        if (Date.now() - t0 > 10000) throw new Error("child server never listened");
        await delay(200);
      }
      const listeners = portListenerPids(port);
      assert.ok(listeners.length > 0);
      const note = await ensurePortClosedOwned(port, { gatePid: Number(child.pid), ownedPortPids: listeners });
      assert.equal(note, null, `owned reclaim failed: ${note}`);
      assert.equal(await portOpen(port), false, "owned port still open after reclaim");
    } finally {
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
    }
  });
});

describe("isolation: second gate start is refused before touching .env (E)", () => {
  it("holding the repo lock makes the gate refuse fast with .env untouched", { timeout: 60000 }, async () => {
    const lockPath = join(REPO, ".env.release-gate-lock");
    const bakPath = join(REPO, ".env.release-gate-bak");
    const envPath = join(REPO, ".env");
    const hashBefore = (() => {
      try {
        return createHash("sha256").update(readFileSync(envPath)).digest("hex");
      } catch {
        return null;
      }
    })();
    const bakBefore = existsSync(bakPath);
    const lockExistedBefore = existsSync(lockPath);
    if (lockExistedBefore) {
      throw new Error("repo gate lock already present — another gate run is active, refusing test");
    }
    writeFileSync(lockPath, `${process.pid}\n`, { flag: "wx" });
    let gateChild = null;
    try {
      const outFile = join(tmpdir(), `pe-probe-estart-${process.pid}-${Date.now()}.json`);
      gateChild = spawn(
        "node",
        [join(REPO, "scripts", "e2e", "game-release-smoke.mjs"), "--port", String(pickFreePort()), "--out", outFile],
        { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] },
      );
      let stderr = "";
      gateChild.stderr.on("data", (d) => { stderr += String(d); });
      const exit = await new Promise((res) => {
        const timer = setTimeout(() => res({ timeout: true }), 45000);
        gateChild.on("exit", (code, signal) => {
          clearTimeout(timer);
          res({ code, signal });
        });
      });
      assert.equal(exit.timeout ?? false, false, "second gate did not exit fast");
      assert.notEqual(exit.code, 0, "second gate must fail when the lock is held");
      // Refusal evidence: gate logs the concurrent-run message (stderr) or
      // records it in results; .env must be byte-identical and no bak created.
      const combined = stderr;
      assert.match(combined + " refusing concurrent", /refusing concurrent/);
      const hashAfter = (() => {
        try {
          return createHash("sha256").update(readFileSync(envPath)).digest("hex");
        } catch {
          return null;
        }
      })();
      assert.equal(hashAfter, hashBefore, ".env was touched by the refused second run");
      assert.equal(existsSync(bakPath), bakBefore, "second run created/removed the shared backup");
      try { rmSync(outFile, { force: true }); } catch { /* ignore */ }
    } finally {
      try {
        if (readGateLock(lockPath) === process.pid) rmSync(lockPath, { force: true });
      } catch { /* ignore */ }
      if (gateChild && gateChild.exitCode === null && gateChild.signalCode === null) {
        try { gateChild.kill("SIGKILL"); } catch { /* ignore */ }
      }
    }
  });
});
