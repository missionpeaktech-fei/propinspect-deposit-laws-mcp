/**
 * The deposit-law agent: Claude (Anthropic API) + the deposit-law tools, reached only
 * through AgentCore Gateway (sign-in, then IAM to the Runtime). See ../LEARNING-LOG.md step 6.
 */
import { Agent, McpClient } from "@strands-agents/sdk";
import { AnthropicModel } from "@strands-agents/sdk/models/anthropic";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { loadConfig } from "./config";
import { cognitoAuthProvider } from "./cognitoAuth";

export const MODEL_ID = process.env.AGENT_MODEL_ID ?? "claude-sonnet-5-5";

export const SYSTEM_PROMPT = `You answer questions about US residential security deposit law.

Rules:
- Answer only from the deposit-law tool results. Never answer from memory, even for well-known states.
- Call a tool for every state the user asks about. Use the comparison tool when the user asks about several states.
- Cite every answer: the guide link and its review date exactly as the tool returned them.
- If a tool says a place is not covered, say plainly that it is not covered and stop. Do not guess its rules.
- End with one short line saying this is general information, not legal advice.
- Keep answers short: the rule the user asked about, then the citation.`;

/** sessionId goes on every span as `session.id`: AgentCore Evaluations groups spans into sessions by it. */
export function createAgent(sessionId?: string) {
  const config = loadConfig();
  const gateway = new McpClient({
    transport: new StreamableHTTPClientTransport(new URL(config.gatewayUrl), {
      authProvider: cognitoAuthProvider(config.cognito),
    }),
  });
  const model = new AnthropicModel({ apiKey: config.anthropicApiKey, modelId: MODEL_ID, maxTokens: 1024 });
  return new Agent({
    model,
    tools: [gateway],
    systemPrompt: SYSTEM_PROMPT,
    printer: false,
    ...(sessionId ? { traceAttributes: { "session.id": sessionId } } : {}),
  });
}

/** Names of the tools the agent called during its conversation, in order. */
export function toolsCalled(agent: Agent): string[] {
  const names: string[] = [];
  for (const message of agent.messages) {
    for (const block of message.content as Array<{ type?: string; name?: string; toolUse?: { name: string } }>) {
      if (block.type === "toolUseBlock" && block.name) names.push(block.name);
      else if (block.toolUse?.name) names.push(block.toolUse.name);
    }
  }
  return names;
}
