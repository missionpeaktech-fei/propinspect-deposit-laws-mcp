# 0002. One source of truth, exported to a facts-only snapshot

- **Status:** accepted
- **Date:** 2026-11-01

## Context

The guide data lives in the PropInspect app as one typed TypeScript file. This server needs the same facts. A second, hand-maintained copy would drift.

## Options

| Option | Pros | Cons |
|---|---|---|
| Two independent sources | — | Drift; someone eventually reads the wrong one |
| Import the app's file directly | Always in sync | Couples this project to the app's repo, build and releases; impossible once this repo is public and the app is private |
| **Source + export pipeline → snapshot** | Independent; a versioned, testable contract; no network | Someone must re-export; a forgotten export means stale data |
| Fetch from the website at runtime | Always fresh | Network dependency; needs a new public endpoint on the app |

## Decision

Source + export pipeline → snapshot, with these rules:

1. **Generated, never edited by hand.** `npm run export-data` reads the source **from a git commit**, not the working copy, and records that commit in the snapshot.
2. **One contract, checked on both sides.** The export validates against `src/data/schema.ts` before writing. The server validates again at startup and refuses to start unless the snapshot has exactly the 50 covered states (src/data/coverage.ts).
3. **Drift is detectable.** `npm run check-data` exits 1 and lists the states that differ from the source.
4. **One format per field.** The source writes review dates two ways ("2026-09-18" and "September 18, 2026"). The snapshot stores ISO dates only, and the schema rejects anything else. The disclaimer uses the website's footer template, with "this guide" instead of "this page", since an answer cites the guide.
5. **Facts only.** Caps, deadlines, penalties, move-in record rules, summary, statute, references, FAQs, guide URL and disclaimer. The long-form guide text stays on propinspect.net, and answers link there.

## Consequences

- **A named shortcut.** The export reads the app's internal file. In a company, the data owner would publish a versioned artifact instead, and consumers would pin versions and get update PRs.
- **Freshness is a process.** Re-export when a guide changes. Every answer shows the guide's review date.
