import assert from "node:assert/strict";
import test from "node:test";
import { DestinationDiscovery, validateDestination } from "../src/destinationDiscovery";
import { renderDestinationSection } from "../src/settings/destinationSection";
import { ManifestStore, DEFAULT_SETTINGS } from "../src/storage/manifestStore";
import { Publisher } from "../src/publisher";
import { GitHubClient } from "../src/githubClient";

const target = { owner: "org", repo: "notes", branch: "release/docs", targetFolder: "/published/articles" };
const row = (name: string, push = true) => ({ owner: { login: "org" }, name, default_branch: "main", permissions: { push } });
function client(send: (params: any) => Promise<any>, mode: () => "pat" | "broker" = () => "pat", token: () => Promise<string | null> = async () => "fixture-pat") {
  return new DestinationDiscovery(mode, token, send as any);
}

test("PAT repository pagination stays on GitHub and exposes only confirmed writable nonarchived repos", async () => {
  const calls: any[] = [];
  const discovery = client(async (params) => {
    calls.push(params);
    return { status: 200, json: calls.length === 1 ? Array.from({ length: 100 }, (_, i) => row(`repo${i}`)) : [row("read-only", false), { ...row("archived"), archived: true }, { ...row("disabled"), disabled: true }, { ...row("unknown"), permissions: undefined }, row("last")] };
  });
  const result = await discovery.repositories();
  assert.equal(result.length, 101); assert.equal(result.at(-1)?.name, "last");
  assert.ok(calls.every((call) => call.url.startsWith("https://api.github.com/user/repos?") && call.method === "GET" && call.headers.Authorization === "Bearer fixture-pat"));
  assert.match(calls[1].url, /page=2$/);
});

test("branch pagination and nested folder loading encode ref and exclude files / symlinks", async () => {
  const calls: any[] = [];
  const discovery = client(async (params) => { calls.push(params); return { status: 200, json: params.url.includes("/branches") ? [{ name: "release/docs" }] : [{ type: "dir", path: "published/articles/nested" }, { type: "file", path: "published/articles/note.md" }, { type: "symlink", path: "outside" }] }; });
  assert.deepEqual(await discovery.branches(target), ["release/docs"]);
  assert.deepEqual(await discovery.folders(target), ["published/articles/nested"]);
  assert.match(calls[1].url, /contents\/published\/articles\?ref=release%2Fdocs$/);
  assert.equal(target.targetFolder, "/published/articles");
});

for (const [status, message] of [[401, /expired or revoked/], [403, /approval\/SSO/], [404, /branch and path/], [500, /failed \(500\)/]] as const) {
  test(`discovery explains ${status} without echoing upstream secrets`, async () => {
    const discovery = client(async () => ({ status, json: { message: "fixture-pat upstream secret" } }));
    await assert.rejects(discovery.folders(target), (error: any) => message.test(error.message) && !error.message.includes("fixture-pat"));
  });
}

test("network, missing credential, malformed response, file path and large folder fail safely", async () => {
  await assert.rejects(client(async () => { throw new Error("fixture-pat"); }).repositories(), /Network failure/);
  let calls = 0;
  await assert.rejects(client(async () => { calls++; }, () => "pat", async () => null).repositories(), /Authentication required/); assert.equal(calls, 0);
  await assert.rejects(client(async () => ({ status: 200, json: {} })).repositories(), /invalid discovery/);
  await assert.rejects(client(async () => ({ status: 200, json: { type: "file" } })).folders(target), /file, not a folder/);
  await assert.rejects(client(async () => ({ status: 200, json: Array(1000).fill({ type: "dir", path: "a" }) })).folders(target), /too large/);
});

test("App discovery is fail-closed before credential or network access and mode changes discard late results", async () => {
  let tokens = 0, calls = 0;
  const discovery = client(async () => { calls++; }, () => "broker", async () => { tokens++; return "fixture-pat"; });
  for (const action of [() => discovery.repositories(), () => discovery.branches(target), () => discovery.folders(target)]) await assert.rejects(action(), /no authorized installation-token/);
  assert.equal(tokens, 0); assert.equal(calls, 0);
  let mode: "pat" | "broker" = "pat";
  const changed = client(async () => { mode = "broker"; return { status: 200, json: [row("private")] }; }, () => mode);
  await assert.rejects(changed.repositories(), /No PAT fallback/);
});

test("path validation rejects traversal without changing exact leading slash nested settings", () => {
  validateDestination(target); assert.equal(target.targetFolder, "/published/articles");
  for (const targetFolder of ["a/../b", "./articles", "a\\b", "a\u0000b"]) assert.throws(() => validateDestination({ ...target, targetFolder }), /repository folder path/);
});

test("branch pagination is complete and excessive results fail rather than showing a partial list", async () => {
  let pages = 0;
  const discovery = client(async () => ({ status: 200, json: ++pages === 1 ? Array.from({ length: 100 }, (_, i) => ({ name: `branch-${i}` })) : [{ name: "last" }] }));
  assert.equal((await discovery.branches(target)).length, 101); assert.equal(pages, 2);
  pages = 0;
  const bounded = client(async () => { pages++; return { status: 200, json: Array(100).fill(row("repo")) }; });
  await assert.rejects(bounded.repositories(), /Too many results/); assert.equal(pages, 100);
});

test("root folders and legacy whitespace use Publisher-compatible outbound paths", async () => {
  let url = "";
  const discovery = client(async (params) => { url = params.url; return { status: 200, json: [] }; });
  assert.deepEqual(await discovery.folders({ ...target, owner: " org ", repo: " notes ", branch: " release/docs ", targetFolder: "" }), []);
  assert.equal(url, "https://api.github.com/repos/org/notes/contents/?ref=release%2Fdocs");
});

// Native DOM test boundary: labels, values, options, connected state and async events.
class Element {
  children: Element[] = []; attrs: Record<string, string> = {}; textContent = ""; value = ""; type = ""; disabled = false; isConnected = true; tag = "";
  handlers: Record<string, () => void> = {};
  createEl(tag: string, opts: any = {}) { const el = new Element(); el.tag = tag; el.textContent = opts.text ?? ""; el.value = opts.value ?? ""; el.type = opts.type ?? ""; el.attrs = opts.attr ?? {}; this.children.push(el); return el; }
  createDiv(opts: any) { return this.createEl("div", opts); }
  createSpan(opts: any) { return this.createEl("span", opts); }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  addEventListener(key: string, fn: () => void) { this.handlers[key] = fn; }
  empty() { this.children = []; }
  all(): Element[] { return [this, ...this.children.flatMap((el) => el.all())]; }
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
async function ui(mode: "pat" | "broker" = "pat", discovery: any = { repositories: async () => [{ owner: "org", name: "notes", defaultBranch: "main" }], branches: async () => ["main", "release/docs"], folders: async () => ["published/articles/nested"] }) {
  let saved: any = { settings: { ...DEFAULT_SETTINGS, ...target, connectionMode: mode, credentialRefs: { githubPat: "secret-ref" } }, manifest: {} };
  const store = new ManifestStore(async () => saved, async (data) => { saved = data; }); await store.initialize();
  const root = new Element(); let failSave = false;
  renderDestinationSection(root as any, { getSettings: () => store.getSettings(), getDestinationDiscovery: () => discovery, updateSettings: async (settings: any) => { if (failSave) throw new Error("disk write failed"); await store.updateSettings(settings); } } as any);
  const button = async (name: string) => { root.all().find((el) => el.tag === "button" && el.textContent === name)!.handlers.click(); await settle(); };
  const field = (label: string) => root.all().find((el) => el.attrs["aria-label"] === label)!;
  const status = () => root.all().find((el) => el.attrs.role === "status")!.textContent;
  return { root, store, button, field, status, fail: () => { failSave = true; }, reload: async () => { const fresh = new ManifestStore(async () => saved, async () => undefined); await fresh.initialize(); return fresh; } };
}

test("native picker stages account/repo/branch/nested folder, explicit save restores exact path after reload", async () => {
  const h = await ui();
  await h.button("Load accessible repositories");
  const account = h.field("Accessible account / organization"); account.value = "org"; account.handlers.change();
  const repo = h.field("Writable repositories"); repo.value = "notes"; repo.handlers.change();
  await h.button("Load branches"); const branch = h.field("Available branches"); branch.value = "release/docs"; branch.handlers.change();
  const folder = h.field("Target folder (exact path; empty means repository root)"); folder.value = "/published/articles"; folder.handlers.input();
  await h.button("Browse target folder"); assert.equal(h.store.getSettings().targetFolder, "/published/articles");
  const children = h.field("Child folders of the entered target path"); children.value = "published/articles/nested"; children.handlers.change();
  assert.equal(h.store.getSettings().targetFolder, "/published/articles");
  folder.value = "/published/articles/nested"; await h.button("Save current destination");
  assert.equal((await h.reload()).getSettings().targetFolder, "/published/articles/nested");
  assert.equal((await h.reload()).getSettings().branch, "release/docs");
  assert.equal(h.root.all().find((el) => el.attrs.role === "status")!.attrs["aria-live"], "polite");
});

test("load failures, empty listings and failed save never overwrite saved manual destination", async () => {
  const h = await ui("pat", { repositories: async () => [], branches: async () => { throw new Error("branch access denied"); }, folders: async () => { throw new Error("network unavailable"); } });
  await h.button("Load accessible repositories"); assert.match(h.status(), /No writable repositories/);
  await h.button("Load branches"); assert.match(h.status(), /branch access denied/);
  await h.button("Browse target folder"); assert.match(h.status(), /network unavailable/);
  h.field("Target folder (exact path; empty means repository root)").value = "other/nested"; h.fail();
  await h.button("Save current destination"); assert.match(h.status(), /disk write failed/);
  assert.equal((await h.reload()).getSettings().targetFolder, "/published/articles");
  assert.ok(h.root.all().every((el) => !el.disabled));
});

test("App UI has no discovery buttons but preserves manual settings; detached UI discards async results", async () => {
  const app = await ui("broker"); assert.match(app.status(), /unavailable/);
  assert.ok(!app.root.all().some((el) => el.tag === "button" && el.textContent.startsWith("Load")));
  await app.button("Save current destination"); assert.equal(app.store.getSettings().targetFolder, "/published/articles");
  let release!: (value: any) => void;
  const h = await ui("pat", { repositories: () => new Promise((resolve) => { release = resolve; }) });
  const pending = h.button("Load accessible repositories"); await settle(); h.root.children[0].isConnected = false;
  release([{ owner: "other", name: "private", defaultBranch: "main" }]); await pending; await settle();
  assert.match(h.status(), /view changed/); assert.equal(h.store.getSettings().owner, "org");
});

test("reloaded single destination drives real GitHub publish GET/PUT with nested path and exact branch", async () => {
  const h = await ui(); const store = await h.reload(); const calls: any[] = [];
  (globalThis as any).__requestUrl = async (params: any) => { calls.push(params); return params.method === "GET" ? { status: 404, json: {} } : { status: 201, json: { content: { html_url: "https://github.com/org/notes" } } }; };
  const publisher = new Publisher({ cachedRead: async () => "note" } as any, store, new GitHubClient(async () => "fixture-pat"));
  await publisher.publish({ name: "Note.md", path: "local/Note.md" } as any, "publish");
  assert.match(calls[0].url, /contents\/published\/articles\/Note.md\?ref=release%2Fdocs$/);
  assert.equal(JSON.parse(calls[1].body).branch, "release/docs");
  assert.equal(store.get("local/Note.md")?.targetRepoPath, "published/articles/Note.md");
});
