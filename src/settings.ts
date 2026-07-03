import { PluginSettingTab, Setting, type App } from "obsidian";
import type SquidoPlugin from "./main";
import type { BuildInfo, GitHubAppConnectionStatus, SquidoSettings } from "./types";

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
    const effectiveStatus = effectiveConnectionStatus(settings);
    const statusText = statusLabel(effectiveStatus);
    const connectDisabled = effectiveStatus === "connected" || effectiveStatus === "pending";
    const disconnectDisabled = effectiveStatus === "not_connected";
    const statusDescription = connection.last_error ? `${statusText}: ${connection.last_error}` : statusText;

    this.renderConnectionIndicator(effectiveStatus, statusDescription);

    new Setting(this.containerEl)
      .setName("Connection status")
      .setDesc(statusDescription)
      .addButton((button) => {
        button
          .setButtonText(connectButtonLabel(effectiveStatus))
          .setCta()
          .setDisabled(connectDisabled)
          .onClick(async () => {
            await this.plugin.connectGitHub();
            this.display();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("Disconnect")
          .setDisabled(disconnectDisabled)
          .onClick(async () => {
            await this.plugin.disconnectGitHub();
            this.display();
          });
      });

    if (connection.connection?.broker_grant) {
      new Setting(this.containerEl)
        .setName("Stored connection")
        .setDesc("Verify the existing broker connection without opening GitHub. Alpha note: the broker grant is stored in Obsidian plugin data until secure storage is added.")
        .addButton((button) => {
          button
            .setButtonText("Verify connection")
            .onClick(async () => {
              await this.plugin.refreshStoredGitHubConnection();
              this.display();
            });
        });
    }

    if (effectiveStatus === "pending") {
      if (shouldAutoRefreshPendingConnection(settings)) {
        void this.plugin.refreshGitHubConnectionStatus({ showNotice: false });
      }

      new Setting(this.containerEl)
        .setName("Pending connection tools")
        .setDesc("Use these if GitHub was already installed, mobile returned to Obsidian, or polling has not updated yet.")
        .addButton((button) => {
          button
            .setButtonText("Check status now")
            .onClick(async () => {
              await this.plugin.refreshGitHubConnectionStatus();
              this.display();
            });
        })
        .addButton((button) => {
          button
            .setButtonText("Open GitHub again")
            .onClick(() => {
              this.plugin.reopenGitHubConnectionUrl();
            });
        })
        .addButton((button) => {
          button
            .setButtonText("Clear pending")
            .onClick(async () => {
              await this.plugin.clearPendingGitHubConnection();
              this.display();
            });
        });

      this.containerEl.createEl("p", {
        text: `Waiting for GitHub to complete connection. Squido is polling the broker and will expire this flow at ${connection.expires_at ?? "unknown"}.`,
      });
      this.containerEl.createEl("p", {
        text: "If the app is already installed and you make no repository-access changes, GitHub may not return to Squido automatically. Open GitHub again and click Save/Update if shown, or clear this pending flow and retry from Squido.",
      });

      const pendingDetails = this.containerEl.createEl("details");
      pendingDetails.createEl("summary", { text: "Pending diagnostics" });
      const rows = [
        ["Flow ID", connection.flow_id ?? "not set"],
        ["Status URL", connection.last_status_url ?? statusUrlFor(settings)],
        ["Last checked", connection.last_status_checked_at ?? "not checked yet"],
        ["Last result", connection.last_status_result ?? "not checked yet"],
        ["Auth URL", connection.auth_url ?? "not set"],
      ];
      const list = pendingDetails.createEl("dl");
      for (const [label, value] of rows) {
        list.createEl("dt", { text: label });
        list.createEl("dd", { text: value });
      }
    }

    if (effectiveStatus === "expired") {
      this.containerEl.createEl("p", {
        text: "Connection did not complete. Try again.",
      });
      this.containerEl.createEl("p", {
        text: "GitHub may not have returned to Squido. This can happen if the app was already installed and no repository-access changes were saved.",
      });
    }

    if (effectiveStatus === "failed") {
      this.containerEl.createEl("p", {
        text: connection.last_error
          ? `The GitHub connection failed: ${connection.last_error}`
          : "The GitHub connection failed. Start a new connection attempt or disconnect to clear the local state.",
      });
    }

    if (effectiveStatus === "connected" && connection.connection) {
      const details = this.containerEl.createEl("details");
      details.createEl("summary", { text: "Connected GitHub metadata" });
      details.createEl("p", {
        text: "Squido stores only non-sensitive connection metadata locally for this MVP.",
      });

      const rows = [
        ["Broker URL", connection.connection.brokerBaseUrl ?? settings.authBrokerBaseUrl],
        ["Provider", connection.connection.provider],
        ["Account", connection.connection.account?.login ?? connection.connection.installation.account_login ?? "not returned"],
        ["Account ID", connection.connection.account?.id ?? "not returned"],
        ["Installation ID", connection.connection.installation.id],
        ["Setup action", connection.connection.installation.setup_action ?? "not returned"],
        ["Connected at", connection.connection.connected_at],
        ["Last verified", connection.last_verified_at ?? "not verified this session"],
        ["Connection ID", connection.connection.connection_id ?? "not returned"],
      ];

      const list = details.createEl("dl");
      for (const [label, value] of rows) {
        list.createEl("dt", { text: label });
        list.createEl("dd", { text: value });
      }
    }
  }

  private renderConnectionIndicator(status: GitHubAppConnectionStatus, label: string): void {
    const indicator = this.containerEl.createDiv({
      cls: `squido-connection-indicator squido-connection-indicator-${indicatorColor(status)}`,
    });
    indicator.createSpan({
      cls: "squido-connection-dot",
      attr: { "aria-hidden": "true" },
    });
    indicator.createSpan({
      cls: "squido-connection-label",
      text: label,
    });
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

function effectiveConnectionStatus(settings: SquidoSettings): GitHubAppConnectionStatus {
  const connection = settings.githubAppConnection;
  if (connection.status === "pending" && connection.expires_at && Date.now() > Date.parse(connection.expires_at)) {
    return "expired";
  }

  return connection.status;
}

function shouldAutoRefreshPendingConnection(settings: SquidoSettings): boolean {
  const connection = settings.githubAppConnection;
  if (connection.status !== "pending") return false;
  if (!connection.flow_id || !connection.expires_at) return false;
  if (connection.expires_at && Date.now() > Date.parse(connection.expires_at)) return false;
  if (!connection.last_status_checked_at) return true;

  const checkedAt = Date.parse(connection.last_status_checked_at);
  if (!Number.isFinite(checkedAt)) return true;

  return Date.now() - checkedAt > 3000;
}

function statusUrlFor(settings: SquidoSettings): string {
  const baseUrl = settings.authBrokerBaseUrl.trim().replace(/\/+$/g, "");
  const flowId = settings.githubAppConnection.flow_id;
  if (!baseUrl || !flowId) return "not available";

  return `${baseUrl}/auth/github/status?flow_id=${encodeURIComponent(flowId)}`;
}

function connectButtonLabel(status: GitHubAppConnectionStatus): string {
  switch (status) {
    case "pending":
      return "Connecting…";
    case "connected":
      return "Connected";
    case "expired":
    case "failed":
      return "Reconnect GitHub";
    default:
      return "Connect GitHub";
  }
}

function indicatorColor(status: GitHubAppConnectionStatus): "gray" | "green" | "yellow" | "red" {
  switch (status) {
    case "connected":
      return "green";
    case "pending":
      return "yellow";
    case "failed":
    case "expired":
      return "red";
    case "not_connected":
      return "gray";
  }
}
