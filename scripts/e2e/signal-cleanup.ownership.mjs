import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";

/**
 * Owned-resource selection for the signal-cleanup probe.
 *
 * Rule: cleanup only touches resources this run can prove it owns.
 * - Owned root: a unique directory the probe creates per scenario
 *   (mkdtemp pe-probe-*). The gate creates its pe-release-* scratch ONLY
 *   inside it (via PE_RELEASE_GATE_SCRATCH_ROOT). Reclaim = rm the root.
 * - Owned chromium: a process whose command line verifiably contains the
 *   owned root (user-data-dir inside it). Anything else — even with
 *   pe-release in its args — is unrelated and must survive.
 * - Owned port listener: the gate child PID itself, a PID recorded as the
 *   listener at server-ready time, or a live descendant of the gate child.
 *   Any other listener is unowned: report, never signal.
 * - Owned .env backup: only when the repo lock holder PID equals this
 *   scenario's gate child PID. Otherwise leave untouched for a human.
 *
 * Unprovable ownership => record anomaly, return failure, keep the scene.
 * Never kill / rm on a guess. No global tmpdir scans, no pgrep-diff kills.
 */

export const SCRATCH_ROOT_ENV = "PE_RELEASE_GATE_SCRATCH_ROOT";
export const OWNED_ROOT_PREFIX = "pe-probe-";
export const GATE_SCRATCH_PREFIX = "pe-release-";

/** Create this scenario's unique owned root. Caller owns its reclamation. */
export function createOwnedRoot(prefix = OWNED_ROOT_PREFIX) {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Guard: only an owned root may be recursively removed.
 * Must live directly inside the OS tmpdir and carry the owned prefix.
 * Rejects "", "/", tmpdir itself, traversal escapes, and pe-release-* names
 * (those are gate scratch dirs — removed only via their owned root).
 */
export function isSafeOwnedRootToRemove(candidate, tmpDir = tmpdir()) {
  try {
    if (!candidate || typeof candidate !== "string") return false;
    const t = resolve(String(tmpDir));
    const r = resolve(String(candidate));
    if (r === t) return false;
    if (r === "/" || r.length < t.length + 2) return false;
    if (!r.startsWith(`${t}/`)) return false;
    const base = basename(r);
    if (!base.startsWith(OWNED_ROOT_PREFIX)) return false;
    // Direct child of tmpdir only — never a nested gate scratch path.
    if (dirname(r) !== t) return false;
    const rel = relative(t, r);
    if (rel === "" || rel.startsWith("..") || rel.startsWith("/")) return false;
    return true;
  } catch {
    return false;
  }
}

/** Pure: does this command line prove the process uses our owned root?
 * Requires the owned root to appear as a directory prefix (`root/`), so
 * prefix siblings (`root-evil`) never match. */
export function isOwnedChromiumArgs(args, ownedRoot) {
  if (!args || !ownedRoot) return false;
  const root = String(ownedRoot).replace(/\/+$/, "");
  if (!root) return false;
  return String(args).includes(`${root}/`);
}

/** Pure: is `candidate` strictly inside `root` (no traversal escape)? */
export function isPathInsideRoot(candidate, root) {
  try {
    const rel = relative(resolve(root), resolve(candidate));
    if (rel === "" || rel === ".") return false;
    return !rel.startsWith("..") && !rel.startsWith("/");
  } catch {
    return false;
  }
}

/**
 * Pure .env decision. No filesystem access — caller supplies existence bits
 * plus the lock holder PID (null when absent/unparsable).
 * - no bak => nothing to do.
 * - bak + env coexist => never delete; anomaly for a human.
 * - bak-only + lock holder == childPid => owned, safe to restore.
 * - bak-only otherwise => ownership unclear; anomaly, leave untouched.
 */
export function decideEnvRestore({ bakExists, envExists, lockPid, childPid }) {
  if (!bakExists) return { action: "leave", reason: "no backup present" };
  if (bakExists && envExists) {
    return {
      action: "leave",
      reason: ".env and .env.release-gate-bak coexist — left untouched, human inspection required",
    };
  }
  // bak-only.
  if (lockPid !== null && lockPid !== undefined && childPid !== null && lockPid === childPid) {
    return { action: "restore", reason: "backup owned by this run (lock holder matches gate child)" };
  }
  return {
    action: "leave",
    reason: `.env backup ownership unclear (lock holder=${lockPid ?? "none"}, gate child=${childPid ?? "none"}) — refusing to restore, human inspection required`,
  };
}

/**
 * Pure port-listener partition. `isOwned` is injected so unit tests can use
 * doubles instead of live `ps` lookups.
 */
export function partitionPortListeners(listenerPids, isOwned) {
  const owned = [];
  const unowned = [];
  for (const pid of listenerPids) {
    (isOwned(pid) ? owned : unowned).push(pid);
  }
  return { owned, unowned };
}

// ---- live process helpers (thin wrappers; selection stays pure) ----

function psField(pid, field) {
  try {
    const out = execSync(`ps -p ${Number(pid)} -o ${field}=`, {
      encoding: "utf8",
      timeout: 5000,
    });
    return String(out).trim();
  } catch {
    return null;
  }
}

/** Full command line for `pid`, or null when gone. */
export function chromiumArgsForPid(pid) {
  return psField(pid, "command");
}

/** Parent PID for `pid`, or null when gone/unparsable. */
export function ppidOf(pid) {
  const raw = psField(pid, "ppid");
  if (!raw) return null;
  const n = Number.parseInt(String(raw).trim().split(/\s+/).pop() ?? "", 10);
  return Number.isInteger(n) ? n : null;
}

/** True iff `pid` is a live strict descendant of `ancestorPid` (bounded walk). */
export function isDescendantOf(pid, ancestorPid, maxDepth = 32) {
  let cur = Number(pid);
  const anc = Number(ancestorPid);
  if (!Number.isInteger(cur) || !Number.isInteger(anc) || cur === anc) return false;
  for (let i = 0; i < maxDepth; i++) {
    const ppid = ppidOf(cur);
    if (ppid === null) return false;
    if (ppid === anc) return true;
    if (ppid <= 1) return false;
    cur = ppid;
  }
  return false;
}

/**
 * Ownership test for a port listener. Owned iff it is the gate child itself,
 * was recorded as the listener at server-ready time, or is a live descendant
 * of the gate child. Everything else is unowned.
 */
export function isOwnedPortPid(pid, { gatePid, ownedPortPids = [] } = {}) {
  const n = Number(pid);
  if (!Number.isInteger(n)) return false;
  if (gatePid !== null && gatePid !== undefined && n === Number(gatePid)) return true;
  if (ownedPortPids.map(Number).includes(n)) return true;
  if (gatePid !== null && gatePid !== undefined) {
    try {
      if (isDescendantOf(n, Number(gatePid))) return true;
    } catch {
      /* fall through to unowned */
    }
  }
  return false;
}

/** PIDs currently LISTENing on `port` (empty when none / lsof unavailable). */
export function portListenerPids(port) {
  try {
    const out = execSync(`lsof -ti tcp:${Number(port)} -sTCP:LISTEN || true`, {
      encoding: "utf8",
      timeout: 8000,
    });
    return String(out)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

/** All pids whose cmdline matches the gate-chromium pattern (unfiltered). */
function allChromiumGateCandidates() {
  try {
    const out = execSync('pgrep -f "user-data-dir=.*pe-release" || true', {
      encoding: "utf8",
      timeout: 8000,
    });
    return String(out).split("\n").map((s) => s.trim()).filter(Boolean).map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

/**
 * Chromium PIDs provably owned by this run: candidates whose command line
 * contains the owned root. Unrelated pe-release processes never match —
 * their profile lives under a different path.
 */
export function ownedChromiumPids(ownedRoot) {
  if (!ownedRoot) return [];
  const out = [];
  for (const pid of allChromiumGateCandidates()) {
    try {
      const args = chromiumArgsForPid(pid);
      if (isOwnedChromiumArgs(args, ownedRoot)) out.push(pid);
    } catch {
      /* ignore races where the pid exits mid-check */
    }
  }
  return out;
}

/** SIGKILL only the owned chromium PIDs. Returns the PIDs signaled. */
export function killOwnedChromium(ownedRoot) {
  const killed = [];
  for (const pid of ownedChromiumPids(ownedRoot)) {
    try {
      process.kill(pid, "SIGKILL");
      killed.push(pid);
    } catch {
      /* already gone */
    }
  }
  return killed;
}

/** Names inside the owned root (empty when missing/unreadable). */
export function listOwnedRoot(root) {
  try {
    return readdirSync(root);
  } catch {
    return [];
  }
}

/** Remove ONLY the owned root (guarded). Returns true when removed. */
export function removeOwnedRoot(root) {
  if (!isSafeOwnedRootToRemove(root)) return false;
  try {
    rmSync(resolve(root), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/** Read the gate lock holder PID from the repo (null when absent/unparsable). */
export function readGateLockPid(lockPath) {
  try {
    const n = Number.parseInt(String(readFileSync(lockPath, "utf8")).trim(), 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** True when `port` refuses TCP connections (closed). Bounded poll helper. */
export async function portClosed(port, timeoutMs = 15000, delayMs = 500) {
  const net = await import("node:net");
  const { setTimeout: delay } = await import("node:timers/promises");
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
    await delay(delayMs);
  }
}

/**
 * Reclaim `port` ONLY when every current listener is provably owned.
 * Returns null when the port ends closed, else a human-readable anomaly.
 * Never signals an unowned PID: reports ownership-unclear and leaves the
 * scene intact. `deps` injects doubles for unit tests.
 */
export async function ensurePortClosedOwned(port, { gatePid, ownedPortPids = [] } = {}, deps = {}) {
  const portClosedFn = deps.portClosedFn ?? ((p, t) => portClosed(p, t, 500));
  const listenersFn = deps.listenersFn ?? (() => portListenerPids(port));
  const isOwnedFn = deps.isOwnedFn ?? ((pid) => isOwnedPortPid(pid, { gatePid, ownedPortPids }));
  const signalFn = deps.signalFn ?? ((pid, sig) => process.kill(pid, sig));
  if (await portClosedFn(port, 3000)) return null;
  let pids = [];
  try {
    pids = listenersFn();
    if (pids instanceof Promise) pids = await pids;
  } catch { pids = []; }
  pids = (Array.isArray(pids) ? pids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (pids.length === 0) {
    return `port ${port} still listening after recovery (owner not found) \u2014 ownership unclear, refusing to kill`;
  }
  const { owned, unowned } = partitionPortListeners(pids, isOwnedFn);
  if (unowned.length > 0) {
    return `port ${port} owned by unregistered PID(s) ${unowned.join(",")} \u2014 refusing to kill, ownership unclear (owned: ${owned.join(",") || "none"})`;
  }
  for (const pid of owned) {
    try { signalFn(pid, "SIGTERM"); } catch { /* already gone */ }
  }
  if (owned.length > 0 && !(await portClosedFn(port, 5000))) {
    for (const pid of owned) {
      try { signalFn(pid, "SIGKILL"); } catch { /* already gone */ }
    }
  }
  return (await portClosedFn(port, 5000))
    ? null
    : `port ${port} still listening after recovery (tried owned: ${owned.join(",") || "none"})`;
}
