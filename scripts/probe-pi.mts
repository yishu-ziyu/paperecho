import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type, createModels } from "@earendil-works/pi-ai";
import { AGENT_MODEL, llmApiKey, llmProvider } from "../src/game/agent/config.ts";

const models = createModels();
models.setProvider(llmProvider());

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
    model: AGENT_MODEL,
    thinkingLevel: "off",
    tools: [ping],
  },
  streamFn: models.streamSimple.bind(models),
  getApiKey: async () => llmApiKey(),
});

await agent.prompt("改到凌晨，群里只回了收到。");
const last = agent.state.messages.at(-1);
console.log(
  JSON.stringify({ err: agent.state.errorMessage, last, n: agent.state.messages.length }, null, 2),
);
