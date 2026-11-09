/**
 * Settings and secrets come from files under ~/.config/agentcore-handson/ (mode 600),
 * never from the repo or the command line:
 *   cognito.env    COGNITO_DOMAIN, COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET, COGNITO_SCOPE
 *   anthropic.env  ANTHROPIC_API_KEY (a key used only for this project)
 *   gateway.env    AGENTCORE_GATEWAY_URL
 * Values are never logged.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = process.env.AGENTCORE_HANDSON_DIR ?? join(homedir(), ".config", "agentcore-handson");

function readEnvFile(name: string): Record<string, string> {
  const path = join(DIR, name);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Missing ${path}. See agent/README.md.`);
  }
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
  return out;
}

function required(values: Record<string, string>, key: string, file: string): string {
  const v = values[key];
  if (!v) throw new Error(`${key} is missing from ~/.config/agentcore-handson/${file}`);
  return v;
}

export function loadConfig() {
  const cognito = readEnvFile("cognito.env");
  const anthropic = readEnvFile("anthropic.env");
  const gateway = readEnvFile("gateway.env");
  return {
    gatewayUrl: required(gateway, "AGENTCORE_GATEWAY_URL", "gateway.env"),
    anthropicApiKey: required(anthropic, "ANTHROPIC_API_KEY", "anthropic.env"),
    cognito: {
      tokenUrl: `https://${required(cognito, "COGNITO_DOMAIN", "cognito.env")}.auth.${cognito.COGNITO_REGION ?? "us-east-2"}.amazoncognito.com/oauth2/token`,
      clientId: required(cognito, "COGNITO_CLIENT_ID", "cognito.env"),
      clientSecret: required(cognito, "COGNITO_CLIENT_SECRET", "cognito.env"),
      scope: required(cognito, "COGNITO_SCOPE", "cognito.env"),
    },
  };
}
