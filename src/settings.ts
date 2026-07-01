import { PluginSettingTab, Setting, type App } from "obsidian";
import type SquidoPlugin from "./main";
import type { BrokerGitHubConnectionState, BrokerStageState, BuildInfo, SquidoSettings } from "./types";

type TextSettingKey = {
  [Key in keyof SquidoSettings]: SquidoSettings[Key] extends string ? Key : never;
}[keyof SquidoSettings];

export class SquidoSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: SquidoPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Squido settings" });
    containerEl.createEl("p", {
      text: "Configure the single GitHub publishing destination used by the 0.1.0-alpha MVP.",
    });

    const settings = this.plugin.getSettings();
    this.textSetting(settings, "GitHub token", "A token with Contents write access to the destination repository.", "githubToken", true);
    this.textSetting(settings, "Owner or organization", "The GitHub account that owns the repository.", "owner");
    this.textSetting(settings, "Repository", "Repository name without the owner.", "repo");
    this.textSetting(settings, "Branch", "Branch to publish to.", "branch");
    this.textSetting(settings, "Target folder", "Optional repository folder. The note filename is appended.", "targetFolder");
    this.textSetting(settings, "Default commit message", "Use {{title}} to insert the note title.", "commitMessageTemplate");

    const buildInfo = this.plugin.getBuildInfo();
    if (buildInfo) this.renderDeveloperSection(settings, buildInfo);
  }

  private textSetting(
    settings: SquidoSettings,
    name: string,
    description: string,
    key: TextSettingKey,
    password = false,
    container = this.containerEl,
  ): void {
    new Setting(container)
      .setName(name)
      .setDesc(description)
      .addText((text) => {
        text.setValue(settings[key]).onChange(async (value) => {
          settings[key] = value;
          await this.plugin.updateSettings(settings);
        });
        if (password) text.inputEl.type = "password";
      });
  }

  private renderDeveloperSection(settings: SquidoSettings, buildInfo: BuildInfo): void {
    const details = this.containerEl.createEl("details", { cls: "squido-developer-section" });
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
      ["Saved broker URL", settings.authBrokerBaseUrl],
      ["Build default broker URL", buildInfo.defaultBrokerUrl ?? "not set"],
    ];

    const list = details.createEl("dl", { cls: "squido-build-info" });
    for (const [label, value] of rows) {
      list.createEl("dt", { text: label });
      list.createEl("dd", { text: value });
    }

    details.createEl("h3", { text: "Broker connection stages" });
    details.createEl("p", {
      text: "Temporary local/dev broker tests. These stages do not publish notes, modify bindings, or change publish settings.",
    });

    this.textSetting(
      settings,
      "Auth broker base URL",
      "Local/dev broker URL used only by the temporary broker tests. Supports localhost or Tailscale URLs.",
      "authBrokerBaseUrl",
      false,
      details,
    );

    new Setting(details)
      .setName("Broker debug logging")
      .setDesc("Log broker request URL, method, status, and response body to the developer console.")
      .addToggle((toggle) => {
        toggle.setValue(settings.brokerDebugLogging).onChange(async (value) => {
          settings.brokerDebugLogging = value;
          await this.plugin.updateSettings(settings);
        });
      });

    this.renderBrokerConnection(details, settings.brokerGitHubConnection);
  }

  private renderBrokerConnection(container: HTMLElement, connection: BrokerGitHubConnectionState): void {
    new Setting(container)
      .setName("Test Broker Reachability")
      .setDesc(stageDescription("Reachability", connection.reachability))
      .addButton((button) => {
        button
          .setButtonText("Test Broker Reachability")
          .setCta()
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText("Checking...");
            const refreshInterval = window.setInterval(() => this.display(), 1000);
            try {
              await this.plugin.testBrokerReachability();
            } finally {
              window.clearInterval(refreshInterval);
              this.display();
            }
          });
      });

    new Setting(container)
      .setName("Start Auth Flow")
      .setDesc(stageDescription("Auth start", connection.authStart))
      .addButton((button) => {
        button
          .setButtonText("Start Auth Flow")
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText("Starting...");
            const refreshInterval = window.setInterval(() => this.display(), 1000);
            try {
              await this.plugin.startBrokerAuthFlow();
            } finally {
              window.clearInterval(refreshInterval);
              this.display();
            }
          });
      });

    new Setting(container)
      .setName("Complete GitHub Authentication")
      .setDesc("Not implemented yet. This future stage will complete a real GitHub App authentication handshake after the broker lifecycle is stable.")
      .addButton((button) => {
        button
          .setButtonText("Later")
          .setDisabled(true);
      });

    new Setting(container)
      .setName("Broker connection summary")
      .setDesc(brokerStatusDescription(connection));
  }
}

function brokerStatusDescription(connection: BrokerGitHubConnectionState): string {
  const status = statusLabel(connection);
  const details: string[] = [`Status: ${status}`];

  if (connection.reachability) details.push(`Reachability: ${stageInlineSummary(connection.reachability)}`);
  if (connection.authStart) details.push(`Auth start: ${stageInlineSummary(connection.authStart)}`);
  if (connection.lastError) details.push(`Last error: ${connection.lastError}`);

  return details.join("\n");
}

function stageDescription(label: string, stage: BrokerStageState | undefined): string {
  if (!stage) return `${label}: not run.`;

  const details = [`${label}: ${stageLabel(stage.status)}`];
  if (stage.message) details.push(stage.message);
  if (stage.checkedAt) details.push(`Checked at: ${stage.checkedAt}`);
  if (stage.savedBaseUrl) details.push(`Saved base URL: ${stage.savedBaseUrl}`);
  if (stage.url) details.push(`URL: ${stage.url}`);
  if (stage.method) details.push(`Method: ${stage.method}`);
  if (typeof stage.responseStatus === "number") details.push(`Status: ${stage.responseStatus}`);
  if (stage.parsedResponse) details.push(`Parsed response: ${stage.parsedResponse}`);
  if (stage.responseBody) details.push(`Body: ${stage.responseBody}`);
  return details.join("\n");
}

function stageInlineSummary(stage: BrokerStageState): string {
  return `${stageLabel(stage.status)}${stage.responseStatus ? ` (${stage.responseStatus})` : ""}${stage.message ? ` — ${stage.message}` : ""}`;
}

function stageLabel(status: BrokerStageState["status"]): string {
  switch (status) {
    case "not_run":
      return "Not run";
    case "checking":
      return "Checking";
    case "succeeded":
      return "Succeeded";
    case "not_found":
      return "404 not found";
    case "not_implemented":
      return "501 not implemented";
    case "invalid_response":
      return "Invalid response";
    case "failed":
      return "Failed";
  }
}

function statusLabel(connection: BrokerGitHubConnectionState): string {
  switch (connection.status) {
    case "not_connected":
      return "Not connected";
    case "checking":
      return "Checking";
    case "reachable":
      return "Reachable";
    case "not_found":
      return "Route not found";
    case "invalid_response":
      return "Invalid response";
    case "failed":
      return "Failed";
  }
}
