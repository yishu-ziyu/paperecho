import assert from "node:assert/strict";
import test from "node:test";
import {
  createRateLimiter,
  TooManyRequestsError,
} from "./rate-limit.ts";

/** 可拨动的假时钟：固定窗口测试需要精确跨过窗口边界。 */
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("窗口内计数到 max 后抛 429", () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3, now: clock.now });
  assert.equal(limiter.hit("k"), true);
  assert.equal(limiter.hit("k"), true);
  assert.equal(limiter.hit("k"), true);
  assert.throws(() => limiter.hit("k"), TooManyRequestsError);
});

test("窗口滚动后额度恢复", () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: clock.now });
  limiter.hit("k");
  limiter.hit("k");
  assert.throws(() => limiter.hit("k"));
  clock.advance(60_001);
  assert.equal(limiter.hit("k"), true);
  assert.equal(limiter.remaining("k"), 1);
});

test("不同键互不影响", () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: clock.now });
  assert.equal(limiter.hit("a"), true);
  assert.throws(() => limiter.hit("a"));
  assert.equal(limiter.hit("b"), true); // b 的窗口独立
});

test("超限的 retryAfterMs 指向下一个窗口", () => {
  const clock = fakeClock(1_000);
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: clock.now });
  limiter.hit("k");
  clock.advance(10_000);
  try {
    limiter.hit("k");
    assert.fail("should throw");
  } catch (err) {
    assert.ok(err instanceof TooManyRequestsError);
    assert.equal(err.status, 429);
    // 窗口起点 1000 + 60000 - 当前 11000 = 50000
    assert.equal(err.retryAfterMs, 50_000);
  }
});

test("键空间超限时清过期窗口", () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 5,
    maxKeys: 4,
    now: clock.now,
  });
  // 灌满键空间（全部活跃）
  for (const k of ["a", "b", "c", "d"]) limiter.hit(k);
  clock.advance(61_000); // 全部过期
  limiter.hit("e"); // 触发 sweep：过期键被清，e 正常计数
  assert.equal(limiter.remaining("e"), 4);
});

test("活跃键仍超限则整体重置（防键空间撑爆）", () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 5,
    maxKeys: 2,
    now: clock.now,
  });
  limiter.hit("a");
  limiter.hit("b");
  limiter.hit("c"); // 3 > maxKeys=2 且全部活跃 -> clear
  // 重置后 a 重新计数（否则 a 会带着旧计数继续拒绝）
  assert.equal(limiter.hit("a"), true);
});

test("remaining 只读，不计数", () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: clock.now });
  limiter.hit("k");
  assert.equal(limiter.remaining("k"), 1);
  assert.equal(limiter.remaining("k"), 1); // 反复探测不变
  assert.equal(limiter.remaining("never"), 2);
});
