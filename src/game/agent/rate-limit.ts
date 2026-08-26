/**
 * Agent server fn 的固定窗口限流 — 纯逻辑，无框架依赖（单测友好）。
 *
 * 为什么是内存态固定窗口而不是 Redis/滑动窗口：本应用单实例部署
 * （nitro 单函数 + PGLite），进程内存即共享内存；固定窗口的实现是
 * 一条 Map 记录（起点 + 计数），对边界效应的容忍换来了零依赖和
 * 可证明的简单。窗口边界的突发余量（最坏 2×max）对「保护 LLM key
 * 不被脚本烧穿」这个目标足够。
 *
 * 超限不是惩罚，是降级：store 对三个 server fn 都有 .catch() 回退
 * 本地故事卡，被限的玩家旅程不断，只是那一轮不再走真模型。
 */

export class TooManyRequestsError extends Error {
  readonly status = 429;
  /** 距下一个窗口的毫秒数（调用方可用于 Retry-After）。 */
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super("Too many requests");
    this.name = "TooManyRequestsError";
    this.retryAfterMs = retryAfterMs;
  }
}

export interface RateLimitOptions {
  /** 窗口长度（毫秒）。 */
  windowMs: number;
  /** 窗口内允许的最大调用数。 */
  max: number;
  /** 键空间上限；超过时先清过期窗口，仍超则整体重置（宁可误伤不可被撑爆）。 */
  maxKeys?: number;
  /** 注入时钟（测试）。 */
  now?: () => number;
}

interface WindowState {
  start: number;
  count: number;
}

export interface RateLimiter {
  /** 记录一次调用。未超限返回 true；超限抛 TooManyRequestsError。 */
  hit(key: string): boolean;
  /** 只读探测：当前窗口剩余额度（不计数）。 */
  remaining(key: string): number;
}

export function createRateLimiter({
  windowMs,
  max,
  maxKeys = 8192,
  now = Date.now,
}: RateLimitOptions): RateLimiter {
  const windows = new Map<string, WindowState>();

  function stateOf(key: string, current: number): WindowState {
    const existing = windows.get(key);
    if (existing && current - existing.start < windowMs) return existing;
    const fresh: WindowState = { start: current, count: 0 };
    windows.set(key, fresh);
    return fresh;
  }

  function sweep(current: number): void {
    if (windows.size <= maxKeys) return;
    for (const [key, w] of windows) {
      if (current - w.start >= windowMs) windows.delete(key);
    }
    // 活跃键仍超限 = 有人伪造海量唯一键：整体重置，保住内存上界。
    if (windows.size > maxKeys) windows.clear();
  }

  return {
    hit(key: string): boolean {
      const current = now();
      sweep(current);
      const w = stateOf(key, current);
      w.count += 1;
      if (w.count > max) {
        const waited = current - w.start;
        throw new TooManyRequestsError(Math.max(windowMs - waited, 1));
      }
      return true;
    },
    remaining(key: string): number {
      const current = now();
      const w = windows.get(key);
      if (!w || current - w.start >= windowMs) return max;
      return Math.max(max - w.count, 0);
    },
  };
}
