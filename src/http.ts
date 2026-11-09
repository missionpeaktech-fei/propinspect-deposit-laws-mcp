#!/usr/bin/env node
/**
 * Entry point: streamable HTTP transport, for hosts such as AgentCore Runtime
 * (ADR 0007). Same tool core and MCP layer as the stdio entry (index.ts); only
 * the transport differs.
 *
 * Routes:   POST /mcp   the MCP endpoint (2026-07-28, plus 2025-era clients statelessly)
 *           GET  /ping  health check AgentCore Runtime calls
 *
 * Env:      PORT  default 8000 (what AgentCore Runtime expects)
 *           HOST  default 127.0.0.1. Set 0.0.0.0 only inside a host that puts
 *                 sign-in in front of it (AgentCore Runtime): this server has no auth.
 */
import { createServer as createHttpServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { loadDepositLaws, SnapshotError } from "./data/load";
import { createDepositLawCore } from "./core/depositLaws";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./mcp/server";
import { fileCallLog, noCallLog } from "./mcp/callLog";

const port = Number(process.env.PORT ?? 8000);
const host = process.env.HOST ?? "127.0.0.1";
const loopback = ["127.0.0.1", "localhost", "::1"].includes(host);

try {
  const data = loadDepositLaws();
  const core = createDepositLawCore(data);
  const logPath = process.env.DEPOSIT_LAWS_CALL_LOG;
  const log = logPath ? fileCallLog(logPath) : noCallLog;
  // shortcut: calls the input schema rejects aren't counted over HTTP (stdio wraps its transport for that); add if the hosted call log is turned on.
  const handler = createMcpHandler(() => createServer(core, log));
  const mcp = toNodeHandler(handler);
  // DNS-rebinding guard: only meaningful on a loopback bind. Behind AgentCore the proxy sets its own Host header.
  const validateHost = loopback ? localhostHostValidation() : () => true;
  // Browsers send Origin; MCP clients and AgentCore don't. Refuse any non-local page.
  const validateOrigin = localhostOriginValidation();

  const server = createHttpServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && path === "/ping") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "Healthy" }));
      return;
    }
    if (path !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    void mcp(req, res);
  });

  server.listen(port, host, () => {
    console.error(
      `${SERVER_NAME} ${SERVER_VERSION}: ${data.meta.count} states from ${data.meta.source.commit.slice(0, 7)}, ready on http://${host}:${port}/mcp${logPath ? ", call log on" : ""}.`,
    );
  });

  const shutdown = async () => {
    await handler.close();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (error) {
  const message = error instanceof SnapshotError ? error.message : String(error);
  console.error(`${SERVER_NAME} failed to start: ${message}`);
  process.exit(1);
}
