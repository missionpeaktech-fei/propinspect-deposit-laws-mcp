# Deposit-law agent (AgentCore hands-on, step 6)

A small Strands agent: Claude through the **Anthropic API** (not Bedrock), with the deposit-law tools reached **only through AgentCore Gateway** (Cognito sign-in, then IAM to the Runtime). Own `package.json` because Strands 1.24 needs `@anthropic-ai/sdk` 0.109, while the server repo's evals use 1.x.

Settings and secrets live in `~/.config/agentcore-handson/` (mode 600), never in the repo:

| File | Contents |
|---|---|
| `cognito.env` | Cognito domain, client ID and secret, scope (created in step 4) |
| `anthropic.env` | `ANTHROPIC_API_KEY=…`, a key created only for this project, with a spend limit |
| `gateway.env` | `AGENTCORE_GATEWAY_URL=https://<gateway-id>.gateway.bedrock-agentcore.<region>.amazonaws.com/mcp` |

```bash
npm install
npm test                    # token-cache unit tests (no network)
npm run ask -- "What's the deposit return deadline in Washington?"
npm run check               # step 6 acceptance: 5 questions, saves answers to results/
scripts/traced.sh src/check.ts   # same, with traces and one session.id per question (step 9 needs this)
npm run eval                     # step 9: score that run with AgentCore Evaluations (wait ~2 min after the check)
npm run eval -- Builtin.Helpfulness deposit_law_hard_rules-<id>   # any evaluators: swap them by ID
```

- `src/cognitoAuth.ts`: an MCP `AuthProvider`. The transport calls `token()` before every request (cached until a minute before expiry) and `onUnauthorized()` on a 401, then retries once.
- `src/agent.ts`: model, gateway client and the system prompt (tool results only, always cite, "not covered" means stop).
- `src/cases.ts`: the 5 questions with their ground truth (expected answer, assertions, expected tools), shared by `check.ts` and `evaluate.ts`.
- `src/evaluate.ts`: pulls the newest check run's sessions from CloudWatch and runs `Evaluate` per session and evaluator, plus a tampered negative control; prints a table with token cost and saves `results/eval-*.json`.
- `evaluators/deterministic/index.mjs`: the code-based evaluator's Lambda (hard rules, no LLM), unit-tested in `test/`.
- `evaluators/claude-judge/index.mjs`: Claude as the judge via the Anthropic API (key from Secrets Manager, model from `JUDGE_MODEL`), bundled by `scripts/build-judge.sh`.
