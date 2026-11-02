# 0006. Licenses: MIT for the code, CC BY 4.0 for the data

- **Status:** accepted
- **Date:** 2026-11-01

## Context

The repository is going public (ADR 0003). The code and the data need separate licenses: the data is the reviewed content behind PropInspect's state guides, so how others may reuse it is a business choice, not just a technical one.

## Options

| Option | Pros | Cons |
|---|---|---|
| **A. Data under CC BY 4.0** | Anyone can reuse it, including commercially, but must credit PropInspect; every state already carries its guide link, so credit is a link back | Others can build on it without asking |
| **B. Data all rights reserved, usable through the server only** | Keeps control | Discourages the reuse that would cite us; hard to enforce on a public repo |

## Decision

- **Code, docs and evals:** MIT (`LICENSE`), © MissionPeak Tech.
- **Data** (`data/`): CC BY 4.0 (`data/LICENSE.md`). Credit means naming PropInspect and linking to the state guide each fact comes from, with its review date.
- **Not on npm.** `package.json` stays `"private": true` so the package can't be published by accident. Distribution is the repo now, and a hosted server later (ADR 0003).
- The snapshot's format doesn't change: the license lives next to the file, not inside it, so the data contract and its schema version stay as they are.

## Consequences

- Reuse that follows the license links back to the guides.
- The "not legal advice" notice and the review dates travel with the data in `data/LICENSE.md` as well as in every tool answer.
- Changing the data license later only applies to new copies; anything already copied keeps CC BY 4.0. Treat this as permanent.
