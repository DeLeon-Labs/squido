import assert from "node:assert/strict";
import test from "node:test";
import { InstallationTokenExchange, TOKEN_EXCHANGE_ERROR, type DiscoveryTokenContext } from "../src/auth/installationTokenExchange";
import { GITHUB_BROKER_GRANT_CREDENTIAL as GRANT } from "../src/credentials/credentialStore";
import { SecretStorageCredentialStore } from "../src/credentials/secretStorageCredentialStore";
import { ManifestStore, DEFAULT_SETTINGS } from "../src/storage/manifestStore";

const now = Date.parse("2026-10-11T16:00:00Z");
const valid = () => ({ status: "issued", provider: "github", purpose: "repo_discovery", token_type: "installation", token: "fixture-installation", expires_at: "2026-10-11T17:00:00Z", connection_id: "connection-a", installation_id: "123", broker_grant: "fixture-rotated", broker_grant_expires_at: "2026-11-11T16:00:00Z", rotated_broker_grant: true, device_session_bound: true, permissions: { metadata: "read" } });
async function harness() {
  const writes: string[] = [];
  const values = new Map<string, string>();
  const manifest = new ManifestStore(async () => ({ settings: DEFAULT_SETTINGS }), async (data) => { writes.push(JSON.stringify(data)); });
  await manifest.initialize();
  const api = { getSecret: (id: string) => values.get(id) ?? null, setSecret: (id: string, value: string) => { values.set(id, value); } };
  const store = new SecretStorageCredentialStore(manifest, api);
  await store.migrateLegacy(); await store.set(GRANT, "fixture-original");
  const context: DiscoveryTokenContext = { mode: "github-app", connected: true, brokerBaseUrl: "https://broker.example", connectionId: "connection-a", installationId: "123", deviceSessionId: "device-session-a" };
  const calls: any[] = [];
  let response: any = { status: 200, headers: { "Cache-Control": "no-store" }, json: valid() };
  let hook = async () => {};
  const exchange = new InstallationTokenExchange(store, () => context, async (request) => { calls.push(request); await hook(); return response; }, () => now);
  return { exchange, store, api, context, calls, writes, values, response, setHook: (fn: () => Promise<void>) => { hook = fn; } };
}

test("exchange sends fixed content-blind purpose; verifies and stores only rotated grant before callback", async () => {
  const h = await harness();
  assert.equal(await h.exchange.withRepoDiscoveryToken(async (auth) => {
    assert.equal(await h.store.get(GRANT), "fixture-rotated");
    assert.deepEqual(auth, { token: "fixture-installation", expiresAt: valid().expires_at, purpose: "repo_discovery" });
    return "repository-operation-result";
  }), "repository-operation-result");
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, "https://broker.example/auth/github/token");
  assert.equal(h.calls[0].method, "POST");
  assert.deepEqual(JSON.parse(h.calls[0].body), { broker_grant: "fixture-original", device_session_id: "device-session-a", purpose: "repo_discovery" });
  assert.ok(h.writes.every((value) => !value.includes("fixture-")));
  assert.ok(![...h.values.values()].includes("fixture-installation"));
});

for (const changes of [
  { mode: "pat" }, { connected: false }, { deviceSessionId: "" }, { connectionId: "" },
  { brokerBaseUrl: "http://broker.example" }, { brokerBaseUrl: "https://user:pass@broker.example" },
  { brokerBaseUrl: "https://broker.example/path" }, { brokerBaseUrl: "https://broker.example?secret=x" },
]) {
  test(`invalid context fails before credential/network access: ${JSON.stringify(changes)}`, async () => {
    const h = await harness(); Object.assign(h.context, changes);
    h.store.get = async () => { assert.fail("credential must not be read"); };
    await assert.rejects(h.exchange.withRepoDiscoveryToken(async () => assert.fail()), { message: TOKEN_EXCHANGE_ERROR });
    assert.equal(h.calls.length, 0);
  });
}

for (const changes of [
  { status: "connected" }, { provider: "other" }, { purpose: "publish" }, { token_type: "user" },
  { connection_id: "connection-b" }, { installation_id: "456" }, { installation_id: 123 },
  { token: "" }, { expires_at: "invalid" }, { expires_at: "2026-10-11T16:00:10Z" },
  { expires_at: "2026-10-11T18:00:00Z" }, { broker_grant: "fixture-original" },
  { broker_grant_expires_at: "2026-10-10T16:00:00Z" }, { rotated_broker_grant: false }, { device_session_bound: false },
  { permissions: { metadata: "read", contents: "write" } }, { permissions: {} }, { permissions: null },
]) {
  test(`rejects invalid or substituted token contract: ${JSON.stringify(changes)}`, async () => {
    const h = await harness(); Object.assign(h.response.json, changes);
    await assert.rejects(h.exchange.withRepoDiscoveryToken(async () => assert.fail()), { message: TOKEN_EXCHANGE_ERROR });
    assert.equal(await h.store.get(GRANT), "fixture-original");
    await assert.rejects(h.exchange.withRepoDiscoveryToken(async () => assert.fail()));
    assert.equal(h.calls.length, 1); // no retry after uncertain exchange
  });
}

for (const status of [401, 403, 409, 502, 503]) {
  test(`HTTP ${status} is sanitized and not retried`, async () => {
    const h = await harness(); h.response.status = status; h.response.text = "fixture-private-error";
    await assert.rejects(h.exchange.withRepoDiscoveryToken(async () => assert.fail()), { message: TOKEN_EXCHANGE_ERROR });
    await assert.rejects(h.exchange.withRepoDiscoveryToken(async () => assert.fail()));
    assert.equal(h.calls.length, 1);
  });
}

test("missing no-store or malformed body never releases token", async () => {
  for (const change of [{ headers: {} }, { json: null }, { json: [] }]) {
    const h = await harness(); Object.assign(h.response, change);
    await assert.rejects(h.exchange.withRepoDiscoveryToken(async () => assert.fail()));
  }
});

test("missing grant, network error and failed rotation writes fail closed with sanitized error", async () => {
  for (const mode of ["missing", "network", "storage"]) {
    const h = await harness();
    if (mode === "missing") await h.store.delete(GRANT);
    if (mode === "network") h.setHook(async () => { throw new Error("fixture-private-error"); });
    if (mode === "storage") h.api.setSecret = () => { throw new Error("fixture-private-error"); };
    await assert.rejects(h.exchange.withRepoDiscoveryToken(async () => assert.fail()), { message: TOKEN_EXCHANGE_ERROR });
    await assert.rejects(h.exchange.withRepoDiscoveryToken(async () => assert.fail()));
    assert.equal(h.calls.length, mode === "missing" ? 0 : 1);
  }
});

test("overlapping operations never duplicate vending; changed mode discards late response", async () => {
  const h = await harness();
  let release!: () => void;
  h.setHook(() => new Promise<void>((resolve) => { release = resolve; }));
  const pending = h.exchange.withRepoDiscoveryToken(async () => assert.fail());
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(h.exchange.withRepoDiscoveryToken(async () => assert.fail()));
  h.context.mode = "pat"; release();
  await assert.rejects(pending);
  assert.equal(h.calls.length, 1);
  assert.equal(await h.store.get(GRANT), "fixture-original");
});

test("externally rotated grant is never overwritten by a late response", async () => {
  const h = await harness(); h.setHook(async () => { await h.store.set(GRANT, "fixture-external"); });
  await assert.rejects(h.exchange.withRepoDiscoveryToken(async () => assert.fail()));
  assert.equal(await h.store.get(GRANT), "fixture-external");
});

test("successive operations read the replacement grant; callback failures do not retry the exchange", async () => {
  const h = await harness();
  await assert.rejects(h.exchange.withRepoDiscoveryToken(async () => { throw new Error("operation failed"); }), /operation failed/);
  h.response.json.broker_grant = "fixture-next";
  await h.exchange.withRepoDiscoveryToken(async () => undefined);
  assert.equal(JSON.parse(h.calls[1].body).broker_grant, "fixture-rotated");
});
