import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type, createModels } from "@earendil-works/pi-ai";
import type { Model } from "@earendil-works/pi-ai";
import { xaiProvider } from "@earendil-works/pi-ai/providers/xai";

const grok = {
  id: "grok-4.20-0309-non-reasoning",
  name: "Grok 4.20",
  api: "openai-completions" as const,
  provider: "xai",
  baseUrl: "https://api.x.ai/v1",
  input: ["text"] as const,
  contextWindow: 131072,
  maxTokens: 2048,
  reasoning: false,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
} satisfies Model<"openai-completions">;

const models = createModels();
models.setProvider(xaiProvider());

const ping: AgentTool = {
  name: "ping",
  label: "Ping",
  description: "Call once then answer the user.",
  parameters: Type.Object({ note: Type.String() }),
  execute: async (_id, params) => ({
    content: [{ type: "text", text: `pong:${params.note}` }],
    details: params,
  }),
};

const agent = new Agent({
  initialState: {
    systemPrompt: "You are terse. Call ping once, then reply in one short Chinese sentence.",
    model: grok,
    thinkingLevel: "off",
    tools: [ping],
  },
  streamFn: models.streamSimple.bind(models),
  getApiKey: async () => process.env.XAI_API_KEY,
});

await agent.prompt("改到凌晨，群里只回了收到。");
const last = agent.state.messages.at(-1);
console.log(JSON.stringify({ err: agent.state.errorMessage, last, n: agent.state.messages.length }, null, 2));
