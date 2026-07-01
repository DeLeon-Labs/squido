import { PluginSettingTab, Setting, type App } from "obsidian";
import type SquidoPlugin from "./main";
import type { BuildInfo, SquidoSettings } from "./types";

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
    this.plugin.setConnectionStateChangeHandler(() => this.display());
    containerEl.createEl("h2", { text: "Squido settings" });
    containerEl.createEl("p", {
      text: "Connect GitHub App authentication for future connection-based publishing, or use the advanced manual token fallback for the current alpha publisher.",
    });

    const settings = this.plugin.getSettings();

    this.renderGitHubAppConnection(settings);

    containerEl.createEl("h3", { text: "Advanced manual publishing" });
    containerEl.createEl("p", {
      text: "Manual personal access token publishing remains available for alpha testing and recovery. It is separate from the GitHub App connection flow.",
    });
    this.textSetting(settings, "GitHub token", "A token with Contents write access to the destination repository.", "githubToken", true);
    this.textSetting(settings, "Owner or organization", "The GitHub account that owns the repository.", "owner");
    this.textSetting(settings, "Repository", "Repository name without the owner.", "repo");
    this.textSetting(settings, "Branch", "Branch to publish to.", "branch");
    this.textSetting(settings, "Target folder", "Optional repository folder. The note filename is appended.", "targetFolder");
    this.textSetting(settings, "Default commit message", "Use {{title}} to insert the note title.", "commitMessageTemplate");

    const buildInfo = this.plugin.getBuildInfo();
    if (buildInfo) this.renderDeveloperSection(buildInfo);
  }

  private renderGitHubAppConnection(settings: SquidoSettings): void {
    this.containerEl.createEl("h3", { text: "GitHub App connection" });
    this.containerEl.createEl("p", {
      text: "Connect GitHub through the Squido auth broker. This proves the trust flow only; publishing still uses the advanced manual settings for now.",
    });

    this.textSetting(
      settings,
      "Auth broker URL",
      "Product-controlled broker URL used to start and poll the GitHub App connection flow.",
      "authBrokerBaseUrl",
    );

    const connection = settings.githubAppConnection;
    const statusText = statusLabel(connection.status);
    new Setting(this.containerEl)
      .setName("Connection status")
      .setDesc(connection.last_error ? `${statusText}: ${connection.last_error}` : statusText)
      .addButton((button) => {
        button
          .setButtonText(connection.status === "pending" ? "Connecting…" : "Connect GitHub")
          .setCta()
          .setDisabled(connection.status === "pending")
          .onClick(async () => {
            await this.plugin.connectGitHub();
            this.display();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("Disconnect")
          .setDisabled(connection.status === "not_connected")
          .onClick(async () => {
            await this.plugin.disconnectGitHub();
            this.display();
          });
      });

    if (connection.status === "pending") {
      this.containerEl.createEl("p", {
        text: `Pending GitHub installation flow. Expires at ${connection.expires_at ?? "unknown"}.`,
      });
    }

    if (connection.status === "connected" && connection.connection) {
      const details = this.containerEl.createEl("details");
      details.createEl("summary", { text: "Connected GitHub metadata" });
      details.createEl("p", {
        text: "Squido stores only non-sensitive connection metadata locally for this MVP.",
      });

      const rows = [
        ["Provider", connection.connection.provider],
        ["Account", connection.connection.account?.login ?? connection.connection.installation.account_login ?? "not returned"],
        ["Account ID", connection.connection.account?.id ?? "not returned"],
        ["Installation ID", connection.connection.installation.id],
        ["Setup action", connection.connection.installation.setup_action ?? "not returned"],
        ["Connected at", connection.connection.connected_at],
      ];

      const list = details.createEl("dl");
      for (const [label, value] of rows) {
        list.createEl("dt", { text: label });
        list.createEl("dd", { text: value });
      }
    }
  }

  private textSetting(
    settings: SquidoSettings,
    name: string,
    description: string,
    key: TextSettingKey,
    password = false,
  ): void {
    new Setting(this.containerEl)
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

  private renderDeveloperSection(buildInfo: BuildInfo): void {
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
      ["Build default broker URL", buildInfo.defaultBrokerUrl ?? "not set"],
    ];

    const list = details.createEl("dl", { cls: "squido-build-info" });
    for (const [label, value] of rows) {
      list.createEl("dt", { text: label });
      list.createEl("dd", { text: value });
    }
  }
}

function statusLabel(status: SquidoSettings["githubAppConnection"]["status"]): string {
  switch (status) {
    case "not_connected":
      return "Not connected";
    case "pending":
      return "Pending";
    case "connected":
      return "Connected";
    case "expired":
      return "Expired";
    case "failed":
      return "Failed";
  }
}
