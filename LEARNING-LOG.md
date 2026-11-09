# AgentCore hands-on: learning log

One section per step: what the component does, what surprised us, and the doc pages used. Decision record: `docs/decisions/0007-agentcore-handson.md`.

## Before step 1: research (2026-11-09)

What the docs say, checked before choosing the plan:

- **AgentCore Runtime hosts MCP servers.** Set `serverProtocol` to `MCP` and serve streamable HTTP at `0.0.0.0:8000/mcp`. It supports both stateless and stateful servers; MCP version 2026-07-28 is stateless by design, so no stateful mode is needed. Node.js code can be deployed straight from a zip (no Docker), with a 250 MB package limit. [Deploy MCP servers in AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp.html), [Direct code deployment](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-code-deploy.html)
- **AgentCore Gateway** fronts MCP servers as "targets". It supports MCP versions 2026-07-28, 2025-11-25, 2025-06-18 and 2025-03-26, indexes the target's tools (by calling `tools/list`), and needs a re-sync when tools change. Outbound auth to the target: none, OAuth, IAM (SigV4) or API key; Runtime accepts SigV4, so Gateway → Runtime can use IAM. [MCP server targets](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-MCPservers.html)
- **Inbound auth** on Gateway: JWT, IAM, or "offloaded" (authenticate-only, or none). AWS: use "none" only for a public gateway with your own throttling, never for convenience in testing. JWT subjects are logged in CloudTrail, so keep PII out of them. [Inbound authorization](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-inbound-auth.html)
- **Pricing** (checked 2026-11-09): Gateway $0.005 per 1,000 calls, $0.025 per 1,000 searches, $0.02 per 100 tools indexed a month; Runtime $0.1276 per vCPU-hour and $0.0169 per GB-hour (v2), CPU free during I/O wait; Policy $0.000025 per check; Identity free through Runtime or Gateway; traces billed as CloudWatch. Model calls are billed separately and are the main cost here. [AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)

**Consulting note:** AgentCore is a set of separately billed parts (Runtime, Gateway, Identity, Policy, Observability, Evaluations). A client can adopt Gateway in front of tools they already host, without moving compute to Runtime.

## Step 1: inspect and prepare (2026-11-09)

- **What exists:** `src/index.ts` starts the server over stdio. One tool core (`src/core/`) and one MCP layer (`src/mcp/server.ts`) register 3 tools: `get_deposit_rules`, `compare_states`, `list_covered_states`. The return deadline is a field of `get_deposit_rules`, not its own tool. The data is a 50-state snapshot (from app commit `74c3469`).
- **Call log:** already opt-in (`DEPOSIT_LAWS_CALL_LOG`); without the variable nothing is logged. The hosted copy simply won't set it.
- **Check (passed):** MCP Inspector 2.13.0 in CLI mode:
  - `npx -y @modelcontextprotocol/inspector@2.13.0 --cli npx tsx src/index.ts --method tools/list` → the 3 tools.
  - `... --method tools/call --tool-name get_deposit_rules --tool-arg state=NV` → Nevada: 30-day return or itemized accounting, 3 months' rent cap, up to 2x penalty, with `Source: https://propinspect.net/security-deposit-laws/nevada (last reviewed 2026-10-12; NRS § 118A.242)` and the not-legal-advice notice.
- **Next (step 2):** add streamable HTTP next to stdio, over the same tool core, at `:8000/mcp`, matching what Runtime expects.

## Step 2: add an HTTP transport (2026-11-09)

- **What changed:** `src/http.ts`, a second entry point next to stdio. It reuses the same tool core and `createServer()`; only the transport differs. Built with the SDK's `createMcpHandler` (one fresh `McpServer` per HTTP request, which is what "stateless" means in practice) and the official `@modelcontextprotocol/node` adapter 2.1.2 (no 2.4.0 release exists; it declares `@modelcontextprotocol/server ^2.4.0`).
- **Shaped for AgentCore Runtime:** port 8000, path `/mcp`, and `GET /ping` returning `{"status":"Healthy"}` (the docs recommend it). `HOST` defaults to `127.0.0.1`; Runtime will need `0.0.0.0`.
- **Old clients still work:** the handler serves 2025-era clients statelessly by default, so the Gateway or an older Inspector can talk to it whatever version they pick.
- **Security:** the server has no sign-in. On loopback it rejects foreign Host headers (DNS rebinding); everywhere it rejects a browser Origin from another site. Sign-in comes from AgentCore in front of it. Added to `docs/threat-model.md`.
- **What surprised us:** a per-request server means no shared state between calls, which is why the 2026-07-28 spec dropped the handshake; AgentCore's docs say version 2026-07-28 needs no stateful mode.
- **Check (passed):**
  - `npm test`: 38/38, including the new `test/http.e2e.test.ts` (3 tools over HTTP, NV deadline with citation, `/ping`, 404 elsewhere, Origin 403).
  - `PORT=8765 npm run start:http`, then `npx -y @modelcontextprotocol/inspector@2.13.0 --cli http://localhost:8765/mcp --transport http --method tools/list` → the 3 tools; `tools/call get_deposit_rules state=NV` → "within 30 days" with the Nevada guide link. A request with `Host: evil.example` → 403.
- **Doc pages:** [TypeScript SDK v2: serving over HTTP](https://ts.sdk.modelcontextprotocol.io/v2/serving/http), [Deploy MCP servers in AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp.html).
- **Next (step 3, needs AWS):** Budgets alert, then deploy to Runtime (Node.js direct code deploy) with JWT sign-in.

## Account setup: the new AWS experience (2026-11-09)

- **New project, not the old account.** The old account (2022) had an admin IAM user with no MFA and a 4-year-old admin access key in `~/.aws/credentials`. Rather than clean it up mid-project, Fei signed up again. AWS's 2026 sign-up creates an **AWS Builder ID** first, then a **project**: an account with preconfigured defaults, AWS-managed SCPs/RCPs, sign-in through the Builder ID, and **one fixed region** (ours: `us-east-2`). No IAM users for people ("team members" are invited by email); IAM Identity Center and Organizations aren't available unless "advanced features" are turned on.
- **Free plan:** $100 credits, plan ends 2027-05-09 (`aws freetier get-account-plan-state`). AgentCore, Bedrock, Cognito, CloudWatch, X-Ray and Budgets are all on the Free plan list. If Bedrock models show zero quota, upgrading to Paid keeps the credits.
- **CLI sign-in without keys:** `aws login --profile agentcore` opens the browser and stores 12-hour credentials that renew for 90 days. The CLI acts as `AccountFullAccessRole`, a managed role, not a user with a key.
- **Agent Toolkit for AWS:** `aws configure agent-toolkit` installed 25 AWS skills into Claude Code and Cursor and added the `aws-mcp` server (a local `mcp-proxy-for-aws` in front of `https://aws-mcp.us-east-1.api.aws/mcp`), pointed at the profile with `AWS_MCP_PROXY_PROFILES=agentcore`. AWS's "new experience" rules sit in an untracked `CLAUDE.md` here.
- **Consulting note:** the new experience is a guard-railed sandbox (single region, managed SCPs, spend limits in AWS Settings). Good for a learner or a small team; an enterprise client will be on the advanced experience with Organizations and Identity Center, so policies and roles will look different there.
- **Doc pages:** [Agent Toolkit setup](https://github.com/aws/agent-toolkit-for-aws/blob/main/setup-instructions/setup.md), [Supported services for the new AWS experience](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html).

## Pre-flight checks in the new project (2026-11-09)

- **AgentCore is in us-east-2:** `list-agent-runtimes`, `list-gateways` and `list-policy-engines` all answer (0 of each).
- **Bedrock models are not usable yet on the Free plan** (5-token test calls, `aws bedrock-runtime converse`):
  - Claude Sonnet 5.5 and Haiku 5.5: "not available for this account"; `get-foundation-model-availability` shows `agreementAvailability: NOT_AVAILABLE`.
  - Claude Sonnet 4.6: "Model use case details have not been submitted" (Anthropic's one-time use-case form).
  - Amazon Nova Lite / Nova 2 Lite: "Too many tokens per day" on the first call; Service Quotas shows **0 tokens per day**.
- **Lesson for clients:** model access is its own gate, separate from IAM: account plan, per-provider agreements and forms, and per-model daily token quotas. Check all three before promising a demo in a fresh account.

## Step 3: host the server on AgentCore Runtime (2026-11-09)

- **Budget first:** `agentcore-handson-monthly`, $20/month, emails at 80% actual and 100% forecast. The project's **spend limit** ($20, set in AWS Settings) is the hard stop: it pauses the project. A budget only warns.
- **Packaging (`npm run build:agentcore`):** Runtime runs JavaScript, not TypeScript. esbuild bundles `src/http.ts` and every dependency into one ESM file (`build/http/index.js`, Node 22), next to `data/` and a two-line `package.json`. 336 KB zipped. Tested by unzipping into an empty folder and running it with `HOST=0.0.0.0` before uploading.
- **Resources** (all tagged `project=agentcore-handson`, listed in `TEARDOWN.md`):
  - S3 bucket `bedrock-agentcore-code-<account>-us-east-2`, public access blocked, holding the zip.
  - IAM role `agentcore-deposit-laws-mcp-runtime`: trusted only by AgentCore in this account and region (`aws:SourceAccount` + `aws:SourceArn`, against confused-deputy attacks). Permissions: logs, X-Ray, metrics. **No Bedrock access**: AWS's sample role allows model calls, but this server never calls a model.
  - Runtime `deposit_laws_mcp`: `codeConfiguration` (S3 zip, `NODE_22`, entry `build/http/index.js`), `serverProtocol: MCP`, env `HOST=0.0.0.0, PORT=8000`, idle sessions end after 5 minutes (memory is billed until then). The DEFAULT endpoint was created automatically.
- **Inbound auth: IAM, not Cognito.** With no authorizer, Runtime requires SigV4-signed calls from an identity allowed `bedrock-agentcore:InvokeAgentRuntime`. User sign-in (JWT) moves to the Gateway in step 4; the Gateway will call the Runtime with IAM. One sign-in for people, IAM between AWS services: the usual enterprise split.
- **Check (passed):**
  - `aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn <arn> --qualifier DEFAULT --runtime-session-id <33+ chars> --content-type application/json --accept "application/json, text/event-stream" --payload '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' --cli-binary-format raw-in-base64-out out.txt` → 200, SSE, the 3 tools.
  - `tools/call get_deposit_rules {"state":"NV"}` → the 30-day deadline and the Nevada guide link.
  - The same request unsigned (curl) → 403.
- **What surprised us:**
  - The MCP payload passes through `InvokeAgentRuntime` untouched, so an ordinary AWS API call is an MCP client.
  - A plain `tools/list` with no handshake works, thanks to the SDK's stateless legacy fallback.
  - **No log group appeared** after several minutes, although the docs say Runtime creates one. To investigate in step 7 with Transaction Search (possibly the new-experience guardrails).
- **Doc pages:** [Direct code deployment for Node.js](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-code-deploy-node.html), [Runtime IAM permissions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-permissions.html), [Observability setup](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-configure.html), and the Agent Toolkit `amazon-bedrock` skill (`references/agentcore-runtime.md`).
- **Cost so far:** cents at most (a few seconds of Runtime, one small S3 object).

## Step 4: AgentCore Gateway with sign-in (2026-11-09)

- **Design:** an **MCP gateway** (`--protocol-type MCP`) with the Runtime as an **MCP server target**. The alternative, a "Runtime target", is a pass-through: no tool aggregation, no tool sync, no tool-level policy. The MCP gateway merges tools from all its targets into one MCP server, indexes them, and is where AgentCore Policy applies per tool (step 8).
- **Three identity layers, each set separately** (they fail with the same 401/403, for different reasons):
  1. **Inbound (caller → Gateway): JWT from Cognito.** Machine-to-machine (`client_credentials`): a user pool with a domain (the token endpoint), a resource server with one scope `deposit-laws/invoke`, and an app client with a secret. The gateway's `customJWTAuthorizer` checks the issuer (discovery URL), `client_id` (`allowedClients`) and the scope (`allowedScopes`). Cognito M2M access tokens carry `client_id` but no `aud`, so `allowedClients` is the right check. The secret lives in `~/.config/agentcore-handson/cognito.env` (mode 600), outside the repo.
  2. **Outbound (Gateway → Runtime): IAM.** `credentialProviderType: GATEWAY_IAM_ROLE` with `iamCredentialProvider.service = bedrock-agentcore`: the gateway signs with its own role. That role (`agentcore-deposit-laws-gateway`) can only `InvokeAgentRuntime` on this one Runtime, and only this one gateway can assume it (trust policy `aws:SourceArn` = the gateway ARN, narrowed right after the gateway was created).
  3. **Runtime lock:** a resource-based policy on the Runtime allows only the gateway role and **explicitly denies every other principal** (`ArnNotEquals aws:PrincipalArn`). An explicit Deny beats any Allow, so even the admin role can't call the Runtime directly. Every call now passes the gateway's sign-in, policy and logs.
- **Tool names gain a prefix:** `deposit-laws___get_deposit_rules` (target name + three underscores). That keeps tools from several targets apart; agents and policies must use the prefixed names.
- **Target sync:** creating the target made the gateway call `tools/list` on the Runtime and index the tools (status `READY`, `lastSynchronizedAt` set). If the server's tools change, call `SynchronizeGatewayTargets`.
- **Check (passed):**
  - Gateway URL `https://<gateway-id>.gateway.bedrock-agentcore.us-east-2.amazonaws.com/mcp`: no token → **401**; a made-up token → **401**.
  - With a Cognito token: `tools/list` → the 3 prefixed tools; `tools/call deposit-laws___get_deposit_rules {"state":"WA"}` → "30 days after termination and vacation…" with the Washington guide link.
  - After the Runtime lock: a direct `invoke-agent-runtime` with the admin role → **AccessDeniedException**; the same NV question through the gateway still works.
- **Gotcha (zsh):** `"$A:runtime/…"` in zsh applies the `:r` modifier and silently drops text. Use `${A}`. The policy failed with "MalformedPolicyDocument … legacy parsing"; printing the rendered JSON found it.
- **Not yet:** gateway logs. Unlike Runtime, Gateway doesn't set up log delivery itself; that's part of step 7.
- **Doc pages:** [MCP server targets](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-MCPservers.html), [Outbound authorization types](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-building-adding-targets-authorization.html), [Inbound authorization](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-inbound-auth.html), [Runtime targets and enforcing traffic through the gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-http-runtime.html), [Restrict IAM inbound to your gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-oauth.html#runtime-restrict-iam-gateway).
- **Consulting note:** this is the "control layer" pattern in miniature: **identity at the front door** (customer IdP tokens), **least-privilege service identity** behind it, and a **resource policy that removes the side door**. Clients usually forget the third one.

## Step 5: connect real MCP clients to the Gateway (2026-11-09)

- **Token helper:** `deploy/agentcore/get-token.sh` prints a fresh Cognito access token (`--headers` prints `{"Authorization": "Bearer …"}`). It reads the client secret from `~/.config/agentcore-handson/cognito.env`, so no secret or token is ever pasted into a command, a config file or chat.
- **5a, MCP Inspector (passed):**
  - `npx -y @modelcontextprotocol/inspector@2.13.0 --cli <gateway>/mcp --transport http --header "Authorization: Bearer $(deploy/agentcore/get-token.sh)" --method tools/list` → the 3 prefixed tools.
  - `--method tools/call --tool-name deposit-laws___get_deposit_rules --tool-arg state=WA` → "30 days after termination and vacation, with specific statement and documentation", source the Washington guide (reviewed 2026-08-27, RCW 59.18.260–.280).
  - Without a token the Inspector didn't just fail: the gateway's 401 carries a `WWW-Authenticate` header pointing at OAuth protected-resource metadata, so the client tried to start a sign-in ("Interactive OAuth requires a TTY"). That's the MCP authorization spec at work: a standard client can discover where to log in.
- **5b, Claude Code as the client (set up; the check is Fei's, in a new session):**
  - Claude Code supports a **`headersHelper`** on HTTP MCP servers: a command run on every connection that prints a JSON object of headers. On a 401/403 it reruns the helper, reconnects and retries once, so a 60-minute token never has to be stored anywhere. ([Claude Code MCP docs](https://code.claude.com/docs/en/mcp.md), "Use dynamic headers for custom authentication".)
  - Config: `.mcp.json` in this repo (untracked, in `.git/info/exclude`): server `deposit-laws-gateway`, `type: http`, the gateway URL, `headersHelper: <repo>/deploy/agentcore/get-token.sh --headers`.
  - Project-scope servers need the folder's **trust dialog** and a **per-server approval** before they connect, and Claude Code strips credential-looking env vars from project helpers. The helper reads its secret from the 600-mode file, so it works there (tested with `env -i`).
  - The desktop app's bundled `claude` binary is a Linux build for its VM and won't run on macOS, so `claude mcp add` wasn't an option from this session; writing `.mcp.json` is the documented equivalent.
  - **Check:** open a new Claude Code session in this folder, accept the trust prompt and approve `deposit-laws-gateway`, then ask "What's the deposit return deadline in Washington?" Expected: 30 days, cited to propinspect.net/security-deposit-laws/washington, through the `deposit-laws___get_deposit_rules` tool.
- **Consulting note:** two ways for a client to give tools short-lived credentials: a **headers helper** (the client fetches a token each connection; simple, works with any IdP that has a token endpoint) or **MCP OAuth** (the client discovers the authorization server from the 401's `WWW-Authenticate` and signs the user in). Gateway supports both; machine clients usually take the first, human-facing apps the second.

## Step 6: an agent that uses the tools through the Gateway (2026-11-09)

- **Change from the brief: the model is Claude Sonnet 5.5 through the Anthropic API, not Bedrock.** The new project's Bedrock access was gated (Claude 5.5 "not available for this account", Anthropic use-case form pending, Nova quota 0), so Fei created a separate Anthropic API key for this project. The AgentCore parts (Gateway, Runtime, Policy, Observability) don't care which model calls them. Swapping to Bedrock later is one line in `agent/src/agent.ts` (Strands `BedrockModel`).
- **Built:** `agent/`, its own package (Strands 1.24 needs `@anthropic-ai/sdk` 0.109; the server repo's evals use 1.x).
  - `cognitoAuth.ts`: an MCP `AuthProvider` for the `StreamableHTTPClientTransport`. `token()` runs before every request (Cognito `client_credentials`, cached until a minute before expiry); `onUnauthorized()` drops the cache and the transport retries once. Unit tested, including that errors never echo the response body.
  - `agent.ts`: Strands `Agent` + `AnthropicModel` (`claude-sonnet-5-5`, `maxTokens` 1024) + `McpClient` on the gateway URL. System prompt: tool results only, call a tool for every state, cite link and review date as returned, "not covered" means stop, end with "not legal advice".
  - Secrets: `~/.config/agentcore-handson/anthropic.env`, `cognito.env`, `gateway.env`, all mode 600, read at start, never logged.
- **Check (passed 5/5, `npm run check`, answers in `agent/results/`):**

  | Question | Tool called | Time |
  |---|---|---|
  | Washington return deadline | `get_deposit_rules` | 6.0 s |
  | Nevada maximum deposit | `get_deposit_rules` | 5.4 s |
  | California vs Texas deadlines | `compare_states` | 6.4 s |
  | Which states are covered | `list_covered_states` | 6.3 s |
  | Washington DC (not covered) | `get_deposit_rules` → "isn't covered… I won't guess" | 5.4 s |

  The first run scored 4/5: the DC answer was right ("Washington DC isn't covered") but the check's regex wanted the exact words "not covered". I fixed the check, not the prompt. **Lesson: when an eval fails, read the answer before changing the agent.**
- **Grounding spot-check:** the WA answer mentioned "the old 21-day deadline (July 2023)" and "up to 2x". All of it is in the tool's own WA result, so the agent added nothing from memory.
- **Strands vs AgentCore Harness:**
  - **Strands (what we used):** open-source SDK; the agent loop runs in our code (here locally; on Runtime it would be our container or zip). Full control, any model provider (Anthropic API, Bedrock, OpenAI…), and it's testable like ordinary code.
  - **AgentCore Harness:** the same Strands loop, but declared as configuration (model, system prompt, tools, skills, memory) and run by AgentCore; no code or container, and switching model or tools is a config change, not a redeploy. Models: Bedrock, OpenAI, Gemini, or anything behind LiteLLM, with provider keys held in AgentCore Identity. Strands only.
  - **For clients:** start on Harness when the agent is "a prompt + tools + model" and the team wants managed ops; move to Strands-on-Runtime when they need custom control flow, a non-Strands framework, or code-level tests.
- **Cost:** about 25 model calls across the two check runs plus one ask, roughly $0.30 on the Anthropic key (estimate, not measured); AWS a fraction of a cent.
- **Doc pages:** [Strands: Anthropic provider](https://strandsagents.com/latest/documentation/docs/user-guide/concepts/model-providers/anthropic/), [Strands: MCP tools](https://strandsagents.com/latest/documentation/docs/user-guide/concepts/tools/mcp-tools/), and the Agent Toolkit `amazon-bedrock` skill (`references/agentcore-harness.md`).

## Step 7: observability (2026-11-09)

- **Three switches, all needed:**
  1. **CloudWatch Transaction Search** (account-level, once): a CloudWatch Logs resource policy letting `xray.amazonaws.com` write to `aws/spans`, then `aws xray update-trace-segment-destination --destination CloudWatchLogs`. It sat in `PENDING` for **about 6 minutes** before `ACTIVE`. Indexing set to 100% for the hands-on (default 1% is free; set back in `TEARDOWN.md`).
  2. **Vended logs and traces for Gateway and Runtime:** per resource, `put-delivery-source` (`APPLICATION_LOGS`, `TRACES`) → `put-delivery-destination` (a CloudWatch log group under `/aws/vendedlogs/bedrock-agentcore/…` with 7-day retention; `XRAY` for traces) → `create-delivery`. The `XRAY` deliveries are refused until Transaction Search is `ACTIVE`.
  3. **The agent's own spans** (it runs on the Mac): Strands TS emits OpenTelemetry spans; **ADOT for Node** (`@aws/aws-distro-opentelemetry-node-autoinstrumentation` 0.13.0) exports them to `https://xray.us-east-2.amazonaws.com/v1/traces`, signing with SigV4. `agent/scripts/traced.sh` exports the `agentcore` profile's short-lived credentials into that one process (`aws configure export-credentials --format env`), enables only HTTP auto-instrumentation, and `ask.ts` flushes spans before exiting (otherwise `process.exit` drops them).
- **Check (passed): one question = one trace** (`1-6af21420-1f54fdfd734e5f6185711fd2`), found with a Logs Insights query on `aws/spans`:

  ```
  invoke_agent Strands Agent ............................ 4.89 s   3,120 tokens in / 281 out
  ├─ execute_agent_loop_cycle #1 ........................ 2.96 s
  │  ├─ chat  (claude-sonnet-5-5, picks the tool) ....... 1.19 s   1,274 in / 60 out
  │  └─ execute_tool deposit-laws___get_deposit_rules ... 1.77 s
  │     └─ POST to the gateway (→ Runtime) .............. 1.72 s
  └─ execute_agent_loop_cycle #2 ........................ 1.92 s
     └─ chat  (writes the cited answer) ................. 1.91 s   1,846 in / 221 out
  ```
  The model's two calls take 3.1 s; the tool round trip through gateway and Runtime takes 1.7 s. Token counts come from the `gen_ai.usage.*` span attributes: the place to track cost per question.
  Query: `fields name, durationNano/1000000 as ms, attributes.gen_ai.usage.input_tokens | filter traceId like /<id>/`. In the console: CloudWatch → Application Signals → Transaction Search, or X-Ray → Traces.
- **Findings:**
  - **The "missing" Runtime log group (step 3) was IAM eventual consistency.** `/aws/bedrock-agentcore/runtimes/<id>-DEFAULT` was created at the version-2 redeploy, not at the first deploy, which ran seconds after its role was created. Lesson: wait or retry after creating a role before a service assumes it. It now shows the server's startup line; retention set to 7 days.
  - **The gateway refuses MCP 2026-07-28 inbound** (`"Unsupported protocol version: 2026-07-28"` in its logs); the agent's v2 client falls back to the 2025 handshake automatically. Target support for 2026-07-28 (docs) and inbound support are separate settings; `supportedVersions` was left at the default.
  - **Gateway and Runtime internal spans haven't appeared in `aws/spans` yet** (logs are flowing; X-Ray shows the gateway only as the remote service the agent called). Recheck during step 8.
  - `npm audit` on ADOT: 4 high and 13 moderate, all in its database auto-instrumentations (`db.user` attribute leaks). Not loaded here (`OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,undici`); don't `npm audit fix --force`.
- **Privacy note for clients:** agent spans carry prompts and answers (GenAI semantic conventions) and gateway logs carry request bodies. Fine for public law data; for real users, treat `aws/spans` and the vended log groups as user data (KMS, retention, access control).
- **Doc pages:** [Add observability to AgentCore resources](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-configure.html), the Agent Toolkit `amazon-bedrock` skill (`references/agentcore-memory-observability.md`).

## Step 8: AgentCore Policy, enforced at the gateway (2026-11-09)

- **Pieces:** a **policy engine** (`deposit_laws_policy`) holding **Cedar** policies, attached to the gateway with `policyEngineConfiguration {arn, mode}`. Every tool call is checked against the engine **outside the model and outside the agent's code**, before the target is called.
- **Semantics:** with an engine attached in ENFORCE mode, **everything is denied unless a policy permits it**, and **forbid always wins**. So "block one tool" really means "permit the others" (plus an explicit forbid if you want one).
- **Who is the principal:** with JWT inbound auth it's `AgentCore::OAuthUser`, its id the token's `sub`, and every claim a tag. A Cognito client-credentials token's `sub` is the client ID, so "for this agent" = `principal.getTag("client_id") == "<our client>"`. Actions are the prefixed tool names (`AgentCore::Action::"deposit-laws___compare_states"`); the resource must be the specific gateway ARN (wildcards are rejected).
- **IAM:** the gateway's role needs `GetPolicyEngine`, `AuthorizeAction` and `PartiallyAuthorizeActions`, the last two on both the engine and the gateway (`deploy/agentcore/gateway-policy-permissions.json`). Without them, attaching fails and every call is denied.
- **Automated reasoning caught a "bad" policy:** the forbid on `compare_states` was rejected as *"Overly Restrictive: Policy Engine will deny every request for … deposit-laws___compare_states"*. Correct: nothing permits that tool, so default-deny already blocks it. I recreated it with `--validation-mode IGNORE_ALL_FINDINGS` on purpose (defense in depth: it still wins if someone later adds a broad permit) and said so in its description. Lesson for clients: the analyzer is a useful reviewer; overriding it should be a recorded decision.
- **`update-gateway` replaces the whole configuration.** I rebuilt the request from `get-gateway` so the authorizer kept its `allowedScopes`; the doc example omits them, and copying it would have silently dropped the scope check.
- **LOG_ONLY, then ENFORCE (same token, same calls):**

  | | LOG_ONLY | ENFORCE |
  |---|---|---|
  | `tools/list` | 3 tools | **2 tools**: `compare_states` hidden (`PartiallyAuthorizeActions` filters the list) |
  | `compare_states` CA, TX | answered; logged `"decision": "DENY"` by `forbid_compare_states` | JSON-RPC error `-32002` "Tool Execution Denied: … policy enforcement [… forbid_compare_states …]" |
  | `get_deposit_rules` NV | answered; `ALLOW` by `permit_lookup_tools` (37 ms) | answered |

- **The agent adapted:** asked "Compare the deposit return deadlines in California and Texas" (which used `compare_states` in step 6), it now calls `get_deposit_rules` twice and still answers correctly with both citations (CA 21 days, TX 30 days). Because the gateway hides the tool, the model never tries it, so there's no error to recover from.
- **Where the denial shows:**
  - Gateway application log: `"Policy evaluation denied request"`, with `policy.decision`, `determiningPolicies`, and the principal (`AgentCore::OAuthUser` = our client ID).
  - Traces (`aws/spans`): span `AgentCore.Policy.AuthorizeAction` with `aws.agentcore.policy.authorization_decision = DENY`, `aws.agentcore.gateway.policy.mode = ENFORCE`, `determining_policies = [forbid_compare_states-…]`, 41 ms.
- **Step 7's open item, closed:** the gateway and Runtime spans did arrive, just late (65 gateway and 15 Runtime spans an hour on). The gateway's span names show the pipeline per tool call: `InboundAuth` → `Identity.Authorize` → `EvaluateRoutingRules` → `InvokeTool.<tool>` → `Policy.AuthorizeAction` → `TargetInvocation` → `AgentCore.Runtime.Invoke`; and for listing, `ListTools` → `Policy.PartiallyAuthorizeActions`.
- **Consulting note:** this is the answer to "how do we stop an agent doing X even if it's prompt-injected?": a deterministic rule at the gateway, keyed on the caller's identity and the tool's arguments, logged with the deciding policy. The model can't talk its way past it, and it doesn't even see tools it isn't allowed to use.
- **Doc pages:** [Policy in AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy.html), [Getting started](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-getting-started.html), [Core concepts](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-core-concepts.html), [Policy conditions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-conditions.html), [IAM permissions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-permissions.html), [Attach to an existing gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/update-gateway-with-policy.html).

## Step 9: AgentCore Evaluations, compared side by side (2026-11-09)

- **What it is:** a scoring service. You give it a session's spans (from CloudWatch) and an evaluator ID; it returns a label, a score and an explanation per session, trace or tool call. **On-demand** = you call `Evaluate` on chosen sessions (test sets, regressions); **online** = it samples live traffic continuously. Here: on-demand only.
- **Evaluator types (all called the same way, so you can swap them by ID):**
  - **Built-in** (`Builtin.*`): AWS's judge prompts **on AWS's own model capacity**. Model cost is in the price, and **they worked on this project even though Bedrock model access is gated** (I had assumed otherwise).
  - **Managed third-party** (`ThirdParty.DeepEval.*`, `ThirdParty.AutoEval.*`): same idea, open-source metrics, AWS runs the model.
  - **Custom LLM judge / derived** (your prompt, or a built-in's prompt, on **your own Bedrock model**): **refused at creation** here: *"Bedrock model '…claude-haiku-4-5…' is not available in region us-east-2"*, even with the model ID from AWS's own example. The gate shows up when you create the evaluator, not when it runs. Also: the CLI requires `--level` for derived evaluators although the docs say it's inherited.
  - **Why custom Bedrock judges failed:** not the Anthropic use-case form. Every Bedrock model (Nova, Llama, gpt-oss, Claude) answers even a 5-token request with *"Too many tokens per day"*: this new project's **tokens-per-day quotas are 0 and marked not adjustable** in Service Quotas (Paid plan). Raising them takes an AWS Support case. **Client lesson: a new AWS account may be unable to call any Bedrock model; request quota weeks ahead.**
  - **Code-based** (`CustomCode`): **your own Lambda**; gets the spans + ground truth, returns PASS/FAIL. No LLM unless you call one yourself, so any model or vendor can be the judge.
- **Telemetry gotchas (both cost me time; both would bite a client):**
  - **Spans need `session.id`.** The Runtime injects it for hosted agents; an agent hosted elsewhere must set it. Strands TS: `new Agent({ traceAttributes: { "session.id": id } })`.
  - **The scope name decides whether AWS can read the spans.** Strands TS names its tracer after `OTEL_SERVICE_NAME`, so setting that (as step 7 did) renamed the scope from `strands-agents` to `deposit-laws-agent`, and `Evaluate` rejected everything: *"Provided input has no spans with supported scope."* Fix: set the service name through `OTEL_RESOURCE_ATTRIBUTES=service.name=…` instead (`agent/scripts/traced.sh`).
- **Ground truth:** `evaluationReferenceInputs` carries `expectedResponse` (per trace, used by `Builtin.Correctness`), `assertions` (per session, `Builtin.GoalSuccessRate`) and `expectedTrajectory` (tool names, the `Builtin.Trajectory*` evaluators, programmatic, 0 tokens). One payload serves all evaluators; unused fields come back in `ignoredReferenceInputFields`. Ours lives in `agent/src/cases.ts`, shared with the step 6 regex check.
- **The setup:** `npm run eval -- <evaluator IDs…>` (`agent/src/evaluate.ts`) pulls the newest check run's sessions from `aws/spans` and scores them with whichever evaluators you name. Every run adds a **negative control**: a copy of the Washington session whose answer is rewritten to "21 days" (the pre-2023 law) with no citation or disclaimer, while the tool result in the same trace still says 30.
- **Result (5 real sessions + the control):**

  | | Correctness | GoalSuccessRate | Helpfulness | TrajectoryAnyOrder | Code-based hard rules |
  |---|---|---|---|---|---|
  | 5 real answers | all Correct | all Yes | 0.83–1.0 | all Yes | all PASS |
  | **Tampered control** | **Incorrect** | **No** | **Not Helpful At All** | Yes | **FAIL** |
  | Tokens / 6 evals | 3.9K in, 0.7K out | 6.0K in, 0.6K out | 8.9K in, 1.1K out | 0 | 0 |
  | Cost / 6 evals | $0.018 | $0.022 | $0.035 | $0 | ~$0 Lambda (custom fee: see below) |
  | Explains why | yes, cites 21 vs 30 | yes, per assertion | yes | lists tools | lists failed rules |

  - **The trajectory check passed the bad answer, correctly:** it measures *process* (right tool called), not the answer. Each evaluator measures one thing; that's why you combine them.
  - GoalSuccessRate noticed the answer contradicted the tool result in the same trace. That's the judge reading the whole trace, not just the reply.
- **Option C: Claude as the judge with our own Anthropic key** (`agent/evaluators/claude-judge/`): a code-based Lambda that sends Claude the question, tool results, answer and ground truth and gets back a structured verdict (`messages.parse` + a zod schema). The key lives in Secrets Manager (the owner put it there; the judge's role can read only that secret); the hard-rules Lambda has its own role with no secret access.

  | | Claude Haiku 5.5 judge | Claude Opus 5.5 judge |
  |---|---|---|
  | 5 real answers / tampered control | all PASS / **FAIL** | all PASS / **FAIL** |
  | Anthropic cost for 6 judgments | **$0.0013** | $0.0495 (~38x) |
  | Reasons | specific, correct | specific, correct; also noted the 21-day rule was replaced in July 2023 |

  On this test set Haiku matches Opus at about 1/38 the model cost; the AgentCore fee (if it applies to code-based evaluators) then dominates. **A bigger test set with subtler mistakes is what would separate them.**
- **Gotcha: the Lambda payload doesn't say which evaluator called it.** The docs list `evaluatorId` and `evaluatorName`; the real payload had only `schemaVersion`, `evaluationLevel`, `evaluationInput`, `evaluationTarget`. My first version picked the model from the evaluator name and **silently defaulted to Opus**, so the "Haiku" judge ran Opus. The price tag the judge appends to every explanation (`[model: N in / M out]`) gave it away. Fix: one function per judge model (`JUDGE_MODEL` env), and a missing model is an error, never a default. **Client lesson: put the model and token usage in every judge result, and make silent fallbacks loud.**
- **Costs (pricing page, 2026-11-09):** built-in $0.0024/1K input + $0.012/1K output tokens, model included (about **0.3–0.6 cents per evaluation** here). Custom evaluators $1.50 per 1,000 evaluations plus your own model; the page doesn't say whether that fee applies to code-based ones (my script assumes it does, so its code-based cost is an upper bound). This whole step, including re-running the agent and option C, came to roughly **50 cents**.
- **Permissions:** on-demand `Evaluate` called the code-based Lambda **with my own credentials**; the function has no resource policy. Online evaluation would need an execution role with `lambda:InvokeFunction`.
- **Consulting note: the recommendation I'd give a client:**
  1. **Code checks for hard rules** (citation present, right number, refuses what it should): free, instant, never "nice but wrong". Keep them in the CI test suite too.
  2. **Built-in LLM judges for judgment calls** (correct vs ground truth, assertions, helpfulness): cheap, no model access paperwork, decent explanations.
  3. **Always include a known-bad case.** An evaluator that never fails hasn't been tested.
  4. Custom Bedrock judges only when the built-ins don't fit, and **plan the model-access approval first**. To use a non-Bedrock model (e.g. the client's own Anthropic or OpenAI key), call it from a code-based Lambda (option C, tested): it also sidesteps a project with no Bedrock quota.
  5. **Try the cheapest judge model first**, and keep a bigger one only where a test set shows it catches more.
- **Doc pages:** [Evaluations](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/evaluations.html), [Telemetry setup](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/supported-frameworks-telemetry.html), [Strands spans](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/supported-frameworks-strands.html), [On-demand getting started](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/getting-started-on-demand.html), [Ground truth](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/ground-truth-evaluations.html), [Code-based evaluators](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/code-based-evaluators.html), [Third-party and derived](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/third-party-evaluators.html), [Pricing](https://aws.amazon.com/bedrock/agentcore/pricing/).

## Step 10: takeaways for clients (2026-11-09)

What one day of hands-on (with an AI assistant) taught me, written for the client conversation.

**What AgentCore is, in control-layer terms**

| Piece | What it does | Enterprise control it maps to |
|---|---|---|
| Runtime | Hosts an agent or MCP server (zip or container), IAM-signed calls only, per-session isolation | Hosting + network boundary |
| Gateway | One MCP endpoint in front of many tools; inbound sign-in (JWT), outbound credentials (IAM, API keys, OAuth) | Identity + tool catalog |
| Policy | Cedar rules checked on every tool call, outside the model; default deny; can hide tools from the list | Authorization, deterministic |
| Observability | OpenTelemetry into CloudWatch (Transaction Search); agent, gateway and runtime spans in one trace | Audit + troubleshooting |
| Evaluations | Built-in LLM judges on AWS's capacity, plus your own code (Lambda) judges, on-demand or on live traffic | Quality assurance |

**Good fit**
- A team already on AWS that has (or will have) several tools/APIs and several agents, and needs identity, per-tool permissions and an audit trail around them.
- Regulated or risk-averse settings: "the agent can't do X even if it is prompt-injected" is a Cedar rule at the gateway, logged with the deciding policy (step 8).
- Model-agnostic shops: we ran Claude through the Anthropic API, not Bedrock, and nothing in AgentCore cared.

**Not worth it**
- One agent, a couple of tools, one team: a plain MCP server with an API key, plus OpenTelemetry to whatever they already use, is far less setup.
- Teams not on AWS: the value is the integration with IAM, CloudWatch and Cognito.

**What was hard (rank order)**
1. **Account readiness, not AgentCore.** A brand-new project had **0 tokens/day on every Bedrock model** (not adjustable; Support case), a fixed region, and managed SCPs that deny some APIs (the tagging API in us-east-1). Ask for Bedrock quota weeks ahead.
2. **Observability plumbing.** Transaction Search, vended log/trace deliveries per resource, ADOT setup for an agent outside the Runtime, spans that arrived an hour late, and two silent gotchas that block Evaluations (`session.id`, the Strands scope name).
3. **Docs vs reality.** `update-gateway` replaces the whole configuration; the Gateway refused MCP 2026-07-28 inbound; derived evaluators need `--level` in the CLI; the evaluator Lambda payload doesn't name the evaluator. Verify each step against the live API, not the docs.
4. **IAM eventual consistency:** create roles, wait ~15 s, then the resource that uses them.

**Rough cost**
- AWS: the budget showed **$0.00 actual** at the end of the day (credits; billing data lags ~1 day). The first billing data (spend-limit email, same evening): **$0.31**, mostly built-in Evaluations ($0.13 input + $0.09 output tokens, matching the ~22 cents estimated in step 9) and **Cognito machine-to-machine token requests ($0.07)**, which are billed per token request. That's why the agent caches its token. The email "forecast" of $120/month was the day's burst extrapolated, after everything had been torn down: read a forecast with what is still running in mind. Everything here is usage-based (Runtime per active second, Gateway/Policy/Evaluations per call); idle cost was only the Secrets Manager secret (~$0.40/month) and log storage.
- Model and judges: the Anthropic API for the agent's test runs (cents per run) and the Claude judges (Haiku $0.0013 vs Opus $0.05 per 6 judgments); built-in evaluators 0.3–0.6 cents per judgment. Under a few dollars in all; confirm in the Anthropic Console.
- The real cost is **setup time**: a day for this with an AI pair, much of it on account readiness and observability.

**Lock-in**
- **Portable:** the MCP server (same code on stdio, HTTP, or any host), the Strands agent (open source, any model), OpenTelemetry traces, the evaluator logic (plain functions) and the test cases with ground truth.
- **AWS-specific:** Gateway and Runtime configuration, Cognito, IAM roles, the policy engine (Cedar is an open language, but the entity model here is AgentCore's), the Evaluations API and Transaction Search.
- **Exit path:** swap the Gateway for any MCP gateway plus an OAuth server, re-express the Cedar rules in that gateway's policy layer, keep the evaluators as local tests (we already have `check.ts`). Moderate effort, no data trapped.

**Questions to ask a client first**
1. Are you on AWS, and is Bedrock quota already approved for the models you want?
2. How many agents and tools, owned by how many teams? (One and few = skip AgentCore.)
3. What must an agent never do, and who must be able to prove it didn't? (That's Policy plus Observability.)
4. How will you know the agent is right? A test set with ground truth and known-bad cases comes before any evaluator choice.

**Reusable from this repo:** `deploy/agentcore/` (role and policy templates, deploy script, Cedar examples, token script), `agent/src/evaluate.ts` (switchable evaluators with a negative control), and this log.

## Teardown (2026-11-09)

Ran `TEARDOWN.md` with the owner's go: evaluators, Lambdas and roles; deliveries and vended log groups (Transaction Search indexing back to 1%); gateway target and gateway, **then** the policy engine and its policies (worked in that order); gateway role; Cognito domain and pool; the local `cognito.env`; Runtime, code bucket, Runtime role and log group. Check afterwards: no AgentCore resources, Lambdas, `agentcore-*` roles or Cognito pools left. The Anthropic key secret is in its 7-day recovery window (gone 2026-11-16); the owner revokes the key in the Anthropic Console. Kept: the $20 budget (free) and `aws/spans` (7-day retention). The tagging API kept listing the deleted Cognito pool for a while: confirm deletions with the service's own describe call, not the tag index.
