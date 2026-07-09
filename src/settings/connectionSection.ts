import { Notice, Setting } from "obsidian";
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
  const connectDisabled = effectiveStatus === "connected" || effectiveStatus === "pending" || effectiveStatus === "device_disconnected";
  const disconnectDisabled = effectiveStatus === "not_connected" || effectiveStatus === "device_disconnected";
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
        .setButtonText("Disconnect This Device")
        .setDisabled(disconnectDisabled)
        .onClick(async () => {
          await plugin.disconnectGitHub();
          redisplay();
        });
    });

  if (connection.session?.broker_grant || connection.connection?.broker_grant) {
    new Setting(containerEl)
      .setName("Stored connection")
      .setDesc("Verify the existing broker connection without opening GitHub. Storage note: the broker grant is stored in Obsidian plugin data, not OS secure storage.")
      .addButton((button) => {
        button
          .setButtonText("Verify Connection")
          .onClick(async () => {
            await plugin.refreshStoredGitHubConnection();
            redisplay();
          });
      });
  }

  if (connection.connection?.installation.id) {
    new Setting(containerEl)
      .setName("GitHub access")
      .setDesc("Manage repository access in GitHub. This is separate from reconnecting Squido.")
      .addButton((button) => {
        button
          .setButtonText("Manage GitHub Access")
          .onClick(() => {
            plugin.manageGitHubAccess();
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

    const setupFlow = currentSetupFlow(connection);
    containerEl.createEl("p", {
      text: `Waiting for GitHub to complete setup. Squido is polling the broker and will expire this bootstrap/repair flow at ${setupFlow?.expires_at ?? "unknown"}.`,
    });
    containerEl.createEl("p", {
      text: "GitHub setup is only for first install or repair. Normal reconnect uses Verify Connection and should not open GitHub.",
    });

    renderPendingDiagnostics(containerEl, settings);
  }

  if (effectiveStatus === "expired") {
    containerEl.createEl("p", {
      text: "Connection did not complete. Try again.",
    });
    containerEl.createEl("p", {
      text: "GitHub setup may not return to Squido if the app was already installed and no repository-access changes were saved. Use Verify Connection for normal reconnect.",
    });
  }

  if (effectiveStatus === "failed") {
    containerEl.createEl("p", {
      text: connection.last_error
        ? `The GitHub connection failed: ${connection.last_error}`
        : "The GitHub connection failed. Start a new connection attempt or disconnect to clear the local state.",
    });
  }

  if (effectiveStatus === "device_disconnected") {
    containerEl.createEl("p", {
      text: "This device is disconnected. The GitHub App installation was not removed.",
    });
    containerEl.createEl("p", {
      text: "A future repair/reauthorization flow will reconnect this device to the existing installation without requiring repository-access changes.",
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
      ["Connection ID", connection.connection.connection_id ?? "not returned"],
      ["Connection status", connection.connection.connection_status ?? "active"],
      ["Device/session ID", connection.device?.device_session_id ?? settings.githubAppConnection.device_session_id ?? connection.connection.device_session_id ?? "not generated"],
      ["Device status", connection.device?.status ?? "active"],
      ["Session status", connection.session?.status ?? "active"],
      ["Session expires", connection.session?.expires_at ?? "not returned"],
      ["Session last verified", connection.session?.last_verified_at ?? connection.last_verified_at ?? "not verified this session"],
      ["Account", connection.connection.account?.login ?? connection.connection.installation.account_login ?? "not returned"],
      ["Account ID", connection.connection.account?.id ?? "not returned"],
      ["Account type", connection.connection.account?.type ?? "not returned"],
      ["Installation ID", connection.connection.installation.id],
      ["Installation manage URL", connection.connection.installation.manage_url ?? connection.connection.installation.html_url ?? "not returned"],
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

function renderPendingDiagnostics(containerEl: HTMLElement, settings: SquidoSettings): void {
  const connection = settings.githubAppConnection;
  const setupFlow = currentSetupFlow(connection);
  const rows: Array<[string, string]> = [
    ["Device/session ID", connection.device?.device_session_id ?? connection.device_session_id ?? "not generated"],
    ["Connection ID", connection.connection?.connection_id ?? "not connected"],
    ["Session status", connection.session?.status ?? "not active"],
    ["Flow ID", setupFlow?.flow_id ?? "not set"],
    ["Status URL", connection.last_status_url ?? statusUrlFor(settings)],
    ["Last checked", setupFlow?.last_status_checked_at ?? connection.last_status_checked_at ?? "not checked yet"],
    ["Last result", setupFlow?.last_status_result ?? connection.last_status_result ?? "not checked yet"],
    ["Expires at", setupFlow?.expires_at ?? "not set"],
    ["Auth URL", setupFlow?.auth_url ?? "not set"],
  ];

  containerEl.createEl("h4", { text: "Pending diagnostics" });

  for (const [label, value] of rows) {
    new Setting(containerEl)
      .setName(label)
      .setDesc(value)
      .addButton((button) => {
        button
          .setButtonText("Copy")
          .onClick(async () => {
            await copyToClipboard(value);
          });
      });
  }

  new Setting(containerEl)
    .setName("Copy full pending debug")
    .setDesc("Copies flow id, status URL, auth URL, timestamps, and last broker status.")
    .addButton((button) => {
      button
        .setButtonText("Copy debug")
        .onClick(async () => {
          await copyToClipboard(JSON.stringify(Object.fromEntries(rows), null, 2));
        });
    });
}

async function copyToClipboard(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    new Notice("Copied.");
  } catch {
    new Notice("Could not copy to clipboard.");
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
    case "device_disconnected":
      return "This device is disconnected";
    case "expired":
      return "Expired";
    case "failed":
      return "Failed";
  }
}

function effectiveConnectionStatus(settings: SquidoSettings): GitHubAppConnectionStatus {
  const connection = settings.githubAppConnection;
  if (connection.status === "pending" && isPendingConnectionExpiredOrInvalid(connection)) {
    return "expired";
  }

  return connection.status;
}

function shouldAutoRefreshPendingConnection(settings: SquidoSettings): boolean {
  const connection = settings.githubAppConnection;
  if (connection.status !== "pending") return false;
  if (!connection.flow_id || isPendingConnectionExpiredOrInvalid(connection)) return false;
  if (!connection.last_status_checked_at) return true;

  const checkedAt = Date.parse(connection.last_status_checked_at);
  if (!Number.isFinite(checkedAt)) return true;

  return Date.now() - checkedAt > 3000;
}

function isPendingConnectionExpiredOrInvalid(connection: SquidoSettings["githubAppConnection"]): boolean {
  const setupFlow = currentSetupFlow(connection);
  if (!setupFlow?.expires_at) return true;
  const expiresAt = Date.parse(setupFlow.expires_at);
  return !Number.isFinite(expiresAt) || Date.now() > expiresAt;
}

function statusUrlFor(settings: SquidoSettings): string {
  const baseUrl = settings.authBrokerBaseUrl.trim().replace(/\/+$/g, "");
  const flowId = currentSetupFlow(settings.githubAppConnection)?.flow_id ?? settings.githubAppConnection.flow_id;
  if (!baseUrl || !flowId) return "not available";

  return `${baseUrl}/auth/github/status?flow_id=${encodeURIComponent(flowId)}`;
}

function currentSetupFlow(connection: SquidoSettings["githubAppConnection"]): SquidoSettings["githubAppConnection"]["setupFlow"] {
  if (connection.setupFlow) return connection.setupFlow;
  if (
    typeof connection.flow_id === "string" &&
    typeof connection.auth_url === "string" &&
    typeof connection.expires_at === "string" &&
    typeof connection.poll_interval_seconds === "number" &&
    typeof connection.started_at === "string"
  ) {
    return {
      flow_id: connection.flow_id,
      auth_url: connection.auth_url,
      expires_at: connection.expires_at,
      poll_interval_seconds: connection.poll_interval_seconds,
      started_at: connection.started_at,
      completed_at: connection.completed_at,
      last_status_checked_at: connection.last_status_checked_at,
      last_status_url: connection.last_status_url,
      last_status_result: connection.last_status_result,
    };
  }

  return undefined;
}

function connectButtonLabel(status: GitHubAppConnectionStatus): string {
  switch (status) {
    case "pending":
      return "Connecting…";
    case "connected":
      return "Connected";
    case "device_disconnected":
      return "Reconnect unavailable";
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
    case "device_disconnected":
      return "gray";
    case "not_connected":
      return "gray";
  }
}
