import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { renderConnectionSelector, CONNECTION_OPTIONS, SETUP_VIEW_TYPE } from "../src/ui/SetupView";
import { ManifestStore, DEFAULT_SETTINGS } from "../src/storage/manifestStore";
import { GitHubConnectionController } from "../src/auth/githubConnection";
import { Publisher } from "../src/publisher";

class Element {
  children: Element[] = []; attrs: Record<string, string> = {}; textContent = ""; disabled = false; type = "";
  classes = new Set<string>(); handlers: Record<string, () => Promise<void>> = {};
  classList = { toggle: (name: string, on: boolean) => on ? this.classes.add(name) : this.classes.delete(name) };
  createEl(_tag: string, options: any = {}) { const el = new Element(); if (options.cls) el.classes.add(options.cls); el.textContent = options.text ?? ""; el.attrs = options.attr ?? {}; this.children.push(el); return el; }
  createDiv(options: any) { return this.createEl("div", options); }
  createSpan(options: any) { return this.createEl("span", options); }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  addEventListener(event: string, handler: () => Promise<void>) { this.handlers[event] = handler; }
  querySelector(selector: string): Element | undefined { return this.children.find((el) => el.classes.has(selector.slice(1))); }
}

test("native two-card selector updates selected border/check/aria and conditional canonical copy after successful save", async () => {
  const root = new Element(); const selections: string[] = [];
  renderConnectionSelector(root as any, "broker", async (mode) => { selections.push(mode); });
  const [cards, panel] = root.children;
  assert.equal(cards.attrs.role, "group"); assert.equal(cards.children.length, 2);
  const [broker, pat] = cards.children;
  assert.equal(broker.type, "button"); assert.equal(pat.type, "button");
  assert.equal(broker.attrs["aria-pressed"], "true");
  assert.equal(broker.querySelector(".squido-card-check")!.textContent, "✓");
  assert.equal(panel.attrs["aria-live"], "polite");
  await pat.handlers.click();
  assert.deepEqual(selections, ["pat"]);
  assert.equal(pat.attrs["aria-pressed"], "true"); assert.equal(broker.attrs["aria-pressed"], "false");
  assert.equal(pat.classes.has("is-selected"), true);
  assert.equal(panel.textContent, CONNECTION_OPTIONS[1].explainer);
  assert.equal(SETUP_VIEW_TYPE, "squido-welcome-setup");
});

test("failed selection save retains old selection and reenables cards", async () => {
  const root = new Element(); renderConnectionSelector(root as any, "broker", async () => { throw new Error("disk failure"); });
  await root.children[0].children[1].handlers.click();
  assert.equal(root.children[0].children[0].attrs["aria-pressed"], "true");
  assert.ok(root.children[0].children.every((el) => !el.disabled));
});

test("mode selection survives reload and legacy PAT defaults to independent PAT mode", async () => {
  let saved: any = { settings: { ...DEFAULT_SETTINGS, githubToken: "fixture-pat" } };
  const store = new ManifestStore(async () => saved, async (data) => { saved = data; }); await store.initialize();
  assert.equal(store.getSettings().connectionMode, "pat");
  await store.updateSettings({ ...store.getSettings(), githubToken: "", connectionMode: "broker", setupSelectionMade: true });
  const reload = new ManifestStore(async () => saved, async () => undefined); await reload.initialize();
  assert.equal(reload.getSettings().connectionMode, "broker"); assert.equal(reload.getSettings().setupSelectionMade, true);
});

async function controller(mode: "pat" | "broker") {
  const manifest = new ManifestStore(async () => ({ settings: { ...DEFAULT_SETTINGS, connectionMode: mode } }), async () => undefined); await manifest.initialize();
  return { manifest, controller: new GitHubConnectionController({ manifestStore: manifest, credentialStore: { get: async () => null, set: async () => undefined, delete: async () => undefined }, pluginVersion: "test", isDevelopmentBuild: () => false, registerInterval: () => undefined, onStateChange: () => undefined }) };
}

test("PAT mode blocks every broker transport operation before network dispatch", async () => {
  const h = await controller("pat"); let calls = 0;
  (globalThis as any).__requestUrl = async () => { calls++; throw new Error("network should not be called"); };
  const client = (h.controller as any).createClient("https://broker.test");
  for (const operation of [() => client.startGitHubAuth(), () => client.startGitHubRepair({ installation: { id: "123" } }), () => client.getGitHubAuthStatus("flow"), () => client.verifyGitHubConnection("fixture-grant", "device"), () => client.revokeGitHubConnection("fixture-grant", "device")]) await assert.rejects(operation());
  assert.equal(calls, 0);
});

test("mode switch drains existing transport and blocks late broker requests/results", async () => {
  const h = await controller("broker"); let release!: (value: any) => void; let calls = 0;
  (globalThis as any).__requestUrl = () => { calls++; return new Promise((resolve) => { release = resolve; }); };
  const client = (h.controller as any).createClient("https://broker.test");
  const pending = client.getGitHubAuthStatus("flow"); const rejected = assert.rejects(pending);
  let drained = false; const switchMode = h.controller.quiesce().then(() => { drained = true; });
  await Promise.resolve(); assert.equal(drained, false);
  await assert.rejects(client.getGitHubAuthStatus("other-flow"));
  release({ status: 200, json: {} }); await rejected; await switchMode;
  await h.manifest.updateSettings({ ...h.manifest.getSettings(), connectionMode: "pat" });
  await assert.rejects(client.getGitHubAuthStatus("late-flow")); assert.equal(calls, 1);
});

test("broker mode publishing fails closed instead of using stored PAT or reading content", async () => {
  const h = await controller("broker"); let read = false;
  const publisher = new Publisher({ cachedRead: async () => { read = true; return "note"; } } as any, h.manifest, {} as any);
  await assert.rejects(publisher.publish({ name: "note.md" } as any, "publish"), /App publishing is not implemented/);
  assert.equal(read, false);
});

test("mobile stylesheet stacks cards with native-theme focus and minimum tap height", async () => {
  const css = await readFile("styles.css", "utf8");
  assert.match(css, /@media \(max-width: 600px\).*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /min-height: 96px/); assert.match(css, /:focus-visible/); assert.match(css, /var\(--interactive-accent\)/);
});
