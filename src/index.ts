#!/usr/bin/env node
/**
 * Entry point: stdio transport. The AI app starts this process and talks to
 * it over stdin/stdout.
 *
 * stdout carries the protocol, so nothing else may write to it: logs and
 * errors go to stderr only. A stray console.log would corrupt the connection.
 */
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { loadDepositLaws, SnapshotError } from "./data/load";
import { createDepositLawCore } from "./core/depositLaws";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./mcp/server";
import { fileCallLog, noCallLog } from "./mcp/callLog";
import { withRejectionLog } from "./mcp/rejectionLog";

try {
  const data = loadDepositLaws();
  // Opt-in usage log for the feedback loop. Set by whoever configures the server, never by the model.
  const logPath = process.env.DEPOSIT_LAWS_CALL_LOG;
  const log = logPath ? fileCallLog(logPath) : noCallLog;
  const server = createServer(createDepositLawCore(data), log);
  // Also count calls the input schema rejects (they never reach our handlers).
  const toolNames = new Set(["get_deposit_rules", "compare_states", "list_covered_states"]);
  await server.connect(logPath ? withRejectionLog(new StdioServerTransport(), log, toolNames) : new StdioServerTransport());
  console.error(
    `${SERVER_NAME} ${SERVER_VERSION}: ${data.meta.count} states from ${data.meta.source.commit.slice(0, 7)}, ready on stdio${logPath ? `, call log on` : ""}.`,
  );
} catch (error) {
  // Fail loudly: the AI app shows the server as failed and keeps this message in its log.
  const message = error instanceof SnapshotError ? error.message : String(error);
  console.error(`${SERVER_NAME} failed to start: ${message}`);
  console.error("Please report this at https://github.com/missionpeaktech-fei/propinspect-deposit-laws-mcp/issues");
  process.exit(1);
}
