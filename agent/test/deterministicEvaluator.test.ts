import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain JS Lambda module, no types
import { check, handler } from "../evaluators/deterministic/index.mjs";

const session = (answer: string, tools = ["deposit-laws___get_deposit_rules"]) => [
  { name: "invoke_agent Strands Agent", attributes: { "gen_ai.operation.name": "invoke_agent" }, events: [{ name: "gen_ai.choice", attributes: { message: answer } }] },
  ...tools.map((t) => ({ name: `execute_tool ${t}`, attributes: { "gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": t } })),
];
const expect = (text: string) => [{ expectedResponse: { text } }];
const WA = "The landlord has 30 days. Source: the propinspect.net Washington guide.";

test("passes a correct, cited answer", () => {
  const r = check(session("30 days. https://propinspect.net/security-deposit-laws/washington. Not legal advice."), expect(WA));
  assert.equal(r.label, "PASS");
});

test("fails the tampered answer: wrong deadline, no link, no disclaimer", () => {
  const r = check(session("In Washington, the landlord has 21 days."), expect(WA));
  assert.equal(r.label, "FAIL");
  assert.match(r.explanation, /missing fact "30 days".*no propinspect\.net guide link.*no not-legal-advice line/);
});

test("fails an uncovered place that gets a deadline anyway, and an answer with no tool call", () => {
  const dc = "Washington DC is not covered by these guides, so no deadline can be given.";
  assert.match(check(session("DC isn't covered, but it's usually 45 days."), expect(dc)).explanation, /gives a number of days/);
  assert.match(check(session("DC isn't covered.", []), expect(dc)).explanation, /no tool was called/);
});

test("handler reads the AgentCore payload shape and errors without an agent span", async () => {
  assert.equal((await handler({ evaluationInput: { sessionSpans: [] }, evaluationReferenceInputs: [] })).errorCode, "NO_AGENT_SPAN");
});
