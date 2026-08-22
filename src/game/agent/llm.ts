import type { TokenMeter } from "../types.ts";
import { LLM_CONFIG } from "./config.ts";

const MODEL = LLM_CONFIG.modelId;

export function emptyMeter(node = "", via: TokenMeter["via"] = "archive"): TokenMeter {
  return {
    prompt: 0,
    completion: 0,
    total: 0,
    model: via === "archive" ? "archive" : MODEL,
    via,
    node,
  };
}

export function hasApiKey(): boolean {
  return Boolean(process.env[LLM_CONFIG.apiKeyEnv]);
}