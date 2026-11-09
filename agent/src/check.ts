/**
 * Step 6 acceptance check: 5 questions through the real gateway and model, each in a fresh agent.
 * Writes results/check-<timestamp>.json. Costs a few cents of Anthropic API usage.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createAgent, MODEL_ID, toolsCalled } from "./agent";

interface Case {
  question: string;
  mustMatch: RegExp[];
  mustNotMatch?: RegExp[];
  tools: RegExp;
}

const DISCLAIMER = /not legal advice/i;
const CASES: Case[] = [
  {
    question: "What's the deposit return deadline in Washington?",
    mustMatch: [/30 days/i, /propinspect\.net\/security-deposit-laws\/washington/, DISCLAIMER],
    tools: /get_deposit_rules/,
  },
  {
    question: "What's the most a landlord in Nevada can charge as a security deposit?",
    mustMatch: [/3 months/i, /propinspect\.net\/security-deposit-laws\/nevada/, DISCLAIMER],
    tools: /get_deposit_rules/,
  },
  {
    question: "Compare the deposit return deadlines in California and Texas.",
    mustMatch: [/security-deposit-laws\/california/, /security-deposit-laws\/texas/, DISCLAIMER],
    tools: /compare_states|get_deposit_rules/,
  },
  {
    question: "Which states can you answer deposit questions for?",
    mustMatch: [/50/],
    tools: /list_covered_states/,
  },
  {
    question: "What's the security deposit return deadline in Washington DC?",
    mustMatch: [/not covered/i],
    mustNotMatch: [/\b\d+\s*(business\s+)?days\b/i],
    tools: /get_deposit_rules/,
  },
];

const results = [];
for (const c of CASES) {
  const agent = createAgent();
  const started = Date.now();
  const answer = String(await agent.invoke(c.question));
  const tools = toolsCalled(agent);
  const failures = [
    ...c.mustMatch.filter((r) => !r.test(answer)).map((r) => `missing ${r}`),
    ...(c.mustNotMatch ?? []).filter((r) => r.test(answer)).map((r) => `should not contain ${r}`),
    ...(tools.some((t) => c.tools.test(t)) ? [] : [`no tool matching ${c.tools} (called: ${tools.join(", ") || "none"})`]),
  ];
  results.push({ question: c.question, pass: failures.length === 0, failures, tools, seconds: (Date.now() - started) / 1000, answer });
  console.log(`${failures.length ? "FAIL" : "PASS"}  ${c.question}${failures.length ? `\n      ${failures.join("; ")}` : ""}`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} passed (model ${MODEL_ID})`);
mkdirSync("results", { recursive: true });
const file = `results/check-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify({ model: MODEL_ID, passed, total: results.length, results }, null, 2));
console.log(`Answers saved to agent/${file}`);
process.exit(passed === results.length ? 0 : 1);
