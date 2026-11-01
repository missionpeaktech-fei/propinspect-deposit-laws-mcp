# 0001. Expose the data as a read-only MCP server

- **Status:** accepted
- **Date:** 2026-11-01

## Context

PropInspect publishes reviewed security-deposit law guides for all 50 US states. AI assistants are asked these questions and often answer from memory, without sources. We want assistants to get exact facts, with citations, and an explicit "not covered" instead of guesses.

The project is also a reference build for learning and teaching MCP.

## Options

| Option | Pros | Cons |
|---|---|---|
| Better public content only | No build; widest reach | No guarantees; no structured answers |
| REST API | Any program can call it; mature tooling | Glue code per AI app; needs hosting from day one |
| Agent Skill | Cheapest to build | Rules are requests, not guarantees; needs an agent with a file system |
| **MCP server** | Self-describing to models; one server for many AI apps; rules enforced in code; runs locally with no hosting | Reach limited to MCP clients; spec still changing |

## Decision

A read-only MCP server.

The data is static, public and read-only, so there is no auth or write risk. Two requirements push past a Skill:
- A state code must match one of the 50 loaded guides, or the answer is "not covered".
- Every answer carries the guide URL, review date, statute and disclaimer.

## Consequences

- Someone has to install or connect the server. Public guide pages remain the main discovery channel.
- MCP stays at the edge (data → core → MCP → transport), so adding a REST endpoint later reuses the core.
