/**
 * Paper Echo — Agent 业务数据结构
 *
 * NightInput / NightResult 是 Agent 系统的唯一契约：
 * store 组装 NightInput → chains 产出 NightResult → server 装箱返回。
 * tools / memory / llm 都围绕这些类型展开。
 */
import type {
  EchoPerson,
  EmotionId,
  Fingerprint,
  MemoryRecord,
  RegionId,
  TokenMeter,
} from "../types.ts";
import type { ExchangeJudgment, ExchangeState, SpeakMode, StoryDepth } from "./exchange.ts";

/** 单人对话条目。 */
export interface RecallItem {
  who: "you" | "echo";
  text: string;
}

/**
 * 进入 Agent 系统的统一请求。
 *
 * 游戏层（store）组装好一个完整请求；Agent 内部不回头读 store，
 * 不读 localStorage，只消费这个对象。
 */
export interface NightInput {
  /** 玩家今晚的轨迹 */
  fingerprint: Fingerprint[];
  letter: string; // 折进飞机的原话
  mirror: string; // 玩家写下的一句
  playerPersona?: string; // 可选：今晚点的那一口吻，不是问卷分数
  region: RegionId; // 飞向的地区

  /** 当前对话状态 */
  echo?: EchoPerson | null; // 已锁定的人；match 时身份锁定不改名换城
  playerLine?: string; // 玩家刚说的一句
  recall?: RecallItem[]; // 这一晚的完整对话（不含刚生成的那句）

  /** 持久记忆 */
  archival: MemoryRecord[]; // 旧夜事实
  coreHuman?: string;
  corePersona?: string;

  /** 防重复 / 连续性 */
  avoidNames?: string[];
  session?: unknown[]; // 链运行标记账本（非 LLM 消息）
  /** 故事交换落闸（match 开场为 L1；turn 由本轮玩家话推进）。 */
  exchange?: ExchangeState;
  /** 日子本：再开口前先读这些已经写下的日子。 */
  days?: { date: string; text: string }[];
}

/** 补日子 / 离开后那件：把日子本、上次的话、今晚情绪交给同一条模型。 */
export interface VoiceInput {
  name: string;
  city: string;
  lastEcho: string;
  lastYou: string;
  lastEmotions: EmotionId[];
  prev: string;
  date?: string;
  days?: { date: string; text: string }[];
  letter?: string;
  kind: "day" | "away" | "greet" | "turn";
  timeoutMs?: number;
}

/** 链的最终产出。这是 game store 唯一需要关心的输出形状。 */
export interface NightResult {
  echo: EchoPerson;
  spoken: string;
  suggestions: string[];
  facts: string[];
  hits: string[];
  session: unknown[];
  persona: string;
  human: string;
  meter: TokenMeter;
  exchange: ExchangeState;
  speak: StoryDepth;
  speakMode: SpeakMode;
  judgment?: ExchangeJudgment;
}

/** 模型 / 服务配置（集中在 config 层，换模型只改这里）。 */
export interface LlmConfig {
  providerId: string;
  providerName: string;
  baseUrl: string;
  apiKeyEnv: string;
  modelId: string;
  modelName: string;
  contextWindow: number;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  api: "anthropic-messages" | "openai-completions";
}