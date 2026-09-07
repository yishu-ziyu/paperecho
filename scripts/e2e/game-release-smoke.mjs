#!/usr/bin/env node
/**
 * PaperEcho release smoke gate — deterministic no-key browser check.
 *
 * What it proves: the core game loop still works end to end through the real
 * UI (Title → Orbit → Fold → Throw → Flight → Encounter → Return → Archive →
 * New Journey) without any model key, external LLM/search request, or phase
 * shortcut. Exit 0 = pass, exit 1 = fail. Machine-readable report goes to
 * `artifacts/release-smoke/results.json` (gitignored).
 *
 * Reuses (read-only, no product changes):
 * - scripts/play-gestures.mjs — pull / dragToken player verbs.
 * - scripts/qa-full-journey.mjs — UI choreography per phase (adapted: no
 *   absolute /workspace paths, no networkidle, state assertions over sleeps).
 * - runtime-acceptance/title-reload/acceptance-loop.mjs — readiness pattern
 *   (fresh document + window.__echoGame + expected phase); React private fiber
 *   fields are deliberately NOT used.
 * - runtime-acceptance/run-nokey-smoke.mjs — seal two-step button flow and
 *   fetch-counting idea (its direct store manipulation is NOT reused).
 *
 * No-key guarantee (defense in depth, developer `.env` always restored):
 * 1. The repo `.env` is moved aside with an atomic same-directory rename
 *    before boot and moved back by the unified idempotent cleanup() — which
 *    normal completion, failure, SIGINT and SIGTERM all share.
 *    A sha256 taken before the move must match after the restore, or the run
 *    fails loudly. A leftover backup from a crashed run is recovered at
 *    startup (only when `.env` itself is missing; otherwise fail for a human).
 * 2. buildGateServerEnv() scrubs model keys (MINIMAX/AI_PING/ANTHROPIC),
 *    live-search keys (FIRECRAWL/ANYSEARCH) and proxy vars from the server
 *    child environment, and FORCES PAPER_ECHO_LIVE=0 so liveEnabled() is
 *    false even if a future search credential were ever missed.
 *    `hasApiKey()` is therefore false and live search is off by construction.
 * 3. Every non-loopback browser request that is NOT a known static asset is
 *    route-aborted in the browser AND recorded; any such request fails the
 *    run. meter.via must read "archive" after match and every turn.
 *    NOTE the evidence split: browserExternalRequests proves BROWSER egress
 *    is zero; the SERVER side is proven by construction (LIVE=0 + scrub),
 *    because page.route cannot observe Node server-side fetch.
 * 4. `.env` stat + hash are recorded before/after and must be identical.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { dragToken, pull } from "../play-gestures.mjs";
import { isMainModule } from "../with-app-env.mjs";

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const VIEWPORT = { width: 390, height: 844 };

function parseArgs(argv) {
  const out = {
    titleFresh: 3, titleReload: 5, enter: 2, space: 2,
    port: 8123, out: join(REPO, "artifacts", "release-smoke", "results.json"),
  };
  for (let i = 0; i < argv.length; i++) {
    const m = /--([a-z-]+)(?:=(.+))?/.exec(argv[i]);
    if (!m) throw new Error(`bad arg: ${argv[i]}`);
    const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const val = m[2] ?? argv[++i];
    if (!(key in out)) throw new Error(`unknown arg: --${m[1]}`);
    out[key] = key === "out" ? resolve(val) : Number(val);
    if (key !== "out" && !Number.isFinite(out[key])) throw new Error(`--${m[1]} needs a number`);
  }
  return out;
}

/**
 * Verbatim mirror of the product出口 guard (src/game/agent/exchange.ts:
 * META_LEAK + SOURCE_LEAK, the two halves of hasMetaLeak()). Source of truth
 * stays in the product + its unit tests (session.test.ts / exchange.test.ts);
 * this copy only lets the browser journey fail fast on visible leaks without
 * a real model. If the product rule changes, this mirror AND its unit test
 * below must change with it — scripts/e2e/game-release-smoke.test.mjs pins
 * both the leak hits and the must-not-kill night talk.
 */
const META_LEAK =
  /世界档案|工具调用|检索结果|检索到|tool\s*call|\b(?:search_cases|search_archive|remember|prompt)\b|(?:在|从|去)(?:我|咱|我们|咱们)?的?素材库[^。？！]{0,12}(?:看到|查到|搜到|翻到|找(?:到|过))|素材库[^。？！，]{0,6}(?:里|内)[^。？！，]{0,8}有(?:一条|一个|几条|个|个人|个案)/i;

/**
 * Known static-asset hosts, matched by EXACT hostname. These are deterministic
 * CDN font files — not LLM, search, or API traffic. They load normally (so the
 * page renders with real fonts) and are reported separately as
 * `externalStatic`; the zero-external gate applies to everything else.
 * Rationale: fonts cannot exfiltrate game state or answer prompts, and
 * aborting them would both degrade render fidelity and inject
 * ERR_BLOCKED_BY_CLIENT console noise caused by the harness itself.
 */
const STATIC_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

/**
 * Allowlisted non-blocking warnings, matched by EXACT substring — never by a
 * broad pattern. Empty until a concrete, proven-harmless warning is observed
 * with its verbatim text recorded here with reason + date.
 */
const ALLOWLISTED_WARNINGS = [];

/**
 * Credential names that must never reach the gate's dev-server child process.
 * Model keys (read by config.ts/llm.ts), live-search keys (read by
 * pipeline/sources/live.ts liveEnabled() + pipeline/web.ts), and proxy vars.
 * Only NAMES are ever recorded in results; values are never logged or stored.
 */
const MODEL_CREDENTIAL_KEYS = [
  "MINIMAX_CN_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL",
  "AI_PING_API_KEY", "PAPER_ECHO_LLM", "MINIMAX_BASE_URL", "MINIMAX_MODEL",
];
const SEARCH_CREDENTIAL_KEYS = ["FIRECRAWL_API_KEY", "ANYSEARCH_API_KEY"];
const PROXY_KEYS = [
  "HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "https_proxy", "http_proxy", "all_proxy",
];
const SCRUB_KEYS = [...MODEL_CREDENTIAL_KEYS, ...SEARCH_CREDENTIAL_KEYS, ...PROXY_KEYS];

/**
 * Build the gate server's environment from a base env. Pure: returns a new
 * object, never mutates the input, never reads or returns credential VALUES.
 *
 * - Deletes every model / live-search / proxy credential name.
 * - Forces PAPER_ECHO_LIVE=0 (not just deletion): liveEnabled() returns false
 *   on the explicit "0" even if a future search credential is ever missed.
 * - Forces VITE_AUTH_ENABLED=false so a host shell export cannot override the
 *   repo's own test configuration (repo default in .grok/app-env.json).
 */
function buildGateServerEnv(baseEnv) {
  const env = { ...baseEnv };
  for (const k of SCRUB_KEYS) delete env[k];
  env.PAPER_ECHO_LIVE = "0";
  env.VITE_AUTH_ENABLED = "false";
  return env;
}

/** Credential NAMES removed from a base env (for results evidence; no values). */
function scrubbedCredentialNames(baseEnv) {
  return SCRUB_KEYS.filter((k) => baseEnv[k] !== undefined);
}

function sh(cmd, cwd, opts = {}) {
  return execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts }).trim();
}

function dotenvStat() {
  try {
    const p = join(REPO, ".env");
    const s = statSync(p);
    const hash = createHash("sha256").update(readFileSync(p)).digest("hex");
    return { exists: true, size: s.size, mtimeMs: s.mtimeMs, sha256: hash };
  } catch {
    return { exists: false, size: 0, mtimeMs: 0, sha256: null };
  }
}

const DOTENV_BAK = join(REPO, ".env.release-gate-bak");

/** Crash recovery: a previous run died between move-aside and restore. */
function recoverStaleBackup() {
  let bakExists = true;
  try { statSync(DOTENV_BAK); } catch { bakExists = false; }
  if (!bakExists) return null;
  let envExists = true;
  try { statSync(join(REPO, ".env")); } catch { envExists = false; }
  if (!envExists) {
    renameSync(DOTENV_BAK, join(REPO, ".env"));
    return "recovered stale .env.release-gate-bak (previous run crashed before restore)";
  }
  throw new Error(".env.release-gate-bak exists alongside .env — human inspection required, refusing to run");
}

function moveDotenvAside() {
  try { statSync(join(REPO, ".env")); }
  catch { return false; } // no .env: nothing to hide, server is keyless by construction
  renameSync(join(REPO, ".env"), DOTENV_BAK); // same directory: atomic
  return true;
}

/** Unconditional restore. Returns true only if post-restore hash matches. */
function restoreDotenv(expectedHash) {
  let bakExists = true;
  try { statSync(DOTENV_BAK); } catch { bakExists = false; }
  if (!bakExists) {
    try { statSync(join(REPO, ".env")); return true; } // nothing was moved
    catch { return false; }
  }
  renameSync(DOTENV_BAK, join(REPO, ".env"));
  if (!expectedHash) return true;
  try {
    return createHash("sha256").update(readFileSync(join(REPO, ".env"))).digest("hex") === expectedHash;
  } catch {
    return false;
  }
}

/** TanStack Start encodes the callee in the POST path as base64 JSON. */
function serverFnOf(url) {
  const m = /\/_serverFn\/([A-Za-z0-9+/=_-]+)/.exec(url);
  if (!m) return null;
  try {
    const parsed = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
    const exp = String(parsed.export ?? "");
    for (const name of ["runMatch", "runTurn", "runSeal", "runVoice"]) {
      if (exp.startsWith(`${name}_`)) return name;
    }
    return `unknown:${exp.slice(0, 40)}`;
  } catch {
    return "undecodable";
  }
}

function isLoopback(url) {
  try {
    const u = new URL(url);
    return ["127.0.0.1", "localhost", "::1"].includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Set by shutdown() when a signal owns the process exit. Module scope so the
 * top-level entry can yield to the signal path (see bottom of file).
 */
let signaled = null;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const gitHead = sh("git rev-parse HEAD", REPO);
  const envBefore = dotenvStat();
  const scratch = mkdtempSync(join(tmpdir(), "pe-release-"));
  const profileDir = join(scratch, "profile");
  let dotenvMoved = false;

  const R = {
    gitHead, startedAt, finishedAt: null, browser: "chromium-headless", viewport: VIEWPORT,
    args: { titleFresh: args.titleFresh, titleReload: args.titleReload, enter: args.enter, space: args.space },
    phaseResults: {}, requestCounts: {},
    // browserExternalRequests: what Playwright's route layer actually observed
    // (browser egress ONLY — it cannot see Node server-side fetch).
    browserExternalRequests: [], externalStatic: [],
    // serverLiveSearchForcedOff: the server side is proven by CONSTRUCTION
    // (PAPER_ECHO_LIVE=0 + credential scrub), not by browser observation.
    serverLiveSearchForcedOff: false, scrubbedCredentialNames: [],
    consoleErrors: [], pageErrors: [], failedRequests: [], allowlistedWarnings: [],
    persistenceChecks: {}, dotenv: { before: envBefore, after: null, restoredHashOk: null },
    pass: false, failureReason: null,
  };
  const steps = [];
  const step = (name, ok, ms, detail = "") => {
    steps.push({ name, ok, ms, detail: String(detail).slice(0, 300) });
    if (!ok && !R.failureReason) R.failureReason = `${name}: ${detail}`.slice(0, 300);
    return ok;
  };

  let server = null;
  let browser = null;
  let port = args.port;
  const outPath = args.out;
  const failShot = join(dirname(outPath), `fail-${Date.now()}.png`);
  let page = null;
  /** Restore .env (idempotent) and verify. Throws on hash mismatch. */
  function restoreEnvOrFail() {
    if (dotenvMoved) {
      const hashOk = restoreDotenv(envBefore.sha256);
      R.dotenv.restoredHashOk = hashOk;
      if (!hashOk) throw new Error(".env restore hash mismatch — secrets kept in .env.release-gate-bak, inspect manually");
    } else {
      R.dotenv.restoredHashOk = true;
    }
    const after = dotenvStat();
    R.dotenv.after = after;
    const norm = (s) => JSON.stringify({ ...s, mtimeMs: 0 });
    if (norm(after) !== norm(envBefore)) throw new Error(".env stat changed during run");
  }

  /**
   * Unified, idempotent cleanup. Normal completion, test failure, SIGINT and
   * SIGTERM ALL pass through here exactly once: close the browser, SIGTERM
   * the with-app-env wrapper (it forwards to Vite), SIGKILL past a bounded
   * wait, restore .env, delete scratch/profile. Never exits by itself — the
   * caller (main return or shutdown) decides the exit code.
   */
  let cleanupDone = false;
  async function cleanup() {
    if (cleanupDone) return;
    cleanupDone = true;
    try { await browser?.close(); } catch { /* ignore */ }
    try {
      if (server && server.exitCode === null && server.signalCode === null) {
        server.kill("SIGTERM");
        const t0 = Date.now();
        while (server.exitCode === null && server.signalCode === null && Date.now() - t0 < 8000) {
          await delay(200);
        }
        if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
      }
    } catch { /* ignore */ }
    try { restoreDotenv(envBefore.sha256); } catch { /* best-effort safety net */ }
    try { rmSync(scratch, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  /** Signal entry: full cleanup first, exit code last. Never exits directly. */
  async function shutdown(code) {
    signaled = code; // main() must yield the exit to this path (see bottom)
    try { await cleanup(); } finally { process.exit(code); }
  }

  const finish = (pass) => {
    R.finishedAt = new Date().toISOString();
    R.pass = pass && !R.failureReason;
    if (!R.pass && !R.failureReason) R.failureReason = "unknown";
    R.phaseResults.steps = steps;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(R, null, 2));
    console.log(JSON.stringify({ pass: R.pass, failureReason: R.failureReason, out: outPath }, null, 2));
    return R.pass ? 0 : 1;
  };

  async function snapshot() {
    try {
      const g = await page.evaluate(() => window.__echoGame?.getState?.() ?? null);
      if (!g) return { phase: null };
      return {
        phase: g.phase, round: g.round, folds: g.folds ?? null,
        waitingEcho: g.waitingEcho, searching: g.searching,
        journeys: g.journeys?.length ?? null,
        firstJourneyId: g.journeys?.[0]?.id ?? null,
        echo: g.echo ? `${g.echo.name}·${g.echo.city}` : null,
        meterVia: g.meter?.via ?? null, meterTotal: g.meter?.total ?? null,
        region: g.region ?? null, recallEcho: (g.recall ?? []).filter((t) => t.who === "echo").length,
        recallYou: (g.recall ?? []).filter((t) => t.who === "you").length,
      };
    } catch {
      return { phase: null };
    }
  }

  async function waitState(desc, fn, timeoutMs) {
    const t0 = Date.now();
    for (;;) {
      try {
        if (await fn()) return Date.now() - t0;
      } catch { /* navigation in flight */ }
      if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting: ${desc}`);
      await delay(150);
    }
  }

  /** Reload with a bounded timeout + a single retry. Navigation hangs are an
   *  environmental (dev-server/HMR) flake class, not a product signal: the
   *  post-reload state assertions below still fully apply, so a genuinely
   *  broken boot still fails. */
  async function hardReload(label) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
        return attempt;
      } catch (e) {
        if (attempt === 2) throw new Error(`${label}: reload failed twice (${String(e.message).split("\n")[0]})`);
        await delay(1000);
      }
    }
  }

  /** Client-ready gate: fresh document + owned store + expected phase + calm flags. */
  async function waitReady(expectPhase = "title", timeoutMs = 25000) {
    const t0 = Date.now();
    await waitState(`ready(${expectPhase})`, async () => {
      const s = await snapshot();
      if (s.phase !== expectPhase || s.waitingEcho || s.searching) return false;
      return page.evaluate((sel) => Boolean(document.querySelector(sel)), '[data-pull="title"]');
    }, timeoutMs);
    await delay(350);
    return Date.now() - t0;
  }

  // Signal handlers are installed BEFORE any side effect (.env move, server
  // boot) so an early interrupt still runs the full cleanup path.
  process.on("SIGINT", () => void shutdown(130));
  process.on("SIGTERM", () => void shutdown(143));

  try {
    // ---- 1. Move .env aside (atomic rename; restored by cleanup) ------------
    const staleNote = recoverStaleBackup();
    if (staleNote) console.error(`[release-smoke] ${staleNote}`);
    dotenvMoved = moveDotenvAside();
    step("dotenv-aside", true, 0, dotenvMoved ? "moved, hash recorded" : "no .env present");

    // ---- 2. Server (fixed port, bump if occupied) ---------------------------
    const { spawn } = await import("node:child_process");
    let ready = false;
    let lastErr = "";
    for (let attempt = 0; attempt < 5 && !ready; attempt++) {
      try {
        const probe = await import("node:net");
        await new Promise((res, rej) => {
          const s = probe.createConnection({ host: "127.0.0.1", port }, () => { s.end(); rej(new Error("occupied")); });
          s.on("error", () => res());
        });
      } catch { port += 1; continue; }
      const env = buildGateServerEnv(process.env);
      R.scrubbedCredentialNames = scrubbedCredentialNames(process.env);
      R.serverLiveSearchForcedOff = env.PAPER_ECHO_LIVE === "0";
      server = spawn("node",
        [join(REPO, "scripts/with-app-env.mjs"), join(REPO, "node_modules/.bin/vite"),
          "dev", "--host", "127.0.0.1", "--port", String(port)],
        { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"] });
      let exited = null;
      server.on("exit", (c) => { exited = c; });
      const t0 = Date.now();
      while (Date.now() - t0 < 90000) {
        if (exited !== null) { lastErr = `vite exited ${exited}`; break; }
        try {
          const r = await fetch(`http://127.0.0.1:${port}/`);
          if (r.ok) { ready = true; break; }
        } catch { /* not up yet */ }
        await delay(400);
      }
      if (!ready && exited === null) { server.kill("SIGKILL"); server = null; lastErr = "http never ready"; }
      if (!ready) { server = null; port += 1; }
    }
    if (!ready) throw new Error(`dev server failed to boot: ${lastErr}`);
    const base = `http://127.0.0.1:${port}/`;
    step("server-ready", true, 0, `port ${port}`);
    console.error(`[release-smoke] server-ready port=${port}`);

    // ---- 3. Fresh-profile browser + network gates ---------------------------
    mkdirSync(profileDir, { recursive: true });
    browser = await chromium.launchPersistentContext(profileDir, {
      headless: true, viewport: VIEWPORT,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    page = browser.pages()[0] ?? await browser.newPage();
    page.on("crash", () => console.error("[release-smoke] PAGE-CRASH"));
    browser.on("disconnected", () => console.error("[release-smoke] BROWSER-DISCONNECTED"));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const text = m.text().slice(0, 300);
      if (/hydrat/i.test(text)) R.consoleErrors.push(`hydration: ${text}`);
      else if (ALLOWLISTED_WARNINGS.some((w) => text.includes(w))) R.allowlistedWarnings.push(text);
      else R.consoleErrors.push(text);
    });
    page.on("pageerror", (e) => {
      const text = String(e?.message ?? e).slice(0, 300);
      if (/hydrat/i.test(text)) R.pageErrors.push(`hydration: ${text}`);
      else R.pageErrors.push(text);
    });
    page.on("requestfailed", (r) => {
      const url = r.url();
      if (!isLoopback(url)) return; // our own aborted externals are counted, not failures
      R.failedRequests.push(`${r.method()} ${url.slice(0, 120)} :: ${(r.failure()?.errorText ?? "").slice(0, 80)}`);
    });
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (!isLoopback(url)) {
        const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
        const line = `${route.request().method()} ${url.slice(0, 160)}`;
        if (STATIC_HOSTS.has(host)) {
          R.externalStatic.push(line); // deterministic CDN fonts: counted, not gated
          return route.continue();
        }
        R.browserExternalRequests.push(line);
        return route.abort("blockedbyclient");
      }
      const req = route.request();
      if (req.method() === "POST") {
        const fn = serverFnOf(url);
        if (fn) R.requestCounts[fn] = (R.requestCounts[fn] ?? 0) + 1;
        else R.requestCounts[`POST:${new URL(url).pathname.slice(0, 60)}`] = (R.requestCounts[`POST:${new URL(url).pathname.slice(0, 60)}`] ?? 0) + 1;
      }
      return route.continue();
    });

    const clearStorage = () => page.evaluate(() => localStorage.clear());
    const seedJourneys = () => page.evaluate(() => {
      localStorage.setItem("paper-echo-v1",
        JSON.stringify({ version: 1, journeys: [{ id: "j1", name: "阿宁", city: "成都" }] }));
    });

    async function pullTitle() {
      await pull(page, "title", 0, 90);
      await waitState("title→orbit", async () => (await snapshot()).phase === "orbit", 12000);
      await delay(600); // let the commit settle so the stability re-check is meaningful
      return snapshot();
    }

    /** Reset to a title document between matrix reps (real navigation, never a phase jump). */
    async function resetToTitleDoc(seeded) {
      await page.goto(base, { waitUntil: "domcontentloaded", timeout: 20000 });
      await clearStorage(); // drop the snapshot or reload would resume orbit, not title
      if (seeded) await seedJourneys();
      await hardReload("reset-to-title");
      return waitReady("title");
    }

    // ---- 4. Title matrix -----------------------------------------------------
    // Two distinct behaviors, two distinct paths:
    // - freshNavigation: a true first document load (origin storage cleared,
    //   via about:blank, then navigate — NO reload).
    // - persistedStateReload: seeded journey + reload.
    const journeys0 = async () => (await snapshot()).journeys;
    let doubleCommit = 0;
    {
      let ok = true;
      for (let i = 1; i <= args.titleFresh; i++) {
        const t0 = Date.now();
        try {
          await page.goto(base, { waitUntil: "domcontentloaded", timeout: 20000 });
          await clearStorage();
          await page.goto("about:blank");
          await page.goto(base, { waitUntil: "domcontentloaded", timeout: 20000 });
          const readyMs = await waitReady("title");
          const before = await journeys0();
          const s = await pullTitle();
          const stable = (await snapshot()).phase;
          if (s.phase !== "orbit" || stable !== "orbit") ok = false;
          if ((await journeys0()) !== before) doubleCommit += 1;
          step(`fresh-nav-${i}`, s.phase === "orbit" && stable === "orbit", Date.now() - t0, `readyMs=${readyMs} phase=${s.phase}`);
        } catch (e) { ok = false; step(`fresh-nav-${i}`, false, Date.now() - t0, e.message); }
      }
      R.phaseResults.freshNavigation = `${steps.filter((s) => s.name.startsWith("fresh-nav-") && s.ok).length}/${args.titleFresh}`;
      if (!ok) throw new Error("fresh navigation pulls failed");
    }
    {
      let ok = true;
      for (let i = 1; i <= args.titleReload; i++) {
        const t0 = Date.now();
        try {
          const readyMs = await resetToTitleDoc(true);
          const before = await journeys0();
          const s = await pullTitle();
          const stable = (await snapshot()).phase;
          if (s.phase !== "orbit" || stable !== "orbit") ok = false;
          if ((await journeys0()) !== before) doubleCommit += 1;
          step(`persisted-reload-${i}`, s.phase === "orbit" && stable === "orbit", Date.now() - t0, `readyMs=${readyMs} phase=${s.phase}`);
        } catch (e) { ok = false; step(`persisted-reload-${i}`, false, Date.now() - t0, e.message); }
      }
      R.phaseResults.persistedStateReload = `${steps.filter((s) => s.name.startsWith("persisted-reload-") && s.ok).length}/${args.titleReload}`;
      if (!ok) throw new Error("persisted-state reload pulls failed");
    }
    for (const [bucket, key] of [["title-enter", "Enter"], ["title-space", " "]]) {
      const n = bucket === "title-enter" ? args.enter : args.space;
      let ok = true;
      for (let i = 1; i <= n; i++) {
        const t0 = Date.now();
        try {
          await resetToTitleDoc(true);
          await page.evaluate(() => document.querySelector('[data-pull="title"]')?.focus());
          await page.keyboard.press(key);
          await waitState(`keyboard ${key} → orbit`, async () => (await snapshot()).phase === "orbit", 12000);
          step(`${bucket}-${i}`, true, Date.now() - t0, `phase=orbit`);
        } catch (e) { ok = false; step(`${bucket}-${i}`, false, Date.now() - t0, e.message); }
      }
      R.phaseResults[bucket === "title-enter" ? "titleEnter" : "titleSpace"] =
        `${steps.filter((s) => s.name.startsWith(`${bucket}-`) && s.ok).length}/${n}`;
      if (!ok) throw new Error(`${bucket} failed`);
    }
    step("title-double-commit", doubleCommit === 0, 0, `count=${doubleCommit}`);
    if (doubleCommit !== 0) throw new Error(`double commit detected ×${doubleCommit}`);

    // ---- 5. Full no-key journey (real UI only) --------------------------------
    const tJ = Date.now();
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 20000 });
    await clearStorage();
    await hardReload("journey-start");
    await waitReady("title");

    // Title → Orbit (real pull)
    await pull(page, "title", 0, 90);
    await waitState("orbit", async () => (await snapshot()).phase === "orbit", 12000);
    step("j-title-orbit", true, Date.now() - tJ, "pull");

    // Orbit: drag tokens until near + letter + submit
    const tO = Date.now();
    for (const [label, x, y] of [["郁闷", 0.5, 0.52], ["疲惫", 0.48, 0.5]]) {
      let near = false;
      for (let a = 0; a < 3 && !near; a++) {
        await dragToken(page, label, x, y);
        await delay(350);
        near = await page.evaluate(() =>
          window.__echoGame.getState().fingerprint.some((f) => f.closeness >= 0.42));
      }
      if (!near) throw new Error(`orbit token ${label} never near`);
    }
    await delay(200);
    {
      const loc = page.locator("textarea").first();
      await loc.waitFor({ state: "attached", timeout: 12000 });
      await loc.evaluate((el, v) => {
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, "群里只回了收到，灯还开着。");
    }
    await page.locator("[data-listen-go]").click({ force: true });
    await waitState("fold", async () => (await snapshot()).phase === "fold", 10000);
    step("j-orbit-fold", true, Date.now() - tO, "tokens+letter+listen");

    // Fold ×2 + window
    const tF = Date.now();
    for (let i = 0; i < 2; i++) {
      const fold = page.locator('[data-pull="fold"]').first();
      if (!(await fold.count())) break;
      const box = await fold.boundingBox();
      if (!box) break;
      await page.mouse.move(box.x + box.width * 0.85, box.y + 16);
      await page.mouse.down();
      await page.mouse.move(box.x + 24, box.y + box.height - 12, { steps: 14 });
      await page.mouse.up();
      await delay(400);
    }
    if (await page.locator('[data-pull="window"]').count()) {
      await pull(page, "window", 0, -90);
    }
    await waitState("throw", async () => (await snapshot()).phase === "throw", 10000);
    step("j-fold-throw", true, Date.now() - tF, "fold×2+window");

    // Throw: globe click (region) + slingshot (≤3)
    // The runMatch baseline is read BEFORE the first launch gesture: the POST
    // can already be counted by the route handler while the gesture resolves,
    // so a post-launch baseline would race and under-count (flaky 0-delta).
    const tT = Date.now();
    const matchCallsBeforeLaunch = R.requestCounts.runMatch ?? 0;
    await page.locator("canvas.globe-canvas").click({ force: true });
    await page.getByText("拉满再放").waitFor({ timeout: 8000 }).catch(() => {});
    let launched = false;
    for (let a = 0; a < 3 && !launched; a++) {
      const well = page.locator("[data-throw-well]").first();
      const box = await well.boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + 24;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 148, { steps: 20 });
      await delay(80);
      await page.mouse.up();
      launched = await page.waitForFunction(() => {
        const g = window.__echoGame?.getState?.();
        return g && (g.phase === "flight" || g.searching);
      }, undefined, { timeout: 4000 }).then(() => true).catch(() => false);
      if (!launched) await delay(800);
    }
    if (!launched) throw new Error("throw never launched");
    await waitState("match done", async () => {
      const g = await snapshot();
      return (g.phase === "flight" || g.phase === "encounter") && !g.searching && Boolean(g.echo);
    }, 60000);
    const afterMatch = await snapshot();
    if (afterMatch.meterVia !== "archive") throw new Error(`match via=${afterMatch.meterVia}, want archive`);
    if ((R.requestCounts.runMatch ?? 0) - matchCallsBeforeLaunch !== 1) {
      throw new Error(`runMatch fired ${(R.requestCounts.runMatch ?? 0) - matchCallsBeforeLaunch}× in match window, want 1`);
    }
    step("j-throw-match", true, Date.now() - tT, `echo=${afterMatch.echo} via=${afterMatch.meterVia}`);

    // Flight: steer, land, pull into encounter (≤3)
    const tFl = Date.now();
    await page.locator("[data-flight-sky]").waitFor({ timeout: 8000 });
    await delay(900);
    {
      const sky = page.locator("[data-flight-sky]").first();
      const sb = await sky.boundingBox();
      if (sb) {
        await page.mouse.move(sb.x + sb.width * 0.5, sb.y + sb.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(sb.x + sb.width * 0.7, sb.y + sb.height * 0.35, { steps: 12 });
        await page.mouse.move(sb.x + sb.width * 0.3, sb.y + sb.height * 0.6, { steps: 12 });
        await page.mouse.up();
      }
    }
    await page.locator('[data-pull="flight"]').waitFor({ timeout: 40000 });
    let arrived = false;
    for (let a = 0; a < 3 && !arrived; a++) {
      await pull(page, "flight", 0, 90);
      arrived = await page.locator('[data-drop="encounter"]').waitFor({ timeout: 9000 }).then(() => true).catch(() => false);
    }
    if (!arrived) throw new Error("flight never reached encounter");
    await delay(1100);
    const greet = await page.evaluate(() => {
      const g = window.__echoGame.getState();
      return (g.recall ?? []).filter((t) => t.who === "echo").at(-1)?.text ?? "";
    });
    if (!greet.trim()) throw new Error("empty match greeting");
    if (META_LEAK.test(greet)) throw new Error(`greeting leaks internal terms: ${greet.slice(0, 80)}`);
    step("j-flight-encounter", true, Date.now() - tFl, `greet=${greet.length}ch`);

    // Encounter: 3 real turns
    // Turn-1 input acquisition: the form renders on the bloom gate (~640ms
    // after the greeting lands; diagnosed <1s in the normal case). Under
    // machine load the entrance timers can lag, so ONE reload fallback is
    // allowed here only: refresh mid-encounter is a real supported user path
    // (in-flight encounter resumes with recall intact). A genuinely broken
    // form still fails — twice. Turns 2/3 keep the strict single wait.
    async function waitEncounterInput(firstTurn) {
      const box = page.locator("textarea").first();
      try {
        await box.waitFor({ state: "visible", timeout: 14000 });
        return "first-try";
      } catch (e) {
        if (!firstTurn) throw e;
        await hardReload("encounter-entrance");
        await waitState("encounter after entrance reload", async () => {
          const s = await snapshot();
          return s.phase === "encounter" && !s.waitingEcho;
        }, 20000);
        await box.waitFor({ state: "visible", timeout: 14000 });
        return "after-reload";
      }
    }
    const speakLines = ["抽屉我到现在都没再打开。", "我把那张截图发给自己了。", "群里那条我还是没回。"];
    const turnCalls0 = R.requestCounts.runTurn ?? 0;
    for (let r = 0; r < 3; r++) {
      const t0 = Date.now();
      const before = await snapshot();
      const beforeLine = await page.evaluate(() => {
        const g = window.__echoGame.getState();
        return (g.recall ?? []).filter((t) => t.who === "echo").at(-1)?.text ?? "";
      });
      const box = page.locator("textarea").first();
      const inputPath = await waitEncounterInput(r === 0);
      const turnCount0 = R.requestCounts.runTurn ?? 0;
      await box.fill(speakLines[r]);
      await page.locator('button[type="submit"]').click();
      // Takeoff proof: the runTurn POST (exact server-fn count) OR the waiting
      // flag — whichever is observed first. The flag alone is a transient
      // window a slow poll can miss after a fast local fallback.
      await waitState(`turn ${r + 1} takeoff`, async () =>
        (R.requestCounts.runTurn ?? 0) > turnCount0 ||
        (await snapshot()).waitingEcho === true, 8000);
      await page.waitForFunction(() => {
        const g = window.__echoGame?.getState?.();
        return g && g.waitingEcho === false && g.phase === "encounter";
      }, undefined, { timeout: 45000 });
      await delay(600);
      const after = await snapshot();
      const line = await page.evaluate(() => {
        const g = window.__echoGame.getState();
        return (g.recall ?? []).filter((t) => t.who === "echo").at(-1)?.text ?? "";
      });
      const turnOk = after.round === before.round + 1 && line.trim().length > 0 && line !== beforeLine;
      if (!turnOk) throw new Error(`turn ${r + 1}: round ${before.round}→${after.round}, reply=${line.length}ch`);
      if (after.meterVia !== "archive") throw new Error(`turn ${r + 1} via=${after.meterVia}`);
      if (META_LEAK.test(line)) throw new Error(`turn ${r + 1} leaks: ${line.slice(0, 80)}`);
      step(`j-turn-${r + 1}`, true, Date.now() - t0, `reply=${line.length}ch input=${inputPath}`);
    }
    if ((R.requestCounts.runTurn ?? 0) - turnCalls0 !== 3) {
      throw new Error(`runTurn fired ${(R.requestCounts.runTurn ?? 0) - turnCalls0}× for 3 turns`);
    }

    // Encounter: end actively (real two-step seal buttons)
    const tS = Date.now();
    const sealCalls0 = R.requestCounts.runSeal ?? 0;
    await page.click("text=把今晚折回去");
    await page.click("text=再点一次，把今晚折回去", { timeout: 5000 });
    await waitState("return", async () => (await snapshot()).phase === "return", 55000);
    if ((R.requestCounts.runSeal ?? 0) - sealCalls0 !== 1) {
      throw new Error(`runSeal fired ${(R.requestCounts.runSeal ?? 0) - sealCalls0}×, want 1`);
    }
    const letter = await page.evaluate(() => window.__echoGame.getState().echo?.returnLetter ?? "");
    if (!String(letter).trim()) throw new Error("empty returnLetter");
    if (META_LEAK.test(String(letter))) throw new Error("returnLetter leaks internal terms");
    const sealState = await snapshot();
    if (sealState.waitingEcho) throw new Error("waiting stuck after seal");
    step("j-seal-return", true, Date.now() - tS, `letter=${String(letter).length}ch`);

    // Return → Archive (real pulls; a pull mid-entry-animation can be swallowed,
    // so the committing pull is retried bounded, like the flight pull above).
    const tR = Date.now();
    await pull(page, "return", 0, 50);
    await delay(300);
    let archived = false;
    for (let a = 0; a < 3 && !archived; a++) {
      await pull(page, "return", 0, 140);
      archived = await page.waitForFunction(
        () => window.__echoGame?.getState?.().phase === "archive",
        undefined, { timeout: 8000 }).then(() => true).catch(() => false);
    }
    if (!archived) throw new Error("return never reached archive");
    const arch = await snapshot();
    if ((arch.journeys ?? 0) < 1) throw new Error("journey missing in archive");
    const journeyId = arch.firstJourneyId;
    const archiveBody = await page.locator('[data-phase="archive"]').innerText().catch(() => "");
    step("j-return-archive", true, Date.now() - tR, `journeys=${arch.journeys}`);

    // Persistence: journeys live in paper-echo-v1 (the in-flight snapshot is
    // cleared by design on archive/title — nothing left to resume). Wait for
    // the write, then reload: title + same journey id + id in storage.
    await page.waitForFunction(
      (id) => (localStorage.getItem("paper-echo-v1") ?? "").includes(id),
      journeyId, { timeout: 8000 });
    await hardReload("persistence");
    await waitState("title with persisted journey", async () => {
      const s = await snapshot();
      return s.phase === "title" && (s.journeys ?? 0) >= 1;
    }, 20000);
    const arch2 = await snapshot();
    const persisted = arch2.firstJourneyId === journeyId;
    const stored = await page.evaluate((id) =>
      (localStorage.getItem("paper-echo-v1") ?? "").includes(id), journeyId);
    R.persistenceChecks = {
      journeyVisibleInArchive: archiveBody.length > 20,
      snapshotClearedByDesign: true, // persistSnapshotNow clears title/archive snapshots
      resumesToTitleByDesign: arch2.phase === "title",
      sameJourneyAfterReload: persisted,
      journeyInLocalStorage: stored,
      localStorageKeys: await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("paper-echo-"))),
    };
    if (!persisted || !stored) throw new Error("journey not persisted across reload");
    step("j-persist-reload", true, 0, `id-stable=${persisted} stored=${stored}`);

    // Reload landed on title by design: pull into a new journey from here (real
    // pull), previous journey kept, flags clean.
    const tN = Date.now();
    await pull(page, "title", 0, 90);
    await waitState("orbit again", async () => (await snapshot()).phase === "orbit", 12000);
    const again = await snapshot();
    if ((again.journeys ?? 0) < 1) throw new Error("previous journey lost after new journey");
    if (again.searching || again.waitingEcho) throw new Error("new journey inherited searching/waiting");
    step("j-new-journey", true, Date.now() - tN, `journeys=${again.journeys}`);
    R.phaseResults.journey = "pass";

    // ---- 6. Global gates ------------------------------------------------------
    const hydration = [...R.consoleErrors, ...R.pageErrors].filter((t) => /hydrat/i.test(t));
    if (hydration.length) throw new Error(`hydration mismatch ×${hydration.length}`);
    if (R.pageErrors.length) throw new Error(`pageerrors ×${R.pageErrors.length}: ${R.pageErrors[0]}`);
    if (R.consoleErrors.length) throw new Error(`console.errors ×${R.consoleErrors.length}: ${R.consoleErrors[0]}`);
    if (R.failedRequests.length) throw new Error(`failed loopback requests ×${R.failedRequests.length}`);
    if (R.browserExternalRequests.length) throw new Error(`browser external requests ×${R.browserExternalRequests.length}`);
    if (!R.serverLiveSearchForcedOff) throw new Error("server live search was not forced off");
    // runVoice (greet / turn-fallback / away / day voice lines) is auxiliary
    // product traffic: loopback-only, keyless, and which fallback path fires
    // depends on local-fallback content — counted in requestCounts for audit,
    // deliberately not pinned to an exact number.

    const envAfter = dotenvStat();
    R.dotenv.after = envAfter;
    restoreEnvOrFail();
    try {
      await page.screenshot({ path: failShot });
      rmSync(failShot, { force: true }); // success: no bulky screenshots kept
    } catch { /* ignore */ }
    return finish(true);
  } catch (e) {
    if (!R.failureReason) R.failureReason = String(e?.message ?? e).slice(0, 300);
    try { restoreEnvOrFail(); } catch (restoreErr) {
      R.failureReason = `${R.failureReason} | RESTORE: ${restoreErr.message}`.slice(0, 300);
    }
    try {
      if (page) {
        await page.screenshot({ path: failShot }).catch(() => {});
        const s = await snapshot().catch(() => ({ phase: null }));
        R.failureShot = failShot;
        R.failurePhase = s.phase ?? null;
        R.failureStore = s;
      }
    } catch { /* evidence best-effort */ }
    return finish(false);
  } finally {
    await cleanup(); // idempotent: safe even if a signal already ran it
  }
}

if (isMainModule(import.meta.url)) {
  const code = await main();
  if (signaled !== null) {
    // A signal arrived mid-run and owns the exit now: main's own failure path
    // (browser already closed by cleanup) must not preempt it with exit(1).
    // Park until shutdown()'s finally exits with the signal code.
    await new Promise(() => {});
  }
  process.exit(code);
}

export { META_LEAK, STATIC_HOSTS, buildGateServerEnv, parseArgs, scrubbedCredentialNames, serverFnOf };
