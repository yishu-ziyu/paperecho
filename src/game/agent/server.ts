import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type {
  CoreMemory,
  EchoPerson,
  Fingerprint,
  MemoryRecord,
  RegionId,
  TokenMeter,
} from "../types";
import type { ExchangeState } from "./exchange";
import { initialExchange } from "./exchange";
import { agentRateLimit } from "./guard";
import type { NightInput } from "./types";

export interface AgentPayload {
  fingerprint: Fingerprint[];
  letter: string;
  region: RegionId;
  mirror: string;
  playerPersona?: string;
  archival: MemoryRecord[];
  core?: CoreMemory;
  recall?: { who: "you" | "echo"; text: string }[];
  playerLine?: string;
  round?: number;
  echo?: EchoPerson | null;
  avoidNames?: string[];
  session?: string;
  exchange?: ExchangeState;
}

export interface MatchResult {
  echo: EchoPerson;
  core: CoreMemory;
  suggestions: string[];
  hits: string[];
  facts: string[];
  session: string;
  meter: TokenMeter;
  exchange: ExchangeState;
}

export interface TurnResult {
  spoken: string;
  suggestions: string[];
  hits: string[];
  facts: string[];
  session: string;
  meter: TokenMeter;
  exchange: ExchangeState;
}

export interface SealResult {
  returnLetter: string;
  facts: string[];
  session: string;
  meter: TokenMeter;
}

function packSession(session: unknown[]): string {
  try {
    return JSON.stringify(session);
  } catch {
    return "[]";
  }
}

function unpackSession(raw?: string): unknown[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function asNight(data: AgentPayload): NightInput {
  return {
    fingerprint: data.fingerprint,
    letter: data.letter,
    region: data.region,
    mirror: data.mirror,
    playerPersona: data.playerPersona,
    archival: data.archival,
    coreHuman: data.core?.human,
    corePersona: data.core?.persona,
    playerLine: data.playerLine,
    recall: data.recall,
    echo: data.echo,
    avoidNames: data.avoidNames,
    session: unpackSession(data.session),
    exchange: data.exchange ?? initialExchange(),
  };
}

export const runMatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware, agentRateLimit("match")])
  .validator((input: AgentPayload) => input)
  .handler(async ({ data }): Promise<MatchResult> => {
    const { echoChain } = await import("./chains");
    const res = await echoChain.match(asNight(data));
    return {
      echo: res.echo,
      core: { human: res.human, persona: res.persona },
      suggestions: res.suggestions,
      hits: res.hits,
      facts: res.facts,
      session: packSession(res.session),
      meter: res.meter,
      exchange: res.exchange,
    };
  });

export const runTurn = createServerFn({ method: "POST" })
  .middleware([authMiddleware, agentRateLimit("turn")])
  .validator((input: AgentPayload) => input)
  .handler(async ({ data }): Promise<TurnResult> => {
    const { echoChain } = await import("./chains");
    const res = await echoChain.turn(asNight(data));
    return {
      spoken: res.spoken,
      suggestions: res.suggestions,
      hits: res.hits,
      facts: res.facts,
      session: packSession(res.session),
      meter: res.meter,
      exchange: res.exchange,
    };
  });

export const runSeal = createServerFn({ method: "POST" })
  .middleware([authMiddleware, agentRateLimit("seal")])
  .validator((input: AgentPayload) => input)
  .handler(async ({ data }): Promise<SealResult> => {
    const { echoChain } = await import("./chains");
    const res = await echoChain.seal(asNight(data));
    return {
      returnLetter: res.echo.returnLetter,
      facts: res.facts,
      session: packSession(res.session),
      meter: res.meter,
    };
  });
