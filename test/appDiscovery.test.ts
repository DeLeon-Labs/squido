import assert from "node:assert/strict";
import test from "node:test";
import { AuthLifecycle } from "../src/auth/authLifecycle";
import { GitHubConnectionController, APP_REPOSITORY_DISCOVERY_RELEASED } from "../src/auth/githubConnection";
import { ManifestStore, DEFAULT_SETTINGS } from "../src/storage/manifestStore";
import { SecretStorageCredentialStore } from "../src/credentials/secretStorageCredentialStore";
import { GITHUB_BROKER_GRANT_CREDENTIAL as GRANT } from "../src/credentials/credentialStore";
import { listInstallationRepositories } from "../src/installationRepositories";
import { DestinationDiscovery } from "../src/destinationDiscovery";
import { BrokerAuthClient } from "../src/auth/brokerAuthClient";

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const repo = (id: number) => ({ id, owner: { login: "org" }, name: `repo-${id}`, default_branch: "main", permissions: { push: false } });
const issued = () => ({ status: "issued", provider: "github", purpose: "repo_discovery", token_type: "installation", token: "fixture-installation", expires_at: iso(3_500_000), connection_id: "connection-a", installation_id: "123", broker_grant: "fixture-rotated", broker_grant_expires_at: iso(86_400_000), rotated_broker_grant: true, device_session_bound: true, permissions: { metadata: "read" } });
const verified = () => ({ status: "connected", provider: "github", connection_id: "connection-a", installation_id: "123", broker_grant: "fixture-verified", device_session_id: "device-session-a", connected_at: iso(-86_400_000), verified_at: iso(0) });
const response = (json: unknown, status = 200) => ({ status, headers: { "cache-control": "no-store" }, json, text: "fixture-private-error" });
async function harness(approved = true) {
  const writes: string[] = [];
  const manifest = new ManifestStore(async () => ({ settings: { ...DEFAULT_SETTINGS, connectionMode: "broker", githubAppConnection: {
    status: "connected", device_session_id: "device-session-a", session: { status: "active" },
    connection: { provider: "github", connection_id: "connection-a", installation: { id: "123" }, brokerBaseUrl: "https://broker.test", connected_at: iso(-86_400_000) },
  } } }), async (data) => { writes.push(JSON.stringify(data)); });
  await manifest.initialize();
  const values = new Map<string, string>();
  const store = new SecretStorageCredentialStore(manifest, { getSecret: (id) => values.get(id) ?? null, setSecret: (id, value) => { values.set(id, value); } });
  await store.migrateLegacy(); await store.set(GRANT, "fixture-original");
  const controller = new GitHubConnectionController({ manifestStore: manifest, credentialStore: store, pluginVersion: "test", isDevelopmentBuild: () => false, registerInterval: () => undefined, onStateChange: () => undefined, ...(approved ? { repositoryDiscoveryApproved: () => true } : {}) });
  const calls: any[] = [];
  let hook: (p: any) => Promise<any> = async (p) => p.url.includes("/auth/github/token") ? response(issued()) : p.url.includes("/connection/status") ? response(verified()) : p.url.includes("/connection/revoke") ? response({ status: "revoked" }) : response({ total_count: 1, repositories: [repo(1)] });
  (globalThis as any).__requestUrl = async (p: any) => { calls.push(p); return hook(p); };
  (globalThis as any).window = { open: () => undefined, setInterval: () => 1, clearInterval: () => undefined };
  return { controller, manifest, store, calls, writes, values, hook: (h: typeof hook) => { hook = h; } };
}

test("production release gate is closed before all credential/network access", async () => {
  const h = await harness(false);
  assert.equal(APP_REPOSITORY_DISCOVERY_RELEASED, false);
  h.store.get = async () => assert.fail("no credentials");
  await assert.rejects(h.controller.discoverRepositories(), /disabled pending/);
  assert.equal(h.calls.length, 0);
});

test("integrated App discovery rotates grant then directly lists installation metadata, not PAT/writable repos", async () => {
  const h = await harness();
  const discovery = new DestinationDiscovery(() => h.manifest.getSettings().connectionMode, async () => assert.fail("PAT not allowed"), undefined,
    { available: () => h.controller.repositoryDiscoveryAvailable(), repositories: () => h.controller.discoverRepositories() });
  assert.deepEqual(await discovery.repositories(), [{ owner: "org", name: "repo-1", defaultBranch: "main" }]);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(JSON.parse(h.calls[0].body), { broker_grant: "fixture-original", device_session_id: "device-session-a", purpose: "repo_discovery" });
  assert.equal(h.calls[1].url, "https://api.github.com/installation/repositories?per_page=100&page=1");
  assert.equal(h.calls[1].headers.Authorization, "Bearer fixture-installation");
  assert.equal(await h.store.get(GRANT), "fixture-rotated");
  const destination = { owner: "org", repo: "repo-1", branch: "main", targetFolder: "" };
  await assert.rejects(discovery.branches(destination), /metadata-only/);
  await assert.rejects(discovery.folders(destination), /metadata-only/);
  assert.equal(h.calls.length, 2);
  assert.ok(h.writes.every((text) => !text.includes("fixture-")));
  assert.ok(![...h.values.values()].includes("fixture-installation"));
});

for (const action of ["verify", "disconnect", "repair", "switch"] as const) {
  test(`${action} drains dispatched exchange and retains rotation before acting; stale token never reaches GitHub`, async () => {
    const h = await harness(); const vending = deferred<any>();
    h.hook(async (p) => p.url.includes("/token") ? vending.promise : p.url.includes("/connection/status") ? response(verified()) : p.url.includes("/connection/revoke") ? response({ status: "revoked" }) : response({ status: "pending", flow_id: "repair-flow", auth_url: "https://github.com/example", expires_at: iso(600_000), poll_interval_seconds: 2 }));
    const discovery = h.controller.discoverRepositories(); const discarded = assert.rejects(discovery);
    await settle(); assert.equal(h.calls.length, 1);
    const mutation = action === "verify" ? h.controller.refreshStored() : action === "disconnect" ? h.controller.disconnect() : action === "repair" ? h.controller.reauthorizeDevice() : h.controller.selectConnectionMode("pat");
    await settle(); assert.equal(h.calls.length, 1);
    vending.resolve(response(issued())); await discarded; await mutation; await settle();
    assert.ok(h.calls.every((p) => !p.url.includes("api.github.com")));
    if (action === "verify" || action === "disconnect") assert.equal(JSON.parse(h.calls[1].body).broker_grant, "fixture-rotated");
    if (action === "verify") assert.equal(await h.store.get(GRANT), "fixture-verified");
    if (action === "disconnect") assert.equal(await h.store.get(GRANT), null);
    if (action === "repair") { assert.equal(h.manifest.getSettings().githubAppConnection.status, "pending"); h.controller.stopPolling(); }
    if (action === "switch") assert.equal(h.manifest.getSettings().connectionMode, "pat");
  });
}

test("verify drains full credential/state commit before mode switch, not just network completion", async () => {
  const h = await harness(); const write = deferred<void>(); const original = h.store.set.bind(h.store);
  h.store.set = async (key, value) => { if (value === "fixture-verified") await write.promise; await original(key, value); };
  const verification = h.controller.refreshStored(); await settle();
  let done = false; const switching = h.controller.selectConnectionMode("pat").then(() => { done = true; });
  await settle(); assert.equal(done, false); assert.equal(h.manifest.getSettings().connectionMode, "broker");
  write.resolve(); await verification; await switching;
  assert.equal(await h.store.get(GRANT), "fixture-verified"); assert.equal(h.manifest.getSettings().connectionMode, "pat");
});

test("A→PAT→App invalidates in-flight GitHub pages and old queued broker operations", async () => {
  const h = await harness(); const page = deferred<any>();
  h.hook(async (p) => p.url.includes("/token") ? response(issued()) : page.promise);
  const pending = h.controller.discoverRepositories(); const discarded = assert.rejects(pending);
  await settle(); assert.equal(h.calls.length, 2);
  const oldVerify = h.controller.refreshStored(); const oldDiscarded = assert.rejects(oldVerify);
  const toPat = h.controller.selectConnectionMode("pat"); const toApp = h.controller.selectConnectionMode("broker");
  page.resolve(response({ total_count: 1, repositories: [repo(1)] }));
  await discarded; await oldDiscarded; await toPat; await toApp;
  assert.equal(h.manifest.getSettings().connectionMode, "broker"); assert.equal(h.calls.length, 2);
});

test("queued concurrent verification uses previous rotation, never two copies of the same grant", async () => {
  const h = await harness(); let n = 0;
  h.hook(async () => response({ ...verified(), broker_grant: `fixture-verified-${++n}` }));
  await Promise.all([h.controller.refreshStored(), h.controller.refreshStored()]);
  assert.deepEqual(h.calls.map((p) => JSON.parse(p.body).broker_grant), ["fixture-original", "fixture-verified-1"]);
});

test("quiesce drains complete operation, blocks admission and discards discovery even after resume (ABA)", async () => {
  const h = await harness(); const vending = deferred<any>(); h.hook(async () => vending.promise);
  const pending = h.controller.discoverRepositories(); const rejected = assert.rejects(pending); await settle();
  let drained = false; const pause = h.controller.quiesce().then(() => { drained = true; });
  await settle(); assert.equal(drained, false); await assert.rejects(h.controller.refreshStored());
  vending.resolve(response(issued())); await rejected; await pause;
  assert.equal(await h.store.get(GRANT), "fixture-rotated");
  h.controller.resumeBroker(); assert.equal(h.calls.length, 1);
});

test("uncertain exchange stays blocked until successful verification; no implicit instance reset", async () => {
  const h = await harness(); h.hook(async (p) => p.url.includes("/token") ? response({}, 503) : response(verified()));
  await assert.rejects(h.controller.discoverRepositories()); await assert.rejects(h.controller.discoverRepositories()); assert.equal(h.calls.length, 1);
  await h.controller.refreshStored();
  h.hook(async (p) => p.url.includes("/token") ? response(issued()) : response({ total_count: 0, repositories: [] }));
  assert.deepEqual(await h.controller.discoverRepositories(), []);
});

test("stale user settings snapshot preserves current auth state and secret references", async () => {
  const h = await harness(); const snapshot = h.manifest.getSettings();
  await h.controller.disconnect(); await h.controller.updateUserSettings({ ...snapshot, targetFolder: "new/path" });
  assert.equal(h.manifest.getSettings().githubAppConnection.status, "device_disconnected");
  assert.equal(h.manifest.getSettings().credentialRefs?.brokerGrant, undefined);
  assert.equal(h.manifest.getSettings().targetFolder, "new/path");
});

test("stale destination save is rejected at queue commit time, not only at the UI boundary", async () => {
  const h = await harness(); const hold = deferred<void>();
  const busy = h.controller.coordinateLocalChange(async () => { await hold.promise; });
  await settle();
  const snapshot = h.manifest.getSettings(); const generation = h.controller.authGeneration;
  const saving = h.controller.updateUserSettings({ ...snapshot, repo: "stale-selection" }, generation);
  const discarded = assert.rejects(saving);
  const switching = h.controller.selectConnectionMode("broker");
  hold.resolve(); await busy; await discarded; await switching;
  assert.notEqual(h.manifest.getSettings().repo, "stale-selection");
});

test("old polling task cannot resurrect cleared setup state", async () => {
  const h = await harness();
  await (h.controller as any).poll("obsolete-flow", iso(600_000));
  assert.equal(h.calls.length, 0); assert.equal(h.manifest.getSettings().githubAppConnection.status, "connected");
});

test("mismatched verification cannot overwrite connection or credential identity", async () => {
  const h = await harness(); h.hook(async () => response({ ...verified(), connection_id: "other-user" }));
  await h.controller.refreshStored();
  assert.equal(await h.store.get(GRANT), "fixture-original");
  assert.equal(h.manifest.getSettings().githubAppConnection.connection?.connection_id, "connection-a");
  assert.equal(h.manifest.getSettings().githubAppConnection.status, "failed");
});

const authorization = () => ({ token: "fixture-installation", expiresAt: iso(3_500_000), purpose: "repo_discovery" as const });
test("installation pagination validates totals, fixed origins and readonly metadata, including empty repos", async () => {
  const calls: any[] = [];
  const result = await listInstallationRepositories(authorization(), () => undefined, async (p) => {
    calls.push(p); return response({ total_count: 101, repositories: calls.length === 1 ? Array.from({ length: 100 }, (_, i) => repo(i + 1)) : [{ ...repo(101), default_branch: null, html_url: "https://evil.test" }] }) as any;
  });
  assert.equal(result.length, 101); assert.equal(result.at(-1)?.defaultBranch, "");
  assert.ok(calls.every((p) => p.url.startsWith("https://api.github.com/installation/repositories?") && p.method === "GET"));
});

for (const body of [null, [], {}, { total_count: -1, repositories: [] }, { total_count: 10_001, repositories: [] }, { total_count: 1, repositories: [] }, { total_count: 0, repositories: [repo(1)] }, { total_count: 2, repositories: [repo(1), repo(1)] }, { total_count: 1, repositories: [{ ...repo(1), owner: null }] }]) {
  test(`malformed/incomplete installation listing fails closed: ${JSON.stringify(body)}`, async () => {
    await assert.rejects(listInstallationRepositories(authorization(), () => undefined, async () => response(body) as any), /inconsistent/);
  });
}
for (const status of [401, 403, 404, 429, 500]) {
  test(`installation HTTP ${status} errors are sanitized`, async () => {
    await assert.rejects(listInstallationRepositories(authorization(), () => undefined, async () => response({}, status) as any), (error: any) => !error.message.includes("fixture-"));
  });
}
test("changed totals, network failures, stale epochs and expiring authorization never release partial metadata", async () => {
  let n = 0;
  await assert.rejects(listInstallationRepositories(authorization(), () => undefined, async () => response({ total_count: ++n === 1 ? 101 : 102, repositories: Array.from({ length: 100 }, (_, i) => repo(i + 1)) }) as any), /inconsistent/);
  await assert.rejects(listInstallationRepositories(authorization(), () => undefined, async () => { throw new Error("fixture-installation"); }), /Network failure/);
  let calls = 0;
  await assert.rejects(listInstallationRepositories({ ...authorization(), expiresAt: iso(10_000) }, () => undefined, async () => { calls++; return {} as any; }), /expired/);
  await assert.rejects(listInstallationRepositories(authorization(), () => { throw new Error("stale"); }, async () => { calls++; return {} as any; }), /stale/);
  assert.equal(calls, 0);
});

test("lifecycle pause rejects local mutations until explicit resume and continues after operation failures", async () => {
  const lifecycle = new AuthLifecycle(() => true);
  await lifecycle.pause(); await assert.rejects(lifecycle.transition(async () => assert.fail()));
  lifecycle.resume(); await assert.rejects(lifecycle.run(async () => { throw new Error("expected"); }));
  assert.equal(await lifecycle.run(async () => "success"), "success");
});

test("broker URL changes invalidate pending flows rather than poll the old flow on another broker", async () => {
  const h = await harness();
  await h.manifest.updateSettings({ ...h.manifest.getSettings(), githubAppConnection: { status: "pending", flow_id: "flow", auth_url: "https://github.com", expires_at: iso(600_000), started_at: iso(0), poll_interval_seconds: 2 } });
  await h.controller.updateUserSettings({ ...h.manifest.getSettings(), authBrokerBaseUrl: "https://other.test" });
  await (h.controller as any).poll("flow", iso(600_000));
  assert.equal(h.calls.length, 0); assert.equal(h.manifest.getSettings().githubAppConnection.status, "failed");
});

test("development broker diagnostics never log raw reusable grant responses", async () => {
  const logs: unknown[][] = []; const original = console.debug; console.debug = (...args) => { logs.push(args); };
  try { await new BrokerAuthClient("https://broker.test", true, async () => response(verified()) as any).verifyGitHubConnection("fixture-original", "device-session-a"); }
  finally { console.debug = original; }
  assert.ok(logs.length > 0); assert.ok(!JSON.stringify(logs).includes("fixture-"));
});
