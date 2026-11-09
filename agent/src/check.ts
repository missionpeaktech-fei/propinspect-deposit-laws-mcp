/**
 * Step 6 acceptance check: 5 questions through the real gateway and model, each in a fresh agent.
 * Writes results/check-<timestamp>.json. Costs a few cents of Anthropic API usage.
 * Run via scripts/traced.sh to send traces to CloudWatch; each question gets its own session.id,
 * which is what evaluate.ts (step 9) scores.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createAgent, MODEL_ID, toolsCalled } from "./agent";
import { CASES } from "./cases";
import { flushTelemetry } from "./telemetry";

const startedAt = new Date().toISOString();
const stamp = startedAt.replace(/[:.]/g, "-");
const results = [];
for (const c of CASES) {
  const sessionId = `check-${stamp}-${c.id}`;
  const agent = createAgent(sessionId);
  const started = Date.now();
  const answer = String(await agent.invoke(c.question));
  const tools = toolsCalled(agent);
  const failures = [
    ...c.mustMatch.filter((r) => !r.test(answer)).map((r) => `missing ${r}`),
    ...(c.mustNotMatch ?? []).filter((r) => r.test(answer)).map((r) => `should not contain ${r}`),
    ...(tools.some((t) => c.tools.test(t)) ? [] : [`no tool matching ${c.tools} (called: ${tools.join(", ") || "none"})`]),
  ];
  results.push({ id: c.id, sessionId, question: c.question, pass: failures.length === 0, failures, tools, seconds: (Date.now() - started) / 1000, answer });
  console.log(`${failures.length ? "FAIL" : "PASS"}  ${c.question}${failures.length ? `\n      ${failures.join("; ")}` : ""}`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} passed (model ${MODEL_ID})`);
mkdirSync("results", { recursive: true });
const file = `results/check-${stamp}.json`;
writeFileSync(file, JSON.stringify({ model: MODEL_ID, startedAt, sessionPrefix: `check-${stamp}`, passed, total: results.length, results }, null, 2));
console.log(`Answers saved to agent/${file}`);
await flushTelemetry();
process.exit(passed === results.length ? 0 : 1);
