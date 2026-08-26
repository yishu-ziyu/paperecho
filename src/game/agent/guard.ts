/**
 * Agent server fn 的限流中间件 — 与 authMiddleware 组合使用
 * （auth 在前注入 context.userId，限流在后以「fn:userId:ip」为键）。
 *
 * 限额依据：一局完整旅程 = match 1 + turn ~8–12 + seal 1；按每小时
 * 3 局加重试余量取整。正常玩家碰不到这些数字，脚本刷接口会被挡。
 * 超限抛 429 —— store 对三个 fn 都有 .catch() 回退本地故事卡，
 * 被限的玩家旅程不断，只是那一轮不再消耗真模型额度。
 *
 * 本文件是双端模块（server.ts 被 store 从客户端引用）：顶层只 import
 * 双端安全的 `@tanstack/react-start`；`getRequest` 走动态 import，
 * 与 authMiddleware 同一模式，避免 Node 专有代码进浏览器包。
 */
import { createMiddleware } from "@tanstack/react-start";
import { createRateLimiter, type RateLimiter } from "./rate-limit.ts";

const HOUR_MS = 3_600_000;

/** 调优旋钮：改这里，不改调用点。 */
const LIMITS = {
  match: { windowMs: HOUR_MS, max: 10 },
  turn: { windowMs: HOUR_MS, max: 60 },
  seal: { windowMs: HOUR_MS, max: 10 },
} as const;

export type AgentFnName = keyof typeof LIMITS;

const limiters = new Map<AgentFnName, RateLimiter>();

function limiterFor(name: AgentFnName): RateLimiter {
  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = createRateLimiter(LIMITS[name]);
    limiters.set(name, limiter);
  }
  return limiter;
}

/** 代理链后的客户端 IP：x-forwarded-for 首跳，退化 x-real-ip，再退化 unknown。 */
function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function agentRateLimit(fn: AgentFnName) {
  return createMiddleware({ type: "function" }).server(
    async ({ next, context }) => {
      const { getRequest } = await import("@tanstack/react-start/server");
      const request = getRequest();
      const ip = request ? clientIp(request.headers) : "unknown";
      // userId 由前置 authMiddleware 注入；无请求上下文（构建期预取）时缺省。
      // 组合类型只在 server.ts 的 middleware 数组处推导，独立文件里拿不到，
      // 故走 unknown 双断言。
      const user = (context as unknown as { userId?: string }).userId ?? "anon";
      limiterFor(fn).hit(`${fn}:${user}:${ip}`);
      return next();
    },
  );
}
