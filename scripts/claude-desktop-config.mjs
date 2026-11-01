#!/usr/bin/env node
/**
 * Adds (or removes) this server in Claude Desktop's config.
 *
 *   node scripts/claude-desktop-config.mjs            add, with the call log on
 *   node scripts/claude-desktop-config.mjs --no-log   add, without the call log
 *   node scripts/claude-desktop-config.mjs --remove   remove it
 *
 * Quit Claude Desktop first (⌘Q). It rewrites this file from memory while
 * running, so edits made while it's open are lost. Reopen it afterwards.
 * Every other setting is kept, and a backup is written next to the file.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "propinspect-deposit-laws";
const root = fileURLToPath(new URL("..", import.meta.url));
const config = join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");

if (!existsSync(config)) {
  console.error(`Claude Desktop config not found at ${config}. Open Claude Desktop once, quit it, then run this again.`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(config, "utf8"));
const backup = `${config}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
copyFileSync(config, backup);

if (process.argv.includes("--remove")) {
  if (data.mcpServers) delete data.mcpServers[NAME];
} else {
  const entry = {
    // Full paths: Claude Desktop doesn't load your shell's PATH. Prefer the stable
    // Homebrew link over the versioned Cellar path, which breaks on upgrade.
    command: ["/opt/homebrew/bin/node", "/usr/local/bin/node"].find((p) => existsSync(p)) ?? process.execPath,
    args: [join(root, "node_modules", "tsx", "dist", "cli.mjs"), join(root, "src", "index.ts")],
  };
  if (!process.argv.includes("--no-log")) {
    const logPath = join(root, "logs", "calls.jsonl");
    mkdirSync(dirname(logPath), { recursive: true });
    entry.env = { DEPOSIT_LAWS_CALL_LOG: logPath };
  }
  data.mcpServers = { ...(data.mcpServers ?? {}), [NAME]: entry };
}

writeFileSync(config, `${JSON.stringify(data, null, 2)}\n`);
console.log(process.argv.includes("--remove") ? `Removed ${NAME}.` : `Added ${NAME}:\n${JSON.stringify(data.mcpServers[NAME], null, 2)}`);
console.log(`Backup: ${backup}\nNow open Claude Desktop.`);
