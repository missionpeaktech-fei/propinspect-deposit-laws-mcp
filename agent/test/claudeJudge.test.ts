import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain JS Lambda module, no types
import { buildPrompt, handler } from "../evaluators/claude-judge/index.mjs";

test("no JUDGE_MODEL: error result, never a default model", async () => {
  delete process.env.JUDGE_MODEL;
  assert.equal((await handler({ evaluationInput: { sessionSpans: [] } })).errorCode, "NO_JUDGE_MODEL");
});

const spans = [
  {
    name: "invoke_agent Strands Agent",
    attributes: { "gen_ai.operation.name": "invoke_agent" },
    events: [
      { name: "gen_ai.user.message", attributes: { content: '[{"text":"Deadline in WA?"}]' } },
      { name: "gen_ai.choice", attributes: { message: "21 days." } },
    ],
  },
  {
    name: "execute_tool deposit-laws___get_deposit_rules",
    attributes: { "gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": "deposit-laws___get_deposit_rules" },
    events: [{ name: "gen_ai.choice", attributes: { message: "Return deadline: 30 days" } }],
  },
];

test("prompt carries question, tool result, answer and ground truth", () => {
  const prompt = buildPrompt(spans, [{ expectedResponse: { text: "30 days" } }, { assertions: [{ text: "Gives 30 days." }] }]);
  for (const part of ["Deadline in WA?", "deposit-laws___get_deposit_rules: Return deadline: 30 days", "<answer>21 days.</answer>", "<expected_answer>30 days</expected_answer>", "- Gives 30 days."])
    assert.ok(prompt.includes(part), part);
});

test("no agent span: error result, and no API call", async () => {
  assert.equal(buildPrompt([], []), null);
  process.env.JUDGE_MODEL = "claude-haiku-5-5";
  assert.equal((await handler({ evaluationInput: { sessionSpans: [] } })).errorCode, "NO_AGENT_SPAN");
});
