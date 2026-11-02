# propinspect-deposit-laws-mcp

A read-only [MCP](https://modelcontextprotocol.io) server that gives AI assistants exact, cited security-deposit law facts for all 50 US states. The facts come from [PropInspect's reviewed state guides](https://propinspect.net/security-deposit-laws).

**Status:** source available; runs locally over stdio from a clone. Not on npm and not hosted yet: a local copy of legal data can go stale, so a hosted version is the planned way to use it ([ADR 0003](docs/decisions/0003-own-repo-local-first.md)).

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

## Evals (with a real model)

Two suites run Claude against the real server (over stdio, its tools behind tool search, web search available) and grade the results. They call the Anthropic API, so they cost money and don't run in CI.

| Suite | Cases | Pass bar | Checks |
|---|---|---|---|
| **User:** `evals/cases.json` | 22 questions (mostly paraphrased real renter and landlord threads) | A rate tracked over time | Our tool used when it should be (and not for off-topic questions), right state codes, key facts, guide link |
| **Security:** `evals/security-cases.json` | 16 attacks, labeled with OWASP LLM 2025, OWASP Agentic 2026 and MITRE ATLAS terms | **Every case must pass** | Did not endorse the planted claim (a Claude Sonnet 5.5 judge), no attacker link output, no personal data in tool arguments, bounded tool calls; "helpful under attack" is reported separately |

```bash
# key: ANTHROPIC_API_KEY, or EVAL_ENV_FILE=<a .env file with it> (only that line is read)
npm run eval                 # user suite      → .claude/hillclimb/deposit-law/
npm run eval:security        # security suite  → .claude/hillclimb/deposit-law-security/
```

- **Review the cases first.** `node evals/write-review.mjs <cases file>` writes a readable `.md` next to it.
- **Approval gate.** The runner refuses to start when it or its case file has changed since a person last approved it. Approve with `-- --approve-harness`.
- **Variants.** `-- --variant v1` writes a new variant directory, compared side by side in the report. `EVAL_SERVER_INSTRUCTIONS=name|off` changes what the app tells the model (see `.claude/hillclimb/deposit-law/v*/change.md`).
- **Re-grade after a grader fix,** without running the model again:

  ```bash
  node evals/regrade.mjs <flow dir>
  ```
- **Cost** (measured 2026-11-01): about $0.12 per user case and $0.20 per security case. The "compare every pair of states" attack alone costs about $1.50.

Results (`results.jsonl`) are committed. Transcripts and reports stay local.

## License

- **Code, docs and evals:** [MIT](LICENSE).
- **Deposit-law data** (`data/`): [CC BY 4.0](data/LICENSE.md). Reuse it freely, including commercially, but credit PropInspect and link to the state guide each fact comes from. See [ADR 0006](docs/decisions/0006-licenses.md).

---

The guide content is general information, not legal advice.
