/**
 * Task 2A Phase 1 — baseline 数字生成器。
 * docs/matching-eval.md 的表就是这份输出的誊录。
 *
 * 跑法：npx tsx scripts/matching-eval-baseline.mts
 */
import { baselineMatchFn, collectedAvailable, evaluate } from "../src/game/agent/matching.eval.ts";
import { MATCH_FIXTURES } from "../src/game/agent/matching.fixtures.ts";
import { STORIES, storyToEcho } from "../src/game/stories.ts";

const fn = baselineMatchFn();
const report = evaluate(fn);

console.log(
  `候选池：STORIES ${STORIES.length}（matchStory 可见）+ COLLECTED ${collectedAvailable()}（结构性不可见）`,
);
console.log("id    top1                    expected  top1   top3   note");
for (const f of MATCH_FIXTURES) {
  const r = report.perFixture.find((x) => x.id === f.id)!;
  const echo = storyToEcho(fn(f).top1);
  console.log(
    `${r.id.padEnd(6)}${`${r.top1} ${echo.name}/${echo.city}`.padEnd(24)}${r.expected.join(",").padEnd(10)}${(r.pass ? "hit" : "MISS").padEnd(7)}${(r.top3Hit ? "hit" : "miss").padEnd(7)}${f.note ?? ""}`,
  );
}
console.log("");
console.log(
  `Top1 ${report.top1Hits}/${report.total} (${(report.top1Rate * 100).toFixed(1)}%)`,
);
console.log(
  `Top3 ${report.top3Hits}/${report.total} (${(report.top3Rate * 100).toFixed(1)}%)`,
);
console.log(`collectedTop1 ${report.collectedTop1}`);
