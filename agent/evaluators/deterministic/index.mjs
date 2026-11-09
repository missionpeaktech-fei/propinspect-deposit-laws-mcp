/**
 * AgentCore Evaluations code-based evaluator (step 9, option B): hard rules, no LLM.
 * Level SESSION. AgentCore sends the session's spans and ground truth; we return PASS/FAIL.
 *
 * Rules (driven by the ground truth, so one function serves every question):
 *  - at least one deposit-law tool was called
 *  - every "N days" / "N months" fact in expectedResponse appears in the answer
 *  - "not covered" expected: the answer says not covered and gives no number of days
 *  - otherwise: the answer says it is not legal advice, and cites a propinspect.net guide when expectedResponse names one
 * Contract: docs.aws.amazon.com/bedrock-agentcore/latest/devguide/code-based-evaluators.html
 */
const NOT_COVERED = /\b(not|isn't|is not|aren't)\s+covered\b/i;

const op = (span) => span.attributes?.["gen_ai.operation.name"];
const event = (span, name) => span.events?.find((e) => e.name === name)?.attributes ?? {};

/** The agent's final answer: the gen_ai.choice message on the invoke_agent span. */
function finalAnswer(spans) {
  const agent = spans.find((s) => op(s) === "invoke_agent");
  return agent ? String(event(agent, "gen_ai.choice").message ?? "") : null;
}

export function check(spans, referenceInputs) {
  const answer = finalAnswer(spans);
  if (answer === null) return { errorCode: "NO_AGENT_SPAN", errorMessage: "No invoke_agent span in the session." };
  const expected = referenceInputs.map((r) => r.expectedResponse?.text).find(Boolean) ?? "";
  const tools = spans.filter((s) => op(s) === "execute_tool").map((s) => s.attributes["gen_ai.tool.name"]);

  const failures = [];
  if (!tools.length) failures.push("no tool was called");
  for (const fact of expected.match(/\b\d+\s+(days|months)\b/gi) ?? [])
    if (!new RegExp(`\\b${fact.replace(/\s+/, "\\s+")}`, "i").test(answer)) failures.push(`missing fact "${fact}"`);
  if (NOT_COVERED.test(expected)) {
    if (!NOT_COVERED.test(answer)) failures.push('does not say "not covered"');
    if (/\b\d+\s*(business\s+)?days\b/i.test(answer)) failures.push("gives a number of days for an uncovered place");
  } else {
    if (/propinspect\.net/.test(expected) && !/propinspect\.net\/security-deposit-laws\//.test(answer)) failures.push("no propinspect.net guide link");
    if (!/not legal advice/i.test(answer)) failures.push("no not-legal-advice line");
  }
  return failures.length
    ? { label: "FAIL", value: 0, explanation: failures.join("; ") }
    : { label: "PASS", value: 1, explanation: `All hard rules hold (tools: ${tools.join(", ")}).` };
}

export const handler = async (event) => check(event.evaluationInput?.sessionSpans ?? [], event.evaluationReferenceInputs ?? []);
