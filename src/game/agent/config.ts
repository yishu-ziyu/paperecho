/**
 * LLM 适配层：AI PING（OpenAI-compatible） + DeepSeek V4 Flash 0731
 *
 * 换模型只改这一个文件，业务链（chains.ts）从这里取配置。
 */
import { createProvider, envApiKeyAuth } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { Model } from "@earendil-works/pi-ai";
import type { LlmConfig } from "./types.ts";

export const LLM_CONFIG: LlmConfig = {
  providerId: "ai-ping",
  providerName: "AI PING",
  baseUrl: "https://aiping.cn/api/v1",
  apiKeyEnv: "AI_PING_API_KEY",
  modelId: "DeepSeek-V4-Flash-0731",
  modelName: "DeepSeek V4 Flash 0731",
  contextWindow: 131072,
  maxTokens: 1024,
  temperature: 0.7,
  timeoutMs: 15000,
};

/** Pi Agent 需要的模型对象。 */
export const AGENT_MODEL = {
  id: LLM_CONFIG.modelId,
  name: LLM_CONFIG.modelName,
  api: "openai-completions" as const,
  provider: LLM_CONFIG.providerId,
  baseUrl: LLM_CONFIG.baseUrl,
  input: ["text"] as const,
  contextWindow: LLM_CONFIG.contextWindow,
  maxTokens: LLM_CONFIG.maxTokens,
  reasoning: false,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
} satisfies Model<"openai-completions">;

/** 注册到 createModels() 的 Provider。 */
export function aiPingProvider() {
  return createProvider({
    id: LLM_CONFIG.providerId,
    name: LLM_CONFIG.providerName,
    baseUrl: LLM_CONFIG.baseUrl,
    auth: { apiKey: envApiKeyAuth("AI PING API key", [LLM_CONFIG.apiKeyEnv]) },
    models: [AGENT_MODEL],
    api: openAICompletionsApi(),
  });
}
