import type SquidoPlugin from "../main";
import type { BuildInfo, BuildInfoDiagnostics, SquidoSettings } from "../types";
import { renderTextSetting } from "./textSetting";

export function renderManualPatSection(containerEl: HTMLElement, plugin: SquidoPlugin, settings: SquidoSettings): void {
  containerEl.createEl("h3", { text: "Advanced manual publishing" });
  containerEl.createEl("p", {
    text: "Manual personal access token publishing remains available for alpha testing and recovery. It is separate from the GitHub App connection flow.",
  });
  renderTextSetting(containerEl, plugin, settings, "GitHub token", "A token with Contents write access to the destination repository.", "githubToken", true);
  renderTextSetting(containerEl, plugin, settings, "Owner or organization", "The GitHub account that owns the repository.", "owner");
  renderTextSetting(containerEl, plugin, settings, "Repository", "Repository name without the owner.", "repo");
  renderTextSetting(containerEl, plugin, settings, "Branch", "Branch to publish to.", "branch");
  renderTextSetting(containerEl, plugin, settings, "Target folder", "Optional repository folder. The note filename is appended.", "targetFolder");
  renderTextSetting(containerEl, plugin, settings, "Default commit message", "Use {{title}} to insert the note title.", "commitMessageTemplate");
}

export function renderDeveloperSection(
  containerEl: HTMLElement,
  buildInfo: BuildInfo | null,
  diagnostics: BuildInfoDiagnostics | null,
): void {
  if (!buildInfo && diagnostics?.status === "missing_file") return;
  if (!buildInfo && diagnostics?.status === "release_build") return;

  const details = containerEl.createEl("details", { cls: "squido-developer-section" });
  details.createEl("summary", { text: "Developer" });
  details.createEl("p", {
    text: "Non-release build diagnostics. This section is generated from dist/build-info.json and is hidden from production builds.",
  });

  if (!buildInfo) {
    details.createEl("p", {
      cls: "squido-developer-error",
      text: developerDiagnosticsMessage(diagnostics),
    });

    const rows: Array<[string, string]> = [
      ["Status", diagnostics?.status ?? "unknown"],
      ["Path", diagnostics?.path ?? "not available"],
      ["Error", diagnostics?.error ?? "No diagnostic detail was recorded."],
    ];
    renderDefinitionList(details, rows);
    if (diagnostics?.rawText) {
      details.createEl("h4", { text: "Raw build-info.json" });
      details.createEl("pre", { text: diagnostics.rawText });
    }
    return;
  }

  const rows: Array<[string, string]> = [
    ["Version", buildInfo.version],
    ["Branch", buildInfo.branch],
    ["Commit", `${buildInfo.shortCommit} (${buildInfo.commit})`],
    ["Build timestamp", formatBuildTimestamp(buildInfo.builtAt)],
    ["Dirty state", buildInfo.dirty ? "dirty" : "clean"],
    ["Build default broker URL", buildInfo.defaultBrokerUrl ?? "not set"],
  ];

  renderDefinitionList(details, rows);
}

function renderDefinitionList(containerEl: HTMLElement, rows: Array<[string, string]>): void {
  const list = containerEl.createEl("dl", { cls: "squido-build-info" });
  for (const [label, value] of rows) {
    list.createEl("dt", { text: label });
    list.createEl("dd", { text: value });
  }
}

function developerDiagnosticsMessage(diagnostics: BuildInfoDiagnostics | null): string {
  switch (diagnostics?.status) {
    case "invalid_json":
      return "Developer diagnostics could not load because build-info.json is not valid JSON.";
    case "invalid_shape":
      return "Developer diagnostics could not load because build-info.json does not match the expected schema.";
    case "missing_plugin_directory":
      return "Developer diagnostics could not load because Obsidian did not provide the plugin folder path.";
    case "read_error":
      return "Developer diagnostics could not load because Squido could not read build-info.json.";
    default:
      return "Developer diagnostics could not load.";
  }
}

function formatBuildTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;

  try {
    const localTime = new Date(timestamp).toLocaleString();
    return localTime ? `${localTime} (${value})` : value;
  } catch {
    return value;
  }
}
