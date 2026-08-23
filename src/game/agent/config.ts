/**
 * LLM 适配层：MiniMax CN 主路径，配置只认项目 `.env`。
 *
 *   MINIMAX_CN_API_KEY / MINIMAX_BASE_URL / MINIMAX_MODEL
 *   HTTPS_PROXY 出网（Node fetch 默认不走系统代理）
 *
 * 不读宿主 ANTHROPIC_BASE_URL。切备选：PAPER_ECHO_LLM=aiping + AI_PING_API_KEY。
 */
import { createProvider, envApiKeyAuth } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { Model } from "@earendil-works/pi-ai";
import {
  installFetchProxy,
  isRealLlmKey,
  loadProjectLlmEnv,
  minimaxBaseUrl,
  minimaxModel,
} from "./project-env.ts";
import type { LlmConfig } from "./types.ts";

loadProjectLlmEnv();
installFetchProxy();

const MINIMAX: LlmConfig = {
  providerId: "minimax-cn",
  providerName: "MiniMax CN",
  baseUrl: minimaxBaseUrl(),
  apiKeyEnv: "MINIMAX_CN_API_KEY",
  modelId: minimaxModel(),
  modelName: "MiniMax M3",
  contextWindow: 1_000_000,
  maxTokens: 2048,
  temperature: 0.7,
  timeoutMs: 30000,
  api: "anthropic-messages",
};

/** 备选：旧 AI PING OpenAI 兼容端点。 */
const AIPING: LlmConfig = {
  providerId: "aiping",
  providerName: "AI PING",
  baseUrl: "https://aiping.cn/api/v1",
  apiKeyEnv: "AI_PING_API_KEY",
  modelId: "DeepSeek-V4-Flash-0731",
  modelName: "DeepSeek V4 Flash",
  contextWindow: 131_072,
  maxTokens: 4096,
  temperature: 0.7,
  timeoutMs: 30000,
  api: "openai-completions",
};

function resolveConfig(): LlmConfig {
  const prefer = (process.env.PAPER_ECHO_LLM || "minimax").toLowerCase();
  if (prefer === "aiping" && isRealLlmKey(process.env.AI_PING_API_KEY)) return AIPING;
  if (isRealLlmKey(process.env.MINIMAX_CN_API_KEY)) return MINIMAX;
  if (isRealLlmKey(process.env.AI_PING_API_KEY)) return AIPING;
  return MINIMAX;
}

export const LLM_CONFIG: LlmConfig = resolveConfig();

function agentModel(): Model<"anthropic-messages"> | Model<"openai-completions"> {
  const shared = {
    id: LLM_CONFIG.modelId,
    name: LLM_CONFIG.modelName,
    provider: LLM_CONFIG.providerId,
    baseUrl: LLM_CONFIG.baseUrl,
    input: ["text"] as ("text" | "image")[],
    contextWindow: LLM_CONFIG.contextWindow,
    maxTokens: LLM_CONFIG.maxTokens,
    reasoning: false as const,
    cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
  };
  if (LLM_CONFIG.api === "openai-completions") {
    return { ...shared, api: "openai-completions" as const };
  }
  return { ...shared, api: "anthropic-messages" as const };
}

/** Pi Agent 需要的模型对象。reasoning 关掉，避免思考段吃掉超时预算。 */
export const AGENT_MODEL = agentModel();

/** 注册到 createModels() 的 Provider。 */
export function llmProvider() {
  if (LLM_CONFIG.api === "openai-completions") {
    return createProvider({
      id: LLM_CONFIG.providerId,
      name: LLM_CONFIG.providerName,
      baseUrl: LLM_CONFIG.baseUrl,
      auth: {
        apiKey: envApiKeyAuth("AI PING API key", [LLM_CONFIG.apiKeyEnv]),
      },
      models: [AGENT_MODEL as Model<"openai-completions">],
      api: openAICompletionsApi(),
    });
  }
  return createProvider({
    id: LLM_CONFIG.providerId,
    name: LLM_CONFIG.providerName,
    baseUrl: LLM_CONFIG.baseUrl,
    auth: {
      apiKey: envApiKeyAuth("MiniMax CN API key", [LLM_CONFIG.apiKeyEnv]),
    },
    models: [AGENT_MODEL as Model<"anthropic-messages">],
    api: anthropicMessagesApi(),
  });
}

export function llmApiKey(): string | undefined {
  const primary = process.env.MINIMAX_CN_API_KEY?.trim();
  if (isRealLlmKey(primary)) return primary;
  if (LLM_CONFIG.api === "openai-completions") {
    const alt = process.env.AI_PING_API_KEY?.trim();
    return isRealLlmKey(alt) ? alt : undefined;
  }
  return undefined;
}
