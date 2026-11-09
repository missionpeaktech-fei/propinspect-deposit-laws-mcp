/**
 * Bearer tokens for the gateway, from Cognito's client_credentials grant.
 * The MCP transport calls token() before every request and onUnauthorized() on a 401,
 * then retries once. Tokens are cached until a minute before they expire.
 */
import type { AuthProvider } from "@modelcontextprotocol/client";

export interface CognitoClient {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
}

export function cognitoAuthProvider(client: CognitoClient, fetchFn: typeof fetch = fetch): AuthProvider {
  let cached: { token: string; expiresAt: number } | undefined;

  async function fetchToken() {
    const res = await fetchFn(client.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: client.scope }),
    });
    // Never include the response body: on success it holds the token.
    if (!res.ok) throw new Error(`Cognito token request failed: HTTP ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  }

  return {
    async token() {
      if (!cached || Date.now() >= cached.expiresAt) await fetchToken();
      return cached!.token;
    },
    async onUnauthorized() {
      cached = undefined;
    },
  };
}
