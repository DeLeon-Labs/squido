import assert from "node:assert/strict";
import test from "node:test";
import { SecretStorageCredentialStore, STORAGE_ERROR } from "../src/credentials/secretStorageCredentialStore";
import { GITHUB_PAT_CREDENTIAL as PAT, GITHUB_BROKER_GRANT_CREDENTIAL as GRANT } from "../src/credentials/credentialStore";
import { ManifestStore, DEFAULT_SETTINGS } from "../src/storage/manifestStore";
import { GitHubConnectionController } from "../src/auth/githubConnection";
import { GitHubClient } from "../src/githubClient";

async function harness(legacy: object = {}) {
  let disk = { settings: { ...DEFAULT_SETTINGS, ...legacy }, manifest: {} };
  const writes: string[] = [];
  const values = new Map<string, string>();
  const manifest = new ManifestStore(async () => structuredClone(disk), async (data) => {
    disk = structuredClone(data); writes.push(JSON.stringify(data));
  });
  await manifest.initialize();
  const api = { getSecret: (id: string) => values.get(id) ?? null, setSecret: (id: string, value: string) => { values.set(id, value); } };
  const store = new SecretStorageCredentialStore(manifest, api);
  return { manifest, store, api, values, writes, disk: () => disk };
}

test("migration verifies both legacy credentials then scrubs both locations; reload reads references", async () => {
  const h = await harness({ githubToken: "fixture-pat", githubAppConnection: { status: "connected", session: { broker_grant: "fixture-grant", status: "active" }, connection: { broker_grant: "fixture-old-copy", installation: { id: "123" } } } });
  await h.store.migrateLegacy();
  assert.equal(await h.store.get(PAT), "fixture-pat");
  assert.equal(await h.store.get(GRANT), "fixture-grant");
  assert.equal(h.writes.join("").includes("fixture-"), false);
  const reload = new ManifestStore(async () => h.disk(), async () => undefined);
  await reload.initialize();
  assert.equal(await new SecretStorageCredentialStore(reload, h.api).get(GRANT), "fixture-grant");
});

test("migration failure preserves legacy data and does not save plaintext again", async () => {
  const h = await harness({ githubToken: "fixture-pat" });
  h.api.setSecret = () => { throw new Error("private upstream error"); };
  await assert.rejects(h.store.migrateLegacy(), new RegExp(STORAGE_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(h.disk().settings.githubToken, "fixture-pat");
  assert.equal(h.writes.length, 0);
});

test("missing storage and silent failed writes fail closed", async () => {
  const h = await harness();
  await assert.rejects(new SecretStorageCredentialStore(h.manifest, undefined).migrateLegacy());
  h.api.setSecret = () => undefined;
  await assert.rejects(h.store.set(PAT, "fixture-secret"));
  assert.equal(h.writes.length, 0);
});

test("failed reads never return legacy plaintext or upstream secret-bearing error", async () => {
  const h = await harness(); await h.store.migrateLegacy(); await h.store.set(PAT, "fixture-pat");
  h.api.getSecret = () => { throw new Error("fixture-pat"); };
  await assert.rejects(h.store.get(PAT), { message: STORAGE_ERROR });
});

test("rotation preserves the reference, clearing empties the secret and removes the reference", async () => {
  const h = await harness(); await h.store.migrateLegacy();
  await h.store.set(GRANT, "fixture-first"); const id = h.manifest.getSettings().credentialRefs!.brokerGrant!;
  await h.store.set(GRANT, "fixture-rotated");
  assert.equal(h.manifest.getSettings().credentialRefs!.brokerGrant, id);
  assert.equal(await h.store.get(GRANT), "fixture-rotated");
  await h.store.delete(GRANT);
  assert.equal(h.api.getSecret(id), ""); assert.equal(await h.store.get(GRANT), null);
  assert.equal(h.writes.join("").includes("fixture-"), false);
});

test("concurrent PAT and grant writes retain both references; installation credentials rejected", async () => {
  const h = await harness(); await h.store.migrateLegacy();
  await Promise.all([h.store.set(PAT, "fixture-pat"), h.store.set(GRANT, "fixture-grant")]);
  assert.equal(await h.store.get(PAT), "fixture-pat"); assert.equal(await h.store.get(GRANT), "fixture-grant");
  await assert.rejects(h.store.set({ provider: "github", name: "installationToken" }, "fixture-installation"));
  assert.equal([...h.values.values()].includes("fixture-installation"), false);
});

test("plugin settings reject raw credentials", async () => {
  const h = await harness(); await h.store.migrateLegacy();
  await assert.rejects(h.manifest.updateSettings({ ...h.manifest.getSettings(), githubToken: "fixture-pat" }));
  await assert.rejects(h.manifest.updateSettings({ ...h.manifest.getSettings(), githubAppConnection: { status: "connected", session: { broker_grant: "fixture-grant" } } }));
});

test("new broker setup stores grant before connected metadata and never writes it to data", async () => {
  const h = await harness(); await h.store.migrateLegacy();
  const controller = new GitHubConnectionController({ manifestStore: h.manifest, credentialStore: h.store, pluginVersion: "test", isDevelopmentBuild: () => false, registerInterval: () => undefined, onStateChange: () => undefined });
  await (controller as any).applyStatus({ status: "completed", flow_id: "flow", connection: { provider: "github", broker_grant: "fixture-grant", installation: { id: "123" }, connected_at: new Date().toISOString() } });
  assert.equal(await h.store.get(GRANT), "fixture-grant");
  assert.equal(h.manifest.getSettings().githubAppConnection.status, "connected");
  assert.equal(h.writes.join("").includes("fixture-grant"), false);
});

test("broker setup storage failure never marks connection connected", async () => {
  const h = await harness(); await h.store.migrateLegacy(); h.api.setSecret = () => { throw new Error("locked"); };
  const controller = new GitHubConnectionController({ manifestStore: h.manifest, credentialStore: h.store, pluginVersion: "test", isDevelopmentBuild: () => false, registerInterval: () => undefined, onStateChange: () => undefined });
  await assert.rejects((controller as any).applyStatus({ status: "completed", connection: { provider: "github", broker_grant: "fixture-grant", installation: { id: "123" }, connected_at: new Date().toISOString() } }));
  assert.notEqual(h.manifest.getSettings().githubAppConnection.status, "connected");
});

test("PAT publishing awaits SecretStorage and only sends GET/PUT to GitHub Contents API", async () => {
  const calls: any[] = [];
  (globalThis as any).__requestUrl = async (params: any) => { calls.push(params); return { status: params.method === "GET" ? 404 : 201, json: { commit: { html_url: "https://github.com/test/commit" } } }; };
  const client = new GitHubClient(async () => "fixture-pat");
  await client.publishFile({ owner: "owner", repo: "repo", branch: "main", path: "note.md", content: "note", message: "publish" });
  assert.deepEqual(calls.map((call) => call.method), ["GET", "PUT"]);
  assert.ok(calls.every((call) => new URL(call.url).origin === "https://api.github.com"));
});

for (const status of ["expired", "revoked"] as const) {
  test(`broker ${status} clears the secret and preserves repair metadata`, async () => {
    const h = await harness({ githubAppConnection: { status: "connected", device_session_id: "device", session: { status: "active" }, connection: { provider: "github", installation: { id: "123" }, connected_at: new Date().toISOString() } } });
    await h.store.migrateLegacy(); await h.store.set(GRANT, "fixture-grant");
    const controller = new GitHubConnectionController({ manifestStore: h.manifest, credentialStore: h.store, pluginVersion: "test", isDevelopmentBuild: () => false, registerInterval: () => undefined, onStateChange: () => undefined });
    (controller as any).createClient = () => ({ verifyGitHubConnection: async () => ({ status }) });
    await controller.refreshStored({ showNotice: false });
    assert.equal(await h.store.get(GRANT), null);
    assert.equal(h.manifest.getSettings().githubAppConnection.connection?.installation.id, "123");
    assert.equal(h.manifest.getSettings().githubAppConnection.status, status === "expired" ? "expired" : "device_disconnected");
  });
}

test("broker verification rotation and disconnection keep raw grant out of plugin data", async () => {
  const h = await harness({ githubAppConnection: { status: "connected", device_session_id: "device", session: { status: "active" }, connection: { provider: "github", installation: { id: "123" }, connected_at: new Date().toISOString() } } });
  await h.store.migrateLegacy(); await h.store.set(GRANT, "fixture-grant");
  const controller = new GitHubConnectionController({ manifestStore: h.manifest, credentialStore: h.store, pluginVersion: "test", isDevelopmentBuild: () => false, registerInterval: () => undefined, onStateChange: () => undefined });
  let revoked = "";
  (controller as any).createClient = () => ({
    verifyGitHubConnection: async () => ({ status: "connected", broker_grant: "fixture-rotated", installation_id: "123", connected_at: new Date().toISOString(), verified_at: new Date().toISOString(), session: { broker_grant: "fixture-rotated", status: "active" } }),
    revokeGitHubConnection: async (grant: string) => { revoked = grant; return { status: "revoked" }; },
  });
  await controller.refreshStored({ showNotice: false });
  assert.equal(await h.store.get(GRANT), "fixture-rotated");
  await controller.disconnect();
  assert.equal(revoked, "fixture-rotated"); assert.equal(await h.store.get(GRANT), null);
  assert.equal(h.writes.join("").includes("fixture-"), false);
});
