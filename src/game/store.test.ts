/**
 * store 水合契约测试（task2b Fix 1 / E1-5）。
 *
 * store 模块初始化必须只用 SSR 安全默认值（无 window 时 journeys/muted/archival
 * 为默认、phase 为 title），本地状态一律由 hydrateLocalState() 在客户端挂载后水合。
 * node 测试环境无 window/localStorage：这里用 shim 验证有 window 时的水合行为。
 *
 * node 原生 ESM 不解析 tsconfig 的 `@/` 别名，也不补全无扩展名相对导入
 * （store.ts 按 vite 习惯写成这两种），所以先注册一个解析 hook 再动态 import。
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, describe, it } from "node:test";
import type { JourneySnapshot } from "./save.ts";

const SRC = fileURLToPath(new URL("../", import.meta.url));

registerHooks({
  resolve(specifier, context, nextResolve) {
    // `@/xxx` → `<repo>/src/xxx(.ts|.tsx|/index.ts)`
    if (specifier.startsWith("@/")) {
      const abs = path.join(SRC, specifier.slice(2));
      for (const cand of [`${abs}.ts`, `${abs}.tsx`, path.join(abs, "index.ts")]) {
        if (existsSync(cand)) return { url: pathToFileURL(cand).href, shortCircuit: true };
      }
    }
    // 无扩展名相对导入补 .ts（store.ts 一族按 vite 习惯省略扩展名）。
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
      try {
        return nextResolve(specifier, context);
      } catch {
        const base = new URL(specifier, context.parentURL).href;
        for (const suffix of [".ts", "/index.ts"]) {
          if (existsSync(fileURLToPath(base + suffix))) return { url: base + suffix, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

// hook 必须先于模块解析注册，只能动态 import store。
const { hydrateLocalState, useGame } = await import("./store.ts");

/** 与 save.ts / memory.ts 的私有键保持一致（测试需要按格式种入数据）。 */
const JOURNEYS_KEY = "paper-echo-v1";
const MUTED_KEY = "paper-echo-muted-v1";
const SNAP_KEY = "paper-echo-snapshot-v1";
const ARCHIVAL_KEY = "paper-echo-memory-v2";

function makeLocalStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      data.set(k, String(v));
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
  };
}

function snapshotOf(phase: JourneySnapshot["phase"]): JourneySnapshot {
  return {
    version: 1,
    createdAt: Date.now(),
    phase,
    tokens: [],
    fingerprint: [],
    selectedMirror: null,
    personaHint: "",
    chips: [],
    letterChips: [],
    extraLine: "",
    folds: 0,
    region: "east",
    throwPower: 0,
    echo: null,
    searching: false,
    searchNote: "",
    round: 0,
    replies: [],
    chosenReplies: [],
    recall: [],
    waitingEcho: false,
    session: "",
    core: { human: "", persona: "" },
    exchange: { unlocked: 1, silentTurns: 0 },
  };
}

const savedJourney = {
  id: "j-test",
  createdAt: Date.now(),
  fingerprint: [],
  mirror: "灯我也没关",
  letter: "我把最好的那面都给出去了。",
  chips: [],
  region: "east",
  echo: {
    name: "林予",
    city: "杭州",
    felt: "灯还开着",
    greeting: "我改了十七稿方案，群里只回了收到。",
    replies: [],
    returnLetter: "",
    source: "archive" as const,
  },
  transcript: [],
  returnLetter: "",
  awayThing: "把那箱书捐掉了。",
};

const savedFact = {
  id: "m-test",
  memory: "我导师又给我发消息了，我装作没看见。",
  emotions: ["anxious"],
  region: "east",
  createdAt: Date.now(),
};

type Windowish = { window: unknown };
const cleanups: (() => void)[] = [];
after(() => {
  for (const fn of cleanups) fn();
});

describe("store 初态（无 window，SSR 安全默认值）", () => {
  it("模块加载后 journeys/muted/archival 为默认、phase 为 title", () => {
    const s = useGame.getState();
    assert.equal(typeof window, "undefined"); // 测试环境前提：node 无 window
    assert.equal(s.phase, "title");
    assert.deepEqual(s.journeys, []);
    assert.equal(s.muted, false);
    assert.deepEqual(s.archival, []);
    assert.deepEqual(s.core, { human: "", persona: "" });
  });

  it("hydrateLocalState 在无 window 时 no-op", () => {
    const before = useGame.getState();
    assert.equal(hydrateLocalState(), undefined);
    const after = useGame.getState();
    assert.equal(after, before); // 引用相等：一次 set 都没发生
    assert.equal(after.phase, "title");
    assert.deepEqual(after.journeys, []);
  });
});

describe("hydrateLocalState（有 window + localStorage shim）", () => {
  const ls = makeLocalStorage({
    [JOURNEYS_KEY]: JSON.stringify({ version: 1, journeys: [savedJourney] }),
    [MUTED_KEY]: "1",
    [ARCHIVAL_KEY]: JSON.stringify({ version: 3, records: [savedFact] }),
  });
  const shim = {
    localStorage: ls,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: number | undefined) => clearTimeout(id),
  };

  it("无快照时恢复 journeys/muted/archival，core 从档案长出来", () => {
    (globalThis as unknown as Windowish).window = shim;
    // 浏览器里 save.ts 的裸 `localStorage` 就是全局；node 里必须单独挂，等价于 window.localStorage。
    (globalThis as unknown as { localStorage: unknown }).localStorage = ls;
    cleanups.push(() => {
      delete (globalThis as unknown as Windowish).window;
      delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    });

    hydrateLocalState();

    const s = useGame.getState();
    assert.equal(s.phase, "title");
    assert.equal(s.journeys.length, 1);
    assert.equal(s.journeys[0]?.echo.name, "林予");
    assert.equal(s.muted, true);
    assert.equal(s.archival.length, 1);
    assert.ok(s.core.human.includes("我导师又给我发消息了")); // core = factsOf(archival)
  });

  it("有快照时恢复到原 phase，快照 core 优先，且防抖回存不清掉快照", async () => {
    ls.setItem(
      SNAP_KEY,
      JSON.stringify({
        ...snapshotOf("orbit"),
        core: { human: "上次说到导师的事。", persona: "" },
      }),
    );

    hydrateLocalState();

    const s = useGame.getState();
    assert.equal(s.phase, "orbit"); // 中途刷新 resume：快照 phase 恢复
    assert.ok(s.core.human.includes("上次说到导师的事")); // 快照 core 覆盖档案 core（resumeOf 在后）

    // 水合引发的 setState → subscribe → 防抖 persistSnapshotNow：
    // 恢复出的快照必须原样落回，不得被清掉。
    await new Promise((r) => setTimeout(r, 600));
    const raw = ls.getItem(SNAP_KEY);
    assert.ok(raw, "快照被清掉了");
    assert.equal((JSON.parse(raw!) as JourneySnapshot).phase, "orbit");
  });
});
