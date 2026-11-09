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
