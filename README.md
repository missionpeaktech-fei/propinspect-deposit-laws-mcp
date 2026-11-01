# propinspect-deposit-laws-mcp

A read-only [MCP](https://modelcontextprotocol.io) server that gives AI assistants exact, cited security-deposit law facts for all 50 US states, taken from [PropInspect's reviewed state guides](https://propinspect.net/security-deposit-laws).

**Status:** in development; not published. Data layer done; MCP tools come next.

## How it's built

| Layer | Where | What it does |
|---|---|---|
| Data | `data/deposit-laws.json`, `src/data/` | A facts-only snapshot exported from the PropInspect app, validated at startup (schema + exactly the 50 states) |
| Core | `src/core/` *(next)* | Plain functions: look up, compare, list. No MCP. |
| MCP | `src/mcp/` *(next)* | Tools, resources and a prompt that describe the core to a model |
| Transport | `src/index.ts` *(next)* | stdio first; Streamable HTTP later |

Design decisions are recorded in [`docs/decisions/`](docs/decisions/).

## Data pipeline

The PropInspect app is the single source of truth. This project holds a generated copy that nobody edits by hand.

```bash
npm run export-data   # rebuild data/deposit-laws.json from the app's origin/main
npm run check-data    # exit 1 if the snapshot has drifted from the source
npm test              # loader contract tests
```

The snapshot records the source commit it was built from. Every state carries its guide URL, review date, statute and disclaimer.

## Requirements

Node.js 20 or newer.

---

The guide content is general information, not legal advice.
