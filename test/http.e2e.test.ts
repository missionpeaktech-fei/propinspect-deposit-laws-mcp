/**
 * HTTP end-to-end: the real server over streamable HTTP, the transport
 * AgentCore Runtime uses (ADR 0007). Same tools and answers as over stdio.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const root = fileURLToPath(new URL("..", import.meta.url));
const client = new Client({ name: "http-e2e-test", version: "0.0.0" });
let server: ChildProcess;
let base = "";

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["--import", "tsx", "src/http.ts"], { cwd: root, env: { ...process.env, PORT: String(port) } });
  await new Promise<void>((resolve, reject) => {
    server.stderr!.on("data", (chunk) => String(chunk).includes("ready on") && resolve());
    server.on("exit", (code) => reject(new Error(`server exited ${code}`)));
  });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});

after(async () => {
  await client.close();
  server.kill("SIGTERM");
});

test("lists the same three tools over HTTP", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["compare_states", "get_deposit_rules", "list_covered_states"]);
});

test("get_deposit_rules for NV returns the deadline with its citation", async () => {
  const result = await client.callTool({ name: "get_deposit_rules", arguments: { state: "NV" } });
  const text = ((result.content ?? []) as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
  assert.match(text, /Return deadline: .*30 days/);
  assert.match(text, /https:\/\/propinspect\.net\/security-deposit-laws\/nevada/);
});

test("GET /ping answers Healthy, other paths 404", async () => {
  const ping = await fetch(`${base}/ping`);
  assert.equal(ping.status, 200);
  assert.deepEqual(await ping.json(), { status: "Healthy" });
  assert.equal((await fetch(`${base}/other`)).status, 404);
});

test("refuses a browser page from another site (Origin guard)", async () => {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(res.status, 403);
});
