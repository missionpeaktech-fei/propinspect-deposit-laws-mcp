/**
 * AgentCore Evaluations code-based evaluator (step 9, option C): Claude as the judge, called through
 * the Anthropic API with the owner's own key, from a Lambda. Level SESSION.
 *
 * Same code, one function per judge model: JUDGE_MODEL (claude-opus-5-5, claude-haiku-5-5) on each Lambda.
 * The key is read once per cold start from the Secrets Manager secret named by ANTHROPIC_KEY_SECRET; never logged.
 * Built with esbuild (scripts/build-judge.sh): the Anthropic SDK and zod are bundled, @aws-sdk comes with the Lambda runtime.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { event, finalAnswer, op } from "../deterministic/index.mjs";

const Verdict = z.object({
  pass: z.boolean(),
  explanation: z.string(),
});

const JUDGE_SYSTEM = `You grade answers from an assistant that answers US security deposit law questions using tools.
The tool results are the only source of truth; the expected answer and the assertions are the grader's checklist.
Pass only if every fact in the answer agrees with the tool results and the expected answer, every assertion holds,
and nothing is made up. Wording and extra correct detail don't matter. Explain in 1-3 sentences; name any failed check.`;

/** The judge's prompt from the session spans and ground truth, or null without an agent span. */
export function buildPrompt(spans, referenceInputs) {
  const answer = finalAnswer(spans);
  if (answer === null) return null;
  const agent = spans.find((s) => op(s) === "invoke_agent");
  const question = String(event(agent, "gen_ai.user.message").content ?? "");
  const toolResults = spans
    .filter((s) => op(s) === "execute_tool")
    .map((s) => `${s.attributes["gen_ai.tool.name"]}: ${event(s, "gen_ai.choice").message ?? ""}`);
  const expected = referenceInputs.map((r) => r.expectedResponse?.text).find(Boolean) ?? "(none)";
  const assertions = referenceInputs.flatMap((r) => r.assertions ?? []).map((a) => `- ${a.text}`);
  return [
    `<question>${question}</question>`,
    `<tool_results>\n${toolResults.join("\n\n") || "(no tool was called)"}\n</tool_results>`,
    `<answer>${answer}</answer>`,
    `<expected_answer>${expected}</expected_answer>`,
    `<assertions>\n${assertions.join("\n") || "(none)"}\n</assertions>`,
  ].join("\n\n");
}

let client;
async function anthropic() {
  if (!client) {
    // Lazy import: the Lambda runtime provides @aws-sdk; local tests never reach this.
    const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    const secret = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: process.env.ANTHROPIC_KEY_SECRET }));
    client = new Anthropic({ apiKey: secret.SecretString.trim() });
  }
  return client;
}

export const handler = async (input) => {
  // AgentCore's payload doesn't name the evaluator (despite the docs), so each judge is its own function.
  const model = process.env.JUDGE_MODEL;
  if (!model) return { errorCode: "NO_JUDGE_MODEL", errorMessage: "Set JUDGE_MODEL on this Lambda." };
  const prompt = buildPrompt(input.evaluationInput?.sessionSpans ?? [], input.evaluationReferenceInputs ?? []);
  if (!prompt) return { errorCode: "NO_AGENT_SPAN", errorMessage: "No invoke_agent span in the session." };
  try {
    const res = await (await anthropic()).messages.parse({
      model,
      max_tokens: 16000,
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      output_config: { format: zodOutputFormat(Verdict) },
    });
    if (res.stop_reason === "refusal") return { errorCode: "JUDGE_REFUSED", errorMessage: `${model} declined (${res.stop_details?.category ?? "no category"}).` };
    const verdict = res.parsed_output;
    if (!verdict) return { errorCode: "JUDGE_UNPARSED", errorMessage: `${model} returned no parseable verdict (stop_reason ${res.stop_reason}).` };
    // Usage goes in the explanation so evaluate.ts can price each judge.
    return {
      label: verdict.pass ? "PASS" : "FAIL",
      value: verdict.pass ? 1 : 0,
      explanation: `${verdict.explanation} [${model}: ${res.usage.input_tokens} in / ${res.usage.output_tokens} out]`,
    };
  } catch (error) {
    // Status only: an error body could echo request details.
    const detail = error instanceof Anthropic.APIError ? `Anthropic API ${error.status}` : String(error?.name ?? "Error");
    return { errorCode: "JUDGE_CALL_FAILED", errorMessage: `${model}: ${detail}` };
  }
};
