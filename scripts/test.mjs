import { build } from "esbuild";
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const tests = (await readdir("test")).filter((name) => name.endsWith(".test.ts"));
await build({
  entryPoints: tests.map((name) => `test/${name}`), outdir: ".test-dist", outExtension: { ".js": ".mjs" },
  bundle: true, platform: "node", format: "esm", target: "node22",
  plugins: [{ name: "obsidian-test-boundary", setup(build) {
    build.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "mock" }));
    build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: `
      export class Notice { constructor() {} }
      export class ItemView {}
      export class Setting {}
      export class Plugin {}
      export class PluginSettingTab {}
      export class Modal {}
      export class TFile {}
      export const requestUrl = (params) => globalThis.__requestUrl(params);
      export const normalizePath = (path) => path;
    `, loader: "js" }));
  } }],
});
const result = spawnSync(process.execPath, ["--test", ...tests.map((name) => `.test-dist/${name.replace(/\.ts$/, ".mjs")}`)], { stdio: "inherit" });
process.exit(result.status ?? 1);
