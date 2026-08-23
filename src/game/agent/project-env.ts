/**
 * 项目 .env 是 MiniMax 的唯一配置源。
 * 宿主注入的 ANTHROPIC_*（PROXY_ / 127.0.0.1:15721）不当作大模型服务。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

/** 这些键以仓库 `.env` 为准，覆盖进程里被劫持的同名变量。 */
export const PROJECT_LLM_KEYS = [
  "MINIMAX_CN_API_KEY",
  "MINIMAX_BASE_URL",
  "MINIMAX_MODEL",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "ALL_PROXY",
  "PAPER_ECHO_LLM",
  "AI_PING_API_KEY",
] as const;

const DEFAULT_MINIMAX_BASE = "https://api.minimaxi.com/anthropic";
const DEFAULT_MINIMAX_MODEL = "MiniMax-M3";

export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function isRealLlmKey(value: string | undefined): boolean {
  const t = value?.trim() ?? "";
  if (t.length < 20) return false;
  if (/^PROXY[_-]/.test(t) || t === "PROXY") return false;
  return true;
}

export function applyProjectLlmEnv(
  file: Record<string, string>,
  env: Record<string, string | undefined> = process.env,
): void {
  for (const key of PROJECT_LLM_KEYS) {
    const value = file[key]?.trim();
    if (value) env[key] = value;
  }
  if (!env.NO_PROXY?.trim()) env.NO_PROXY = "127.0.0.1,localhost";
}

export function projectRootFromConfig(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function loadProjectLlmEnv(root = projectRootFromConfig()): Record<string, string> {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return {};
  const file = parseDotEnv(readFileSync(envPath, "utf8"));
  applyProjectLlmEnv(file);
  return file;
}

let proxyInstalled = false;

/** Node fetch 默认不认 HTTPS_PROXY。有代理就装上，本地地址走 NO_PROXY。 */
export function installFetchProxy(): void {
  if (proxyInstalled) return;
  const proxy = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || "").trim();
  if (!proxy) return;
  setGlobalDispatcher(new EnvHttpProxyAgent());
  proxyInstalled = true;
}

export function minimaxBaseUrl(): string {
  const fromProject = process.env.MINIMAX_BASE_URL?.trim();
  if (fromProject && !/127\.0\.0\.1|localhost/i.test(fromProject)) return fromProject.replace(/\/$/, "");
  return DEFAULT_MINIMAX_BASE;
}

export function minimaxModel(): string {
  return process.env.MINIMAX_MODEL?.trim() || DEFAULT_MINIMAX_MODEL;
}
