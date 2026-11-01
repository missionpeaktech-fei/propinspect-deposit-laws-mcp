# Threat model

- **Scope:** this read-only MCP server.
- **Last updated:** 2026-11-01.
- **Method:** list every trust boundary, meaning every place data arrives from something we don't control, and decide what is checked there.

## What we protect

1. **Correct legal facts.** A wrong deadline or cap is the main harm: users act on it.
2. **The user's AI session.** Our answers enter the model's context, so they must not steer it.
3. **The user's machine.** The server runs locally with the user's permissions.

## What we deliberately don't have

There's no write access, network access, file access beyond our own snapshot, secrets, user data or sign-in. Least privilege is the main defense: there is nothing to steal and nothing to misuse.

## Trust boundaries

| # | Boundary | Who controls the input | Risk | Defense | Tested in |
|---|---|---|---|---|---|
| 1 | App content → export | People editing legal content | Bad or malformed facts | Shared contract (`src/data/schema.ts`); anti-corruption layer in `scripts/export-data.ts`; drift check | `test/load.test.ts` |
| 2 | Snapshot file → server start | Anyone who can edit the file | Partial or wrong data served as truth | Validate at startup and refuse to start (exactly the covered states) | `test/load.test.ts` |
| 3 | **Model → tool arguments** | **The model, which prompt injection can steer** (pasted documents, web pages, other tools) | Injected text in arguments; probing; oversized input | Strict input schema (`^[A-Za-z]{2}$`, 2–6 states); input only ever used as a map key; never a path, URL, regex or query | `test/core.test.ts`, `test/mcp.e2e.test.ts` |
| 4 | **Our results → the model** | Us (reviewed content) | Results carrying instructions; echoing attacker text back | Results hold only our data and wording; caller input is never echoed (gaps are reported by position) | `test/core.test.ts`, `test/mcp.e2e.test.ts` |
| 5 | **User-pasted text in the prompt → the model** | A third party (the landlord who wrote the letter) | Instructions hidden in the letter; closing the fence early | The letter is fenced as data, the rule comes before it, and fake `<letter>` tags are neutralized | `test/mcp.e2e.test.ts` |
| 6 | Tool descriptions → the model | Us | Tool poisoning; a silent change after users approved the tools ("rug pull") | The contract is generated and committed (`docs/CONTRACT.md`), and CI fails on any unreviewed change | `npm run contract:check` in CI |
| 7 | npm packages → our code | Package authors | Supply-chain compromise | 2 runtime dependencies (MCP SDK, zod), exact versions, lockfile, `npm ci` | CI |
| 8 | Internet → remote server *(phase 2, not built)* | Anyone | Abuse, cost | Rate and size limits, stateless, read-only | — |

## Known limits

- **We can't control the model's final answer.** A steered model could still misstate a correct tool result. Model-in-the-loop evals and a red-team pass check this.
- **The stdio server trusts the AI app that launched it.** That's normal for local servers.

## Next security steps

- Model-in-the-loop evals with injection attempts (in the question, in a pasted document, in arguments). The final answer must match the snapshot.
- Automated red team (promptfoo) and an MCP scanner before any public release.
- Rebuild this table for the future authenticated inspection server. User data and writes change most rows.
