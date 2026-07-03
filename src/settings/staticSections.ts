import type SquidoPlugin from "../main";
import type { BuildInfo, SquidoSettings } from "../types";
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

export function renderDeveloperSection(containerEl: HTMLElement, buildInfo: BuildInfo): void {
  const details = containerEl.createEl("details", { cls: "squido-developer-section" });
  details.createEl("summary", { text: "Developer" });
  details.createEl("p", {
    text: "Non-release build diagnostics. This section is generated from dist/build-info.json and is hidden from production builds.",
  });

  const rows = [
    ["Version", buildInfo.version],
    ["Branch", buildInfo.branch],
    ["Commit", `${buildInfo.shortCommit} (${buildInfo.commit})`],
    ["Build timestamp", buildInfo.builtAt],
    ["Dirty state", buildInfo.dirty ? "dirty" : "clean"],
    ["Build default broker URL", buildInfo.defaultBrokerUrl ?? "not set"],
  ];

  const list = details.createEl("dl", { cls: "squido-build-info" });
  for (const [label, value] of rows) {
    list.createEl("dt", { text: label });
    list.createEl("dd", { text: value });
  }
}

