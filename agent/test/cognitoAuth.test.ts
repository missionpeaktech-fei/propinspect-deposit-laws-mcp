import { test } from "node:test";
import assert from "node:assert/strict";
import { cognitoAuthProvider } from "../src/cognitoAuth";

const client = { tokenUrl: "https://example.test/oauth2/token", clientId: "id", clientSecret: "secret", scope: "s/invoke" };

function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: RequestInit[] = [];
  const fn = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    const r = responses.shift()!;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test("fetches once, then reuses the cached token", async () => {
  const { fn, calls } = fakeFetch([{ status: 200, body: { access_token: "t1", expires_in: 3600 } }]);
  const auth = cognitoAuthProvider(client, fn);
  assert.equal(await auth.token(), "t1");
  assert.equal(await auth.token(), "t1");
  assert.equal(calls.length, 1);
  assert.match(String((calls[0]!.headers as Record<string, string>).Authorization), /^Basic /);
  assert.match(String(calls[0]!.body), /grant_type=client_credentials/);
});

test("a 401 clears the cache so the next request gets a new token", async () => {
  const { fn, calls } = fakeFetch([
    { status: 200, body: { access_token: "t1", expires_in: 3600 } },
    { status: 200, body: { access_token: "t2", expires_in: 3600 } },
  ]);
  const auth = cognitoAuthProvider(client, fn);
  await auth.token();
  await auth.onUnauthorized!({} as never);
  assert.equal(await auth.token(), "t2");
  assert.equal(calls.length, 2);
});

test("a failed token request reports the status, never the body", async () => {
  const { fn } = fakeFetch([{ status: 400, body: { error: "invalid_client", secret_echo: "secret" } }]);
  await assert.rejects(cognitoAuthProvider(client, fn).token(), (e: Error) => /HTTP 400/.test(e.message) && !/secret/.test(e.message));
});
