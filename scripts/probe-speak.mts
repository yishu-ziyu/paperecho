/**
 * 开口硬门槛：match 一句必须来自素材层，不能是故事卡开场。
 *   node scripts/with-app-env.mjs npx -y tsx scripts/probe-speak.mts
 */
import { echoChain } from "../src/game/agent/chains.ts";
import { llmApiKey, LLM_CONFIG } from "../src/game/agent/config.ts";
import { STORIES } from "../src/game/stories.ts";
import { COLLECTED } from "../src/game/collect.ts";

const fingerprint = [
  { id: "anger" as const, closeness: 0.9 },
  { id: "wronged" as const, closeness: 0.85 },
];
const letter = "我把最好的那面都给出去了，换来一句还好。";

const t0 = Date.now();
const match = await echoChain.match({
  fingerprint,
  letter,
  region: "america",
  mirror: letter,
  archival: [],
  echo: null,
});

const openings = new Set([...STORIES, ...COLLECTED].map((s) => s.opening));
const out = {
  provider: LLM_CONFIG.providerId,
  model: LLM_CONFIG.modelId,
  hasKey: Boolean(llmApiKey()),
  ms: Date.now() - t0,
  name: match.echo.name,
  city: match.echo.city,
  greeting: match.echo.greeting,
  via: match.meter.via,
  source: match.echo.source,
  isStoryOpening: openings.has(match.echo.greeting),
  hitsHead: (match.hits[0] || "").slice(0, 280),
};
console.log(JSON.stringify(out, null, 2));
if (out.isStoryOpening) {
  console.error("FAIL: greeting is a story-card opening");
  process.exit(1);
}
if (!out.hasKey) {
  console.error("WARN: no API key, heuristic only");
  process.exit(0);
}
if (out.via !== "live") {
  console.error("WARN: LLM did not answer (via=archive). wiring ok, network/key not.");
  process.exit(0);
}
console.error("PASS");
