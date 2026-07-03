import type { App } from "obsidian";
import type { BuildInfo } from "../types";

export async function loadBuildInfo(app: App, pluginDirectory: string | undefined): Promise<BuildInfo | null> {
  if (!pluginDirectory) return null;

  const buildInfoPath = `${pluginDirectory}/build-info.json`;
  try {
    if (!await app.vault.adapter.exists(buildInfoPath)) return null;
    const parsed = JSON.parse(await app.vault.adapter.read(buildInfoPath)) as unknown;
    return isBuildInfo(parsed) && !parsed.release ? parsed : null;
  } catch (error) {
    console.warn("Squido could not read build-info.json", error);
    return null;
  }
}

function isBuildInfo(value: unknown): value is BuildInfo {
  return typeof value === "object" && value !== null &&
    typeof (value as { plugin?: unknown }).plugin === "string" &&
    typeof (value as { version?: unknown }).version === "string" &&
    typeof (value as { branch?: unknown }).branch === "string" &&
    typeof (value as { commit?: unknown }).commit === "string" &&
    typeof (value as { shortCommit?: unknown }).shortCommit === "string" &&
    typeof (value as { builtAt?: unknown }).builtAt === "string" &&
    typeof (value as { dirty?: unknown }).dirty === "boolean" &&
    typeof (value as { release?: unknown }).release === "boolean";
}

