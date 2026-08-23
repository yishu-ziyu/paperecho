/**
 * Paper Echo — Phase 0 冒烟：3 个剧本化玩家各跑一整局。
 *
 * 每局：pipeline（倾听→搜索→整合→回应，走 respond.ts 的真实 LLM 路径）
 *      → chains match → 2~3 轮 turn → seal。
 * transcript 含：玩家画像 / shadow 素材（handle/materials）/ 每轮 player·echo 台词 /
 * seal 结果 / 每节点耗时（ms）/ 兜底信号 / LLM 报错信号。
 *
 * 跑法（沿用 probe-night 的既定模式：with-app-env 载 .env，tsx 解释 .mts 与其无扩展 import）：
 *   node scripts/with-app-env.mjs npx -y tsx scripts/smoke-dialogue.mts
 */
import { echoChain } from "../src/game/agent/chains.ts";
import { llmApiKey } from "../src/game/agent/config.ts";
import { initialExchange, type ExchangeState } from "../src/game/agent/exchange.ts";
import type { NightInput, RecallItem } from "../src/game/agent/types.ts";
import {
  emotionsOf,
  localPosts,
  makeProfile,
  runPipeline,
} from "../src/game/agent/pipeline/index.ts";
import type {
  EchoPerson,
  Fingerprint,
  MemoryRecord,
  RegionId,
  TokenMeter,
} from "../src/game/types.ts";

/** chains.ts 内层兜底用的辞典句（判定「疑内层兜底」用）。 */
const BUILTIN_FALLBACK = "我那晚也没睡。电脑还亮着。";

interface ScriptedPlayer {
  id: string;
  scene: string;
  emotionLabel: string;
  fingerprint: Fingerprint[];
  letter: string;
  mirror: string;
  region: RegionId;
  archival: MemoryRecord[];
  /** 剧本台词：第 1 条同时喂给 pipeline 当 userLine。 */
  lines: string[];
}

const PLAYERS: ScriptedPlayer[] = [
  {
    id: "P1",
    scene: "刚搬家三周的夜班族",
    emotionLabel: "lonely",
    fingerprint: [
      { id: "lonely", closeness: 0.9 },
      { id: "gloom", closeness: 0.45 },
    ],
    letter: "搬家第三周，冰箱上还只有一张外卖单。",
    mirror: "灯开着。房间里的声音都是我自己的。",
    region: "east",
    archival: [
      {
        id: "m-p1-1",
        memory: "上周写过：对话框打开又划掉，最后还是一个人看天花板",
        emotions: ["lonely"],
        region: "east",
        echoName: "",
        createdAt: Date.now() - 7 * 86400_000,
      },
    ],
    lines: [
      "下班回来我对着手机扒了半小时饭，其实也没在看什么。",
      "我把客厅的灯和电视都开着，就想让屋里听起来有第二个人。",
      "今天顺手洗了两个杯子才反应过来，这家的杯子我只拆过一个。",
    ],
  },
  {
    id: "P2",
    scene: "连续加班十一天的项目经理",
    emotionLabel: "tired",
    fingerprint: [
      { id: "tired", closeness: 0.92 },
      { id: "anxious", closeness: 0.5 },
    ],
    letter: "连续第十一天加班，昨晚在地铁上站着睡着了。",
    mirror: "不是想放弃，是电池已经闪红灯。",
    region: "europe",
    archival: [],
    lines: [
      "今天开会我点头点了七次，其实一句都没听进去。",
      "到楼下了，我在车里坐了二十分钟，就是不想上去开灯。",
      "我妈发语音问吃饭没，我回了「吃了」，桌上是前天剩的半个面包。",
    ],
  },
  {
    id: "P3",
    scene: "被同事抢功的设计师",
    emotionLabel: "unseen",
    fingerprint: [
      { id: "unseen", closeness: 0.88 },
      { id: "wronged", closeness: 0.62 },
    ],
    letter: "我做的图被同事拿去汇报，老板夸了他三分钟。",
    mirror: "我改到凌晨的那几页，没有人记得。",
    region: "america",
    archival: [],
    lines: [
      "我还笑着说是我俩一起弄的，指甲把手心掐出了印。",
      "刚把原稿又翻出来看了一遍，连图层名都是我起的。其实不要表扬，就想有人问一句是谁做的。",
    ],
  },
];

const stats = {
  pipeline: { n: 0, ms: 0 },
  match: { n: 0, ms: 0 },
  turn: { n: 0, ms: 0 },
  seal: { n: 0, ms: 0 },
  fallbacks: 0,
  llmSilent: 0,
  errors: 0,
};

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function hit(
  kind: keyof typeof stats & string,
  ms: number,
  flags: string[],
): void {
  const bucket = stats[kind as "pipeline"];
  if (bucket) {
    bucket.n += 1;
    bucket.ms += ms;
  }
  for (const f of flags) {
    if (f.startsWith("FALLBACK")) stats.fallbacks += 1;
    if (f.startsWith("LLM-SILENT")) stats.llmSilent += 1;
    if (f.startsWith("ERROR")) stats.errors += 1;
  }
}

function meterLine(meter: TokenMeter): string {
  return `via=${meter.via} prompt=${meter.prompt} completion=${meter.completion} total=${meter.total}`;
}

/** 从一次链结果里读兜底/报错信号。 */
function flagsOf(meter: TokenMeter, spoken: string, candidates: string[]): string[] {
  const flags: string[] = [];
  if (meter.via === "archive") flags.push("FALLBACK 整链兜底(无key→fallbackFor)");
  if (meter.via === "live" && meter.total === 0) {
    flags.push("LLM-SILENT live但0token(LLM步超时/报错被吞,用了本地句)");
  }
  if (spoken && candidates.includes(spoken)) flags.push("FALLBACK? 出口=既有辞典原句");
  return flags;
}

function fmtFlags(flags: string[]): string {
  return flags.length ? `  ⚑ ${flags.join(" | ")}` : "";
}

async function runPipelineProbe(p: ScriptedPlayer): Promise<void> {
  const t0 = Date.now();
  console.log(`\n--- [pipeline] 倾听→搜索→整合→回应（userLine=剧本第 1 句）---`);
  try {
    const { shadow, reply } = await runPipeline(
      makeProfile(emotionsOf(p.fingerprint)),
      [localPosts],
      p.lines[0]!,
    );
    const ms = Date.now() - t0;
    hit("pipeline", ms, []);
    console.log(`  handle: ${shadow.handle}`);
    console.log(`  voice:  ${shadow.voice}`);
    console.log(`  materials(${shadow.materials.length}):`);
    for (const m of shadow.materials) {
      console.log(`    - [${m.emotion.join("/")}] ${m.content}${m.situation ? `（当时：${m.situation}）` : ""}`);
    }
    console.log(`  player: ${p.lines[0]}`);
    console.log(`  reply(${ms}ms): ${reply.reply}`);
  } catch (e) {
    stats.errors += 1;
    console.log(`  ERROR pipeline 抛错(${Date.now() - t0}ms): ${errMsg(e)}`);
  }
}

async function runMatch(p: ScriptedPlayer): Promise<{ echo: EchoPerson; session: unknown[]; exchange: ExchangeState }> {
  const input: NightInput = {
    fingerprint: p.fingerprint,
    letter: p.letter,
    region: p.region,
    mirror: p.mirror,
    archival: p.archival,
    session: [],
    exchange: initialExchange(),
  };
  const t0 = Date.now();
  const res = await echoChain.match(input);
  const ms = Date.now() - t0;
  const flags = flagsOf(res.meter, res.spoken, []);
  hit("match", ms, flags);
  console.log(`\n--- [match] ${ms}ms  meter={${meterLine(res.meter)}}${fmtFlags(flags)}`);
  console.log(`  echo: ${res.echo.name} · ${res.echo.city} · felt=${res.echo.felt} (source=${res.echo.source})`);
  console.log(`  echo 开口: ${res.spoken}`);
  console.log(`  exchange: unlocked=${res.exchange.unlocked} speak=${res.speak} mode=${res.speakMode}`);
  if (res.suggestions.length) console.log(`  suggestions: ${JSON.stringify(res.suggestions)}`);
  if (res.facts.length) console.log(`  facts: ${JSON.stringify(res.facts)}`);
  return { echo: res.echo, session: res.session, exchange: res.exchange };
}

async function runTurns(
  p: ScriptedPlayer,
  echo0: EchoPerson,
  session0: unknown[],
  recall: RecallItem[],
  exchange0: ExchangeState,
): Promise<{ echo: EchoPerson; session: unknown[]; exchange: ExchangeState }> {
  let echo = echo0;
  let session = session0;
  let exchange = exchange0;
  for (let i = 0; i < p.lines.length; i++) {
    const line = p.lines[i]!;
    const input: NightInput = {
      fingerprint: p.fingerprint,
      letter: p.letter,
      region: p.region,
      mirror: p.mirror,
      archival: p.archival,
      echo,
      playerLine: line,
      recall: [...recall],
      session,
      exchange,
    };
    const candidates = [echo.greeting, ...echo.replies, BUILTIN_FALLBACK].filter(Boolean);
    const t0 = Date.now();
    const res = await echoChain.turn(input);
    const ms = Date.now() - t0;
    const flags = flagsOf(res.meter, res.spoken, candidates);
    hit("turn", ms, flags);
    console.log(`\n--- [turn ${i + 1}] ${ms}ms  meter={${meterLine(res.meter)}}${fmtFlags(flags)}`);
    console.log(`  player: ${line}`);
    console.log(`  echo:   ${res.spoken}`);
    console.log(
      `  exchange: new_detail=${res.judgment?.new_detail ?? "?"} unlocked=${res.exchange.unlocked} speak=${res.speak} mode=${res.speakMode}`,
    );
    if (res.suggestions.length) console.log(`  suggestions: ${JSON.stringify(res.suggestions)}`);
    if (res.facts.length) console.log(`  facts: ${JSON.stringify(res.facts)}`);
    recall.push({ who: "you", text: line }, { who: "echo", text: res.spoken });
    echo = res.echo;
    session = res.session;
    exchange = res.exchange;
  }
  return { echo, session, exchange };
}

async function runSeal(
  p: ScriptedPlayer,
  echo: EchoPerson,
  session: unknown[],
  recall: RecallItem[],
  exchange: ExchangeState,
): Promise<void> {
  const input: NightInput = {
    fingerprint: p.fingerprint,
    letter: p.letter,
    region: p.region,
    mirror: p.mirror,
    archival: p.archival,
    echo,
    recall,
    session,
    exchange,
  };
  const t0 = Date.now();
  const res = await echoChain.seal(input);
  const ms = Date.now() - t0;
  const flags = flagsOf(res.meter, res.spoken, [echo.returnLetter, BUILTIN_FALLBACK].filter(Boolean));
  hit("seal", ms, flags);
  console.log(`\n--- [seal] ${ms}ms  meter={${meterLine(res.meter)}}${fmtFlags(flags)}`);
  console.log(`  回信: ${res.echo.returnLetter}`);
  if (res.facts.length) console.log(`  记住的事实: ${JSON.stringify(res.facts)}`);
}

console.log(`========== paper-echo Phase 0 对话冒烟 ==========`);
console.log(
  `时间: ${new Date().toISOString()}  key: ${llmApiKey() ? "已加载" : "缺失!"}`,
);

for (const p of PLAYERS) {
  console.log(`\n\n########## 玩家 ${p.id}：${p.scene}（${p.emotionLabel} · ${p.region}）##########`);
  console.log(
    `[画像] fingerprint=${p.fingerprint.map((f) => `${f.id}:${f.closeness}`).join(" + ")}`,
  );
  console.log(`[信] ${p.letter}`);
  console.log(`[认领] ${p.mirror}`);
  console.log(`[信柜] ${p.archival.length ? p.archival.map((a) => a.memory).join("；") : "（空）"}`);

  await runPipelineProbe(p);
  const recall: RecallItem[] = [];
  try {
    const { echo, session, exchange } = await runMatch(p);
    const after = await runTurns(p, echo, session, recall, exchange);
    await runSeal(p, after.echo, after.session, recall, after.exchange);
  } catch (e) {
    stats.errors += 1;
    console.log(`\nERROR 玩家 ${p.id} 链路抛错: ${errMsg(e)}`);
  }
}

console.log(`\n\n========== 汇总 ==========`);
for (const kind of ["pipeline", "match", "turn", "seal"] as const) {
  const b = stats[kind];
  console.log(`${kind}: ${b.n} 次, 共 ${b.ms}ms, 均 ${b.n ? Math.round(b.ms / b.n) : 0}ms`);
}
console.log(`兜底触发: ${stats.fallbacks} 次   LLM 静默(0token): ${stats.llmSilent} 次   显式报错: ${stats.errors} 次`);
