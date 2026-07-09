import type { App } from "obsidian";
import type { BuildInfo, BuildInfoDiagnostics } from "../types";

export interface BuildInfoLoadResult {
  buildInfo: BuildInfo | null;
  diagnostics: BuildInfoDiagnostics;
}

export async function loadBuildInfo(app: App, pluginDirectory: string | undefined): Promise<BuildInfoLoadResult> {
  if (!pluginDirectory) {
    return {
      buildInfo: null,
      diagnostics: {
        status: "missing_plugin_directory",
        error: "Obsidian did not provide a plugin directory.",
      },
    };
  }

  const buildInfoPath = `${pluginDirectory}/build-info.json`;
  try {
    if (!await app.vault.adapter.exists(buildInfoPath)) {
      return {
        buildInfo: null,
        diagnostics: {
          path: buildInfoPath,
          status: "missing_file",
          error: "build-info.json was not found in the plugin folder.",
        },
      };
    }

    const rawText = await app.vault.adapter.read(buildInfoPath);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText) as unknown;
    } catch (error) {
      return {
        buildInfo: null,
        diagnostics: {
          path: buildInfoPath,
          status: "invalid_json",
          error: error instanceof Error ? error.message : "build-info.json is not valid JSON.",
          rawText,
        },
      };
    }

    if (!isBuildInfo(parsed)) {
      return {
        buildInfo: null,
        diagnostics: {
          path: buildInfoPath,
          status: "invalid_shape",
          error: "build-info.json is present but does not match Squido's expected schema.",
          rawText,
        },
      };
    }

    if (parsed.release) {
      return {
        buildInfo: null,
        diagnostics: {
          path: buildInfoPath,
          status: "release_build",
          error: "build-info.json identifies this as a release build, so Developer diagnostics are hidden.",
        },
      };
    }

    return {
      buildInfo: parsed,
      diagnostics: {
        path: buildInfoPath,
        status: "loaded",
      },
    };
  } catch (error) {
    console.warn("Squido could not read build-info.json", error);
    return {
      buildInfo: null,
      diagnostics: {
        path: buildInfoPath,
        status: "read_error",
        error: error instanceof Error ? error.message : "Could not read build-info.json.",
      },
    };
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
