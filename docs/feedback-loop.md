# Feedback loop

The goal isn't logs. It's a loop that makes both this server and PropInspect's guides better from real use:

```
  capture ──► review ──► act ──► verify ──┐
     ▲                                   │
     └───────────────────────────────────┘
```

## 1. Capture: four signal sources

| Source | What it shows | Where |
|---|---|---|
| **Call log** (opt-in) | Which tool, which state codes, found / not covered, FAQs requested, comparisons, speed | `DEPOSIT_LAWS_CALL_LOG` → one JSON line per call |
| **AI app's MCP log** | Raw tool traffic, including inputs our schema rejected (model mistakes, injection attempts) | Claude Desktop: `~/Library/Logs/Claude/mcp-server-propinspect-deposit-laws.log` |
| **Evals** *(next)* | Whether the model picked the right tool and gave the right answer | The eval harness's results |
| **Test notes** | What surprised a human tester: wording, tone, missing information | Your notes from real chats |

The server never sees the user's question or the model's answer, only tool arguments. That's by design (no free-text inputs), so answer quality comes from evals and test notes.

To turn the call log on in Claude Desktop, add `env` to the server's entry:

```json
"env": { "DEPOSIT_LAWS_CALL_LOG": "/path/to/propinspect-deposit-laws-mcp/logs/calls.jsonl" }
```

## 2. Review

```bash
npm run signals
```

This prints the top states, not-covered demand, the FAQ rate, comparisons, errors and speed, then **suggested actions**. Run it after each test session, and weekly once others use the server.

## 3. Act: where each signal goes

| Signal | Action | Where the change happens |
|---|---|---|
| A real place not covered (e.g. DC asked often) | Write a new guide | PropInspect app → export → widen the coverage list (a product decision) |
| A wrong code sent (e.g. "ZZ") | Clarify the tool description; add an eval case | `src/mcp/server.ts`, then `npm run contract` |
| FAQs often needed for a state | Review that guide's FAQs for gaps | PropInspect guide content |
| Many multi-state comparisons | Note for positioning (landlords with several states) | Roadmap / marketing notes |
| The most-asked states | Keep those guides freshest; review them first | PropInspect review schedule |
| Wrong final answers (evals) | Fix the description, the result wording or the data | Server or guide, then a new eval case |

## 4. Verify

Every fix ends in a check that keeps it fixed: an eval case, a contract diff that was reviewed, or a test. The next review shows whether the signal went away.

## Privacy rules

- **Log only** codes, booleans, our own status words and timings. Never the deduction letter, never rejected input, never anything typed by a person. Tests enforce this (`test/feedback.test.ts`).
- **Local and opt-in:** installs by other people collect nothing, because the server has no network access.
- **A hosted version** would log the same fields server-side, with short retention and a privacy note in the README.
