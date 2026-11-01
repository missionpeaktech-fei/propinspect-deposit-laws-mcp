# 0004. Use the v2 TypeScript SDK (`@modelcontextprotocol/server`)

- **Status:** accepted
- **Date:** 2026-11-01

## Context

Two official TypeScript SDK lines were available on 2026-11-01:

- `@modelcontextprotocol/sdk` 1.32.2: v1, one large package (Express, Hono, ajv and more as dependencies).
- `@modelcontextprotocol/server` 2.4.0: v2, the stable line. It has one runtime dependency (zod).

The v2 package ships the 2026-07-28 spec's types (`server/discover`, the deprecation notices). Its `LATEST_PROTOCOL_VERSION` is still `2025-11-25`, the newest version it agrees on with clients. Both packages list the same supported versions.

## Decision

Use `@modelcontextprotocol/server` 2.4.0 with zod 4. Pin exact versions.

## Consequences

- Fewer dependencies is a smaller attack surface for a server others may install.
- Check the SDK changelog before each upgrade. The spec and the SDKs move separately: the SDK can lag the spec, and clients can lag the SDK.
