# 0007. AgentCore hands-on: a signed-in deployment for learning; public hosting postponed

- **Status:** accepted
- **Date:** 2026-11-09

## Context

The owner needs hands-on AWS Bedrock AgentCore experience for AI consulting work: identity, policy enforced outside the model, traces and evaluations, the "control layer" enterprise clients ask about. This server is a good subject: it's small, read-only and public data.

ADR 0003 planned public, anonymous hosting on Cloudflare Workers (`mcp.propinspect.net`, MCP Registry, blog post 6). That serves a different goal (publishing the free server), so it is not the place to learn AgentCore.

Checked in the AWS docs on 2026-11-09: AgentCore Runtime hosts MCP servers over streamable HTTP and deploys Node.js code directly (no container); Runtime and Gateway both support MCP protocol version 2026-07-28. Gateway inbound auth can be JWT, IAM, or none; AWS advises "no authorization" only for public gateways with your own throttling.

## Options

| Option | Pros | Cons |
|---|---|---|
| **A. AgentCore now, Cloudflare later** | Learns what clients will buy; the HTTP transport serves both hosts | Two hosting stories to keep apart |
| **B. Cloudflare only (ADR 0003 as planned)** | Free, hard request cap, no surprise bill | Teaches little that enterprise clients use |
| **C. Both now** | Direct comparison | Twice the setup during a busy month |

## Decision

- **Option A.** Deploy on AgentCore Runtime behind AgentCore Gateway with **sign-in required** (JWT). No anonymous access in this project.
- Work on the `agentcore-handson` branch. The streamable HTTP transport is built once, next to stdio, over the same tool core; it merges to `main` when public hosting is decided.
- The hosted copy runs with the call log off; AgentCore's own traces replace it. What they record (user questions in CloudWatch) goes into `docs/threat-model.md`.
- Cost guardrails: an AWS Budgets alert before anything is created, every resource tagged `project=agentcore-handson`, and a documented teardown (`TEARDOWN.md`).
- **ADR 0003's public hosting is postponed, not cancelled.** Decide at blog post 6 between Cloudflare as planned, AgentCore with no sign-in plus throttling, or no public hosting.

## Consequences

- The repository gains an HTTP entry point and deployment config; stdio stays the default for local use.
- AWS has no hard spending cap, so the Budgets alert and teardown are the guardrails.
- Learning notes go in `LEARNING-LOG.md`, one section per step, with the doc pages used; they can feed a blog post.
