/**
 * Step 9: score the newest check run with AgentCore Evaluations (on-demand).
 *
 *   npm run eval                                    # default evaluators
 *   npm run eval -- Builtin.Helpfulness <custom-evaluator-id> ...
 *
 * Swap evaluators by naming them: built-in, third-party (ThirdParty.*) or your own (code-based or
 * LLM judge). Every evaluator scores the same sessions with the same ground truth from cases.ts.
 *
 * Needs: a check run made through scripts/traced.sh (so each question has a session.id in CloudWatch),
 * a few minutes for CloudWatch to ingest the spans, and the `agentcore` AWS profile signed in.
 * Writes results/eval-<timestamp>.json. Cost: printed per evaluator (built-in token pricing, 2026-11-09).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CASES } from "./cases";

const DEFAULT_EVALUATORS = ["Builtin.Correctness", "Builtin.GoalSuccessRate", "Builtin.Helpfulness", "Builtin.TrajectoryAnyOrderMatch"];
// AgentCore pricing page, checked 2026-11-09: built-in and managed third-party = per token, model included.
const BUILTIN_PER_1K_IN = 0.0024;
const BUILTIN_PER_1K_OUT = 0.012;
const CUSTOM_PER_EVAL = 0.0015; // custom evaluators: $1.50 per 1,000, model usage billed separately
// Anthropic API $ per 1M input/output tokens (claude-api skill, cached 2026-10-06), for the Claude judge (option C).
const ANTHROPIC_PER_M: Record<string, [number, number]> = { "claude-opus-5-5": [4, 20], "claude-haiku-5-5": [0.1, 0.5] };
/** The Claude judge appends "[model: N in / M out]" to its explanation; price it. */
function judgeUsd(explanation = ""): number {
  const m = explanation.match(/\[(claude-[\w-]+): (\d+) in \/ (\d+) out\]$/);
  const price = m ? ANTHROPIC_PER_M[m[1]!] : undefined;
  return m && price ? (Number(m[2]) * price[0] + Number(m[3]) * price[1]) / 1e6 : 0;
}

const awsEnv = { ...process.env, AWS_PROFILE: process.env.AWS_PROFILE ?? "agentcore", AWS_REGION: process.env.AWS_REGION ?? "us-east-2", AWS_PAGER: "" };
const aws = (...args: string[]) => JSON.parse(execFileSync("aws", [...args, "--output", "json"], { env: awsEnv, maxBuffer: 64 << 20 }).toString());

type Span = { traceId: string; name: string; attributes?: Record<string, unknown>; [k: string]: unknown };
type Result = { evaluatorId: string; value?: number; label?: string; explanation?: string; errorCode?: string; errorMessage?: string; tokenUsage?: { inputTokens: number; outputTokens: number } };

/** All spans for this run's sessions, from the Transaction Search log group. */
async function fetchSpans(sessionPrefix: string, sinceMs: number): Promise<Map<string, Span[]>> {
  const { queryId } = aws("logs", "start-query", "--log-group-name", "aws/spans",
    "--start-time", String(Math.floor(sinceMs / 1000) - 300), "--end-time", String(Math.floor(Date.now() / 1000)),
    "--query-string", `fields @message | filter ispresent(scope.name) and attributes.session.id like "${sessionPrefix}" | sort @timestamp asc | limit 10000`);
  let res;
  while ((res = aws("logs", "get-query-results", "--query-id", queryId)).status !== "Complete") {
    if (["Failed", "Cancelled", "Timeout"].includes(res.status)) throw new Error(`Logs Insights query ${res.status}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  const bySession = new Map<string, Span[]>();
  for (const row of res.results as Array<Array<{ field: string; value: string }>>) {
    const span = JSON.parse(row.find((f) => f.field === "@message")!.value) as Span;
    const id = String(span.attributes?.["session.id"]);
    bySession.set(id, [...(bySession.get(id) ?? []), span]);
  }
  return bySession;
}

// Negative control: the Washington answer rewritten to the pre-2023 deadline with no citation or
// disclaimer, while the tool result in the same trace still says 30 days. A useful evaluator fails it.
const TAMPERED_ANSWER = "In Washington, the landlord has 21 days after the tenant moves out to return the deposit.";
function tamper(spans: Span[], sessionId: string): Span[] {
  return spans.map((span) => {
    const copy = JSON.parse(JSON.stringify(span)) as Span & { events?: Array<{ name: string; attributes?: Record<string, unknown> }> };
    copy.attributes = { ...copy.attributes, "session.id": sessionId };
    if (["invoke_agent", "chat"].includes(String(copy.attributes["gen_ai.operation.name"])))
      for (const e of copy.events ?? [])
        if (e.name === "gen_ai.choice" && typeof e.attributes?.message === "string" && !e.attributes.message.includes("toolUse"))
          e.attributes.message = TAMPERED_ANSWER;
    return copy;
  });
}

const files = readdirSync("results").filter((f) => /^check-.*\.json$/.test(f)).sort();
const checkFile = files.at(-1);
if (!checkFile) throw new Error("No results/check-*.json. Run: scripts/traced.sh src/check.ts");
const check = JSON.parse(readFileSync(join("results", checkFile), "utf8"));
const runs = check.results;
if (!check.sessionPrefix) throw new Error(`${checkFile} has no session IDs: re-run scripts/traced.sh src/check.ts`);

const evaluators = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_EVALUATORS;
const spans = await fetchSpans(check.sessionPrefix, Date.parse(check.startedAt));
const wa = runs.find((r: { id: string }) => r.id === "wa-deadline");
if (wa && spans.has(wa.sessionId)) {
  const sessionId = `${wa.sessionId}-tampered`;
  spans.set(sessionId, tamper(spans.get(wa.sessionId)!, sessionId));
  const c = CASES.find((x) => x.id === "wa-deadline")!;
  runs.push({ id: "wa-deadline", label: "CONTROL wa-tampered", sessionId, pass: c.mustMatch.every((r) => r.test(TAMPERED_ANSWER)) });
}
console.log(`${checkFile}: ${runs.length} sessions, spans found for ${spans.size}. Evaluators: ${evaluators.join(", ")}\n`);

const tmp = mkdtempSync(join(tmpdir(), "eval-"));
const rows: Array<{ id: string; sessionId: string; regexPass: boolean; results: Record<string, Result[]> }> = [];
for (const run of runs) {
  const c = CASES.find((x) => x.id === run.id)!;
  const sessionSpans = spans.get(run.sessionId) ?? [];
  const agentSpan = sessionSpans.find((s) => s.attributes?.["gen_ai.operation.name"] === "invoke_agent");
  const row = { id: run.label ?? c.id, sessionId: run.sessionId, regexPass: run.pass, results: {} as Record<string, Result[]> };
  rows.push(row);
  if (!agentSpan) {
    console.log(`${c.id}: no agent spans in CloudWatch yet (ingestion takes a few minutes); skipped`);
    continue;
  }
  const referenceInputs = [
    { context: { spanContext: { sessionId: run.sessionId } }, assertions: c.assertions.map((text) => ({ text })), expectedTrajectory: { toolNames: c.expectedTools } },
    { context: { spanContext: { sessionId: run.sessionId, traceId: agentSpan.traceId } }, expectedResponse: { text: c.expectedResponse } },
  ];
  for (const evaluatorId of evaluators) {
    const input = join(tmp, "input.json");
    writeFileSync(input, JSON.stringify({ evaluatorId, evaluationInput: { sessionSpans }, evaluationReferenceInputs: referenceInputs }));
    try {
      // Drop evaluatorArn: it repeats evaluatorId and contains the account ID (results are committed).
      row.results[evaluatorId] = aws("bedrock-agentcore", "evaluate", "--cli-input-json", `file://${input}`).evaluationResults
        .map(({ evaluatorArn: _arn, ...rest }: Result & { evaluatorArn?: string }) => rest);
    } catch (error) {
      row.results[evaluatorId] = [{ evaluatorId, errorCode: "CallFailed", errorMessage: String((error as { stderr?: Buffer }).stderr ?? error).trim().slice(0, 300) }];
    }
  }
}

// Table: one row per question, one column per evaluator, plus our own regex check for comparison.
const cell = (rs: Result[] = []) => rs.map((r) => (r.errorCode ? `ERR ${r.errorCode}` : `${r.label} (${r.value})`)).join("; ") || "-";
console.log(["question", "regex check", ...evaluators].join(" | "));
for (const row of rows) console.log([row.id, row.regexPass ? "PASS" : "FAIL", ...evaluators.map((e) => cell(row.results[e]))].join(" | "));

console.log("\nCost per evaluator (this run):");
const totals = evaluators.map((e) => {
  const rs = rows.flatMap((r) => r.results[e] ?? []).filter((r) => !r.errorCode);
  const tin = rs.reduce((n, r) => n + (r.tokenUsage?.inputTokens ?? 0), 0);
  const tout = rs.reduce((n, r) => n + (r.tokenUsage?.outputTokens ?? 0), 0);
  const managed = /^(Builtin|ThirdParty)\./.test(e);
  const judge = rs.reduce((n, r) => n + judgeUsd(r.explanation), 0);
  const usd = managed ? (tin / 1000) * BUILTIN_PER_1K_IN + (tout / 1000) * BUILTIN_PER_1K_OUT : rs.length * CUSTOM_PER_EVAL + judge;
  console.log(`  ${e}: ${rs.length} results, ${tin} in / ${tout} out tokens, ~$${usd.toFixed(4)}${managed ? "" : ` (AgentCore fee, upper bound${judge ? ` + $${judge.toFixed(4)} Anthropic API` : ""})`}`);
  return { evaluatorId: e, results: rs.length, inputTokens: tin, outputTokens: tout, usd };
});

mkdirSync("results", { recursive: true });
const out = `results/eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify({ checkFile, evaluators, totals, rows }, null, 2));
console.log(`\nSaved agent/${out}`);
