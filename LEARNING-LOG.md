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
