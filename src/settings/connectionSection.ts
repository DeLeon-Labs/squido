import { Setting } from "obsidian";
import type SquidoPlugin from "../main";
import type { GitHubAppConnectionStatus, SquidoSettings } from "../types";
import { renderTextSetting } from "./textSetting";

export function renderConnectionSection(
  containerEl: HTMLElement,
  plugin: SquidoPlugin,
  settings: SquidoSettings,
  redisplay: () => void,
): void {
  containerEl.createEl("h3", { text: "GitHub App connection" });
  containerEl.createEl("p", {
    text: "Connect GitHub through the Squido auth broker. This proves the trust flow only; publishing still uses the advanced manual settings for now.",
  });

  renderTextSetting(
    containerEl,
    plugin,
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

  renderConnectionIndicator(containerEl, effectiveStatus, statusDescription);

  new Setting(containerEl)
    .setName("Connection status")
    .setDesc(statusDescription)
    .addButton((button) => {
      button
        .setButtonText(connectButtonLabel(effectiveStatus))
        .setCta()
        .setDisabled(connectDisabled)
        .onClick(async () => {
          await plugin.connectGitHub();
          redisplay();
        });
    })
    .addButton((button) => {
      button
        .setButtonText("Disconnect")
        .setDisabled(disconnectDisabled)
        .onClick(async () => {
          await plugin.disconnectGitHub();
          redisplay();
        });
    });

  if (connection.connection?.broker_grant) {
    new Setting(containerEl)
      .setName("Stored connection")
      .setDesc("Verify the existing broker connection without opening GitHub. Alpha note: the broker grant is stored in Obsidian plugin data until secure storage is added.")
      .addButton((button) => {
        button
          .setButtonText("Verify connection")
          .onClick(async () => {
            await plugin.refreshStoredGitHubConnection();
            redisplay();
          });
      });
  }

  if (effectiveStatus === "pending") {
    if (shouldAutoRefreshPendingConnection(settings)) {
      void plugin.refreshGitHubConnectionStatus({ showNotice: false });
    }

    new Setting(containerEl)
      .setName("Pending connection tools")
      .setDesc("Use these if GitHub was already installed, mobile returned to Obsidian, or polling has not updated yet.")
      .addButton((button) => {
        button
          .setButtonText("Check status now")
          .onClick(async () => {
            await plugin.refreshGitHubConnectionStatus();
            redisplay();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("Open GitHub again")
          .onClick(() => {
            plugin.reopenGitHubConnectionUrl();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("Clear pending")
          .onClick(async () => {
            await plugin.clearPendingGitHubConnection();
            redisplay();
          });
      });

    containerEl.createEl("p", {
      text: `Waiting for GitHub to complete connection. Squido is polling the broker and will expire this flow at ${connection.expires_at ?? "unknown"}.`,
    });
    containerEl.createEl("p", {
      text: "If the app is already installed and you make no repository-access changes, GitHub may not return to Squido automatically. Open GitHub again and click Save/Update if shown, or clear this pending flow and retry from Squido.",
    });

    const pendingDetails = containerEl.createEl("details");
    pendingDetails.createEl("summary", { text: "Pending diagnostics" });
    const rows = [
      ["Device/session ID", connection.device_id ?? "not generated"],
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
    containerEl.createEl("p", {
      text: "Connection did not complete. Try again.",
    });
    containerEl.createEl("p", {
      text: "GitHub may not have returned to Squido. This can happen if the app was already installed and no repository-access changes were saved.",
    });
  }

  if (effectiveStatus === "failed") {
    containerEl.createEl("p", {
      text: connection.last_error
        ? `The GitHub connection failed: ${connection.last_error}`
        : "The GitHub connection failed. Start a new connection attempt or disconnect to clear the local state.",
    });
  }

  if (effectiveStatus === "connected" && connection.connection) {
    const details = containerEl.createEl("details");
    details.createEl("summary", { text: "Connected GitHub metadata" });
    details.createEl("p", {
      text: "Squido stores only non-sensitive connection metadata locally for this MVP.",
    });

    const rows = [
      ["Broker URL", connection.connection.brokerBaseUrl ?? settings.authBrokerBaseUrl],
      ["Provider", connection.connection.provider],
      ["Device/session ID", settings.githubAppConnection.device_id ?? connection.connection.device_id ?? "not generated"],
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

function renderConnectionIndicator(containerEl: HTMLElement, status: GitHubAppConnectionStatus, label: string): void {
  const indicator = containerEl.createDiv({
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
