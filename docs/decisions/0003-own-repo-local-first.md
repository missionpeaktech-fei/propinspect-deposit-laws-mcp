# 0003. Its own repository; local first, public later

- **Status:** accepted
- **Date:** 2026-11-01

## Context

The server may later be published for others to use. Publishing needs a public repository, and it cannot live inside the private app repository.

## Decision

- **Its own repository.** Private while building; public once it's ready. Commits use a GitHub noreply address.
- **Local first.** It runs over stdio on the user's machine, with no hosting.
- **Remote hosting only if it's opened up.** For published legal data, a remote server avoids stale copies on users' machines. The likely host is Cloudflare Workers: free up to 100,000 requests a day, then $5 a month.
- **Licenses decided at publish time.** The code and the data get separate licenses.

## Consequences

- Publishing costs $0 in fees: public repos, Actions on public repos, npm public packages and the MCP Registry are free. The real costs are maintenance (about 1–2 hours a month) and responsibility for accuracy.
