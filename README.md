# propinspect-deposit-laws-mcp

A read-only [MCP](https://modelcontextprotocol.io) server that gives AI assistants exact, cited security-deposit law facts for all 50 US states. The facts come from [PropInspect's reviewed state guides](https://propinspect.net/security-deposit-laws).

**Status:** in development; not published. Works locally over stdio.

## What it offers

The full contract (tools, inputs, outputs, resources and prompts, exactly as a model sees them) is in **[docs/CONTRACT.md](docs/CONTRACT.md)**. In short:

- **`get_deposit_rules`**: one state's cap, return deadline, penalty and move-in record rule, with the guide link, review date, statute and disclaimer.
- **`compare_states`**: 2–6 states side by side.
- **`list_covered_states`**: every covered state with its guide link and review date.
- **Resource** `deposit-law://state/{code}`: one state as JSON.
- **Prompt** `check_deduction_letter`: check a deposit deduction letter against a state's rules.

## Try it

```bash
npm ci
npm run inspect      # opens the MCP Inspector in your browser to call the tools by hand
```

To use it in Claude Desktop, **quit Claude Desktop (⌘Q)**, run the following, then reopen it:

```bash
node scripts/claude-desktop-config.mjs
```

It adds this server to `claude_desktop_config.json` with full paths and the opt-in call log on, keeps every other setting, and writes a backup. Use `--no-log` to skip the log, or `--remove` to undo. (Claude Desktop rewrites that file while it's running, so edit it only while the app is closed.)

In Claude Code:

```bash
claude mcp add propinspect-deposit-laws -- npx tsx /path/to/propinspect-deposit-laws-mcp/src/index.ts
```

## How it's built

| Layer | Where | What it does |
|---|---|---|
| Data | `data/deposit-laws.json`, `src/data/` | A facts-only snapshot exported from the PropInspect app, validated at startup (schema + exactly the covered states) |
| Core | `src/core/` | Plain functions: look up, compare, list. No MCP, no I/O. Every answer carries its citation. |
| MCP | `src/mcp/server.ts` | Tools, a resource and a prompt that describe the core to a model; input shape checked here |
| Transport | `src/index.ts` | stdio (logs to stderr only); Streamable HTTP later |

Design decisions: [docs/decisions/](docs/decisions/). Security: [docs/threat-model.md](docs/threat-model.md). Improving from real use: [docs/feedback-loop.md](docs/feedback-loop.md).

## Development

```bash
npm test              # unit, contract and protocol end-to-end tests
npm run typecheck
npm run contract      # regenerate docs/CONTRACT.md after changing a tool (CI checks it)
npm run export-data   # rebuild the snapshot from the PropInspect app (needs access to it)
npm run check-data    # exit 1 if the snapshot has drifted from the app
npm run signals       # summarize the opt-in call log into suggested actions
```

Requires Node.js 20 or newer.

---

The guide content is general information, not legal advice.
