import { Notice } from "obsidian";
import { BrokerAuthClient, type GitHubAuthStatusResponse } from "./brokerAuthClient";
import { GITHUB_BROKER_GRANT_CREDENTIAL, type CredentialStore } from "../credentials/credentialStore";
import type { ManifestStore } from "../storage/manifestStore";
import type { GitHubAppConnectionMetadata, GitHubAppConnectionState } from "../types";

export interface GitHubConnectionControllerOptions {
  manifestStore: ManifestStore;
  credentialStore: CredentialStore;
  pluginVersion: string;
  isDevelopmentBuild: () => boolean;
  registerInterval: (id: number) => void;
  onStateChange: () => void;
}

export class GitHubConnectionController {
  private activeConnectionPoll: number | null = null;

  constructor(private readonly options: GitHubConnectionControllerOptions) {}

  async connect(): Promise<void> {
    let settings = this.options.manifestStore.getSettings();
    if (settings.githubAppConnection.status === "connected") {
      new Notice("GitHub is already connected.");
      return;
    }

    if (settings.githubAppConnection.status === "device_disconnected") {
      new Notice("This device is disconnected. Reauthorization for an existing GitHub App installation is a future repair flow.", 12000);
      return;
    }

    if (await this.verifyStored({ showNotice: true })) {
      return;
    }

    settings = this.options.manifestStore.getSettings();
    if (hasLocalBrokerSession(settings.githubAppConnection)) {
      new Notice("Stored GitHub session could not be verified. Use Connect GitHub again only if this device needs repair.", 10000);
      return;
    }

    if (isPendingConnectionActive(settings.githubAppConnection)) {
      new Notice("GitHub connection is already pending.");
      return;
    }

    if (settings.githubAppConnection.status === "pending") {
      this.stopPolling();
      await this.updateState({
        status: "expired",
        last_error: "GitHub connection flow expired or has invalid pending metadata.",
      });
    }

    const deviceSessionId = await this.getOrCreateDeviceSessionId();
    const client = this.createClient(settings.authBrokerBaseUrl);

    try {
      const start = await client.startGitHubAuth(this.options.pluginVersion, deviceSessionId);
      await this.updateState({
        status: "pending",
        setupFlow: {
          flow_id: start.flow_id,
          auth_url: start.auth_url,
          expires_at: start.expires_at,
          poll_interval_seconds: start.poll_interval_seconds,
          started_at: new Date().toISOString(),
        },
        device_session_id: deviceSessionId,
        device: {
          ...settings.githubAppConnection.device,
          device_session_id: deviceSessionId,
        },
        flow_id: start.flow_id,
        auth_url: start.auth_url,
        expires_at: start.expires_at,
        poll_interval_seconds: start.poll_interval_seconds,
        started_at: new Date().toISOString(),
        last_error: undefined,
        last_status_checked_at: undefined,
        last_status_url: undefined,
        last_status_result: undefined,
      });

      window.open(start.auth_url, "_blank");
      this.startPolling(start.flow_id, start.poll_interval_seconds, start.expires_at);
      new Notice("GitHub connection started. Complete installation in the browser.", 8000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start GitHub connection.";
      await this.updateState({
        status: "failed",
        last_error: message,
      });
      new Notice(message, 10000);
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    const settings = this.options.manifestStore.getSettings();
    const connection = settings.githubAppConnection.connection;
    const brokerGrant = await this.options.credentialStore.get(GITHUB_BROKER_GRANT_CREDENTIAL);
    let revokeWarning: string | null = null;

    if (brokerGrant) {
      try {
        const client = this.createClient(connection?.brokerBaseUrl ?? settings.authBrokerBaseUrl);
        const revocation = await client.revokeGitHubConnection(brokerGrant, settings.githubAppConnection.device_session_id);
        if (revocation.status === "failed") {
          revokeWarning = revocation.error ?? "Broker grant revocation failed.";
        }
      } catch (error) {
        revokeWarning = error instanceof Error ? error.message : "Broker grant revocation failed.";
      }
    }

    await this.options.credentialStore.delete(GITHUB_BROKER_GRANT_CREDENTIAL);
    await this.updateState({
      status: connection ? "device_disconnected" : "not_connected",
      device_session_id: settings.githubAppConnection.device_session_id,
      device: settings.githubAppConnection.device
        ? {
            ...settings.githubAppConnection.device,
            status: "revoked",
            updated_at: new Date().toISOString(),
          }
        : undefined,
      session: {
        ...settings.githubAppConnection.session,
        broker_grant: undefined,
        status: "revoked",
        updated_at: new Date().toISOString(),
      },
      setupFlow: undefined,
      flow_id: undefined,
      auth_url: undefined,
      expires_at: undefined,
      poll_interval_seconds: undefined,
      started_at: undefined,
      completed_at: undefined,
      last_error: undefined,
      last_status_checked_at: undefined,
      last_status_url: undefined,
      last_status_result: undefined,
      connection,
    });
    if (revokeWarning) {
      new Notice(`This device was disconnected locally. Broker revoke warning: ${revokeWarning}`, 12000);
      return;
    }

    new Notice(connection
      ? "This device was disconnected. The GitHub App installation was not removed."
      : "GitHub connection cleared locally.");
  }

  async clearPending(): Promise<void> {
    const status = this.options.manifestStore.getSettings().githubAppConnection.status;
    if (status !== "pending" && status !== "expired" && status !== "failed") {
      new Notice("There is no pending GitHub connection to clear.");
      return;
    }

    this.stopPolling();
    const settings = this.options.manifestStore.getSettings();
    await this.updateState({
      status: settings.githubAppConnection.connection ? "connected" : "not_connected",
      setupFlow: undefined,
      flow_id: undefined,
      auth_url: undefined,
      expires_at: undefined,
      poll_interval_seconds: undefined,
      started_at: undefined,
      completed_at: undefined,
      last_error: undefined,
      last_status_checked_at: undefined,
      last_status_url: undefined,
      last_status_result: undefined,
    });
    new Notice("Pending GitHub setup flow cleared.");
  }

  async refreshStatus(options: { showNotice?: boolean } = { showNotice: true }): Promise<void> {
    await this.refreshPending({ ...options, force: true });
  }

  async refreshStored(options: { showNotice?: boolean } = { showNotice: true }): Promise<void> {
    await this.verifyStored(options);
  }

  reopenUrl(): void {
    const connection = this.options.manifestStore.getSettings().githubAppConnection;
    const setupFlow = currentSetupFlow(connection);
    if (!setupFlow?.auth_url) {
      new Notice("No GitHub connection URL is available. Start a new connection.");
      return;
    }

    window.open(setupFlow.auth_url, "_blank");
    new Notice("Opened the GitHub setup URL.", 6000);
  }

  manageAccess(): void {
    const connection = this.options.manifestStore.getSettings().githubAppConnection.connection;
    const installationId = connection?.installation.id;
    if (!installationId) {
      new Notice("No GitHub installation is available to manage.");
      return;
    }

    const manageUrl = manageUrlForConnection(connection);
    if (!manageUrl) {
      new Notice("No GitHub installation settings URL is available.");
      return;
    }

    window.open(manageUrl, "_blank");
    new Notice("Opened GitHub App installation settings.", 6000);
  }

  async refreshPending(options: { showNotice?: boolean; force?: boolean } = {}): Promise<void> {
    const connection = this.options.manifestStore.getSettings().githubAppConnection;
    const setupFlow = currentSetupFlow(connection);
    const flowId = setupFlow?.flow_id;
    const expiresAt = setupFlow?.expires_at;

    if (connection.status !== "pending") {
      if (options.showNotice) new Notice("No pending GitHub connection to refresh.");
      return;
    }

    if (!flowId || !expiresAt || isTimestampExpiredOrInvalid(expiresAt)) {
      this.stopPolling();
      await this.updateState({
        status: "expired",
        last_error: flowId
          ? "GitHub connection flow expired."
          : "GitHub connection flow has invalid pending metadata.",
      });
      if (options.showNotice) new Notice("GitHub connection flow expired or is invalid.");
      return;
    }

    if (!options.force && !shouldRefreshPendingConnection(connection)) return;

    await this.poll(flowId, expiresAt);

    if (options.showNotice && this.options.manifestStore.getSettings().githubAppConnection.status === "pending") {
      new Notice("GitHub connection is still pending.");
    }
  }

  resumePending(): void {
    const connection = this.options.manifestStore.getSettings().githubAppConnection;
    const setupFlow = currentSetupFlow(connection);
    const flowId = setupFlow?.flow_id;
    const expiresAt = setupFlow?.expires_at;
    if (connection.status !== "pending") return;

    if (!flowId || !expiresAt || isTimestampExpiredOrInvalid(expiresAt)) {
      void this.updateState({
        status: "expired",
        last_error: flowId
          ? "GitHub connection flow expired."
          : "GitHub connection flow has invalid pending metadata.",
      });
      return;
    }

    this.startPolling(
      flowId,
      setupFlow.poll_interval_seconds ?? 2,
      expiresAt,
    );
  }

  stopPolling(): void {
    if (this.activeConnectionPoll === null) return;
    window.clearInterval(this.activeConnectionPoll);
    this.activeConnectionPoll = null;
  }

  private startPolling(flowId: string, pollIntervalSeconds: number, expiresAt: string): void {
    this.stopPolling();
    const intervalMs = Math.max(1, pollIntervalSeconds) * 1000;
    const poll = () => void this.poll(flowId, expiresAt);
    poll();
    this.activeConnectionPoll = window.setInterval(poll, intervalMs);
    this.options.registerInterval(this.activeConnectionPoll);
  }

  private async poll(flowId: string, expiresAt: string): Promise<void> {
    if (isTimestampExpiredOrInvalid(expiresAt)) {
      this.stopPolling();
      await this.updateState({
        status: "expired",
        last_error: "GitHub connection flow expired or has invalid pending metadata.",
      });
      return;
    }

    const settings = this.options.manifestStore.getSettings();
    const client = this.createClient(settings.authBrokerBaseUrl);
    const statusUrl = client.statusUrl(flowId);

    try {
      const status = await client.getGitHubAuthStatus(flowId);
      await this.updateState({
        last_status_checked_at: new Date().toISOString(),
        last_status_url: statusUrl,
        last_status_result: status.status,
        setupFlow: mergeSetupFlow(settings.githubAppConnection, {
          last_status_checked_at: new Date().toISOString(),
          last_status_url: statusUrl,
          last_status_result: status.status,
        }),
        last_error: undefined,
      });
      await this.applyStatus(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not check GitHub connection status.";
      this.stopPolling();
      await this.updateState({
        status: "failed",
        last_error: message,
        last_status_checked_at: new Date().toISOString(),
        last_status_url: statusUrl,
        last_status_result: "error",
        setupFlow: mergeSetupFlow(settings.githubAppConnection, {
          last_status_checked_at: new Date().toISOString(),
          last_status_url: statusUrl,
          last_status_result: "error",
        }),
      });
    }
  }

  private async applyStatus(status: GitHubAuthStatusResponse): Promise<void> {
    switch (status.status) {
      case "pending":
        await this.updateState({
          status: "pending",
          setupFlow: mergeSetupFlow(this.options.manifestStore.getSettings().githubAppConnection, {
            flow_id: status.flow_id,
            expires_at: status.expires_at,
            poll_interval_seconds: status.poll_interval_seconds,
            last_status_result: "pending",
          }),
          flow_id: status.flow_id,
          expires_at: status.expires_at,
          poll_interval_seconds: status.poll_interval_seconds,
          last_status_result: "pending",
        });
        return;
      case "completed":
      case "complete": {
        this.stopPolling();
        const brokerBaseUrl = this.options.manifestStore.getSettings().authBrokerBaseUrl;
        const deviceSessionId = await this.getOrCreateDeviceSessionId();
        const connection = sanitizeGitHubConnectionMetadata(status.connection, brokerBaseUrl, deviceSessionId);
        const brokerGrant = connection.broker_grant;
        await this.updateState({
          status: "connected",
          device_session_id: deviceSessionId,
          device: {
            device_session_id: deviceSessionId,
            status: "active",
            last_verified_at: new Date().toISOString(),
          },
          session: brokerGrant
            ? {
                broker_grant: brokerGrant,
                status: "active",
                last_verified_at: new Date().toISOString(),
              }
            : this.options.manifestStore.getSettings().githubAppConnection.session,
          setupFlow: undefined,
          flow_id: status.flow_id,
          expires_at: status.expires_at,
          completed_at: new Date().toISOString(),
          connection: {
            ...connection,
            broker_grant: undefined,
          },
          last_error: undefined,
          last_status_result: status.status,
        });
        if (brokerGrant) await this.options.credentialStore.set(GITHUB_BROKER_GRANT_CREDENTIAL, brokerGrant);
        new Notice("GitHub connected.", 8000);
        return;
      }
      case "expired":
        this.stopPolling();
        await this.updateState({
          status: "expired",
          setupFlow: mergeSetupFlow(this.options.manifestStore.getSettings().githubAppConnection, {
            flow_id: status.flow_id,
            expires_at: status.expires_at,
            last_status_result: "expired",
          }),
          flow_id: status.flow_id,
          expires_at: status.expires_at,
          last_error: "GitHub connection flow expired.",
          last_status_result: "expired",
        });
        return;
      case "failed":
        this.stopPolling();
        await this.updateState({
          status: "failed",
          setupFlow: mergeSetupFlow(this.options.manifestStore.getSettings().githubAppConnection, {
            flow_id: status.flow_id,
            last_status_result: "failed",
          }),
          flow_id: status.flow_id,
          last_error: status.error,
          last_status_result: "failed",
        });
        return;
    }
  }

  private async verifyStored(options: { showNotice?: boolean } = {}): Promise<boolean> {
    const settings = this.options.manifestStore.getSettings();
    const connection = settings.githubAppConnection.connection;
    const brokerGrant = await this.options.credentialStore.get(GITHUB_BROKER_GRANT_CREDENTIAL);

    if (!brokerGrant) return false;

    const deviceSessionId = await this.getOrCreateDeviceSessionId();
    const client = this.createClient(connection?.brokerBaseUrl ?? settings.authBrokerBaseUrl);

    try {
      const verification = await client.verifyGitHubConnection(brokerGrant, deviceSessionId);

      if (verification.status !== "connected") {
        if (verification.status === "expired" || verification.status === "revoked") {
          const message = verification.error ?? `GitHub connection grant ${verification.status}. Reconnect GitHub.`;
          await this.options.credentialStore.delete(GITHUB_BROKER_GRANT_CREDENTIAL);
          await this.updateState({
            status: verification.status === "expired" ? "expired" : "device_disconnected",
            last_error: message,
            last_verified_at: new Date().toISOString(),
            session: {
              ...settings.githubAppConnection.session,
              broker_grant: undefined,
              status: verification.status,
              last_verified_at: new Date().toISOString(),
            },
            connection: connection
              ? {
                  ...connection,
                  broker_grant: undefined,
                }
              : undefined,
          });
          if (options.showNotice) new Notice(message, 10000);
          return false;
        }

        await this.updateState({
          status: "failed",
          last_error: verification.error,
          last_verified_at: new Date().toISOString(),
        });
        if (options.showNotice) new Notice(`GitHub connection verification failed: ${verification.error}`, 10000);
        return false;
      }

      await this.updateState({
        status: "connected",
        device_session_id: verification.device_session_id ?? deviceSessionId,
        device: verification.device ?? {
          device_session_id: verification.device_session_id ?? deviceSessionId,
          status: "active",
          last_verified_at: verification.verified_at,
        },
        session: {
          ...verification.session,
          broker_grant: verification.broker_grant ?? brokerGrant,
          status: verification.session?.status ?? "active",
          last_verified_at: verification.session?.last_verified_at ?? verification.verified_at,
        },
        setupFlow: undefined,
        completed_at: verification.connected_at,
        last_error: undefined,
        last_verified_at: verification.verified_at,
        connection: sanitizeGitHubConnectionMetadata({
          provider: "github",
          connection_id: verification.connection_id,
          account: verification.account ?? undefined,
          installation: {
            id: String(verification.installation_id),
            setup_action: verification.setup_action ?? undefined,
            html_url: verification.installation?.html_url,
            manage_url: verification.installation?.manage_url,
          },
          connected_at: verification.connected_at,
        }, connection?.brokerBaseUrl ?? settings.authBrokerBaseUrl, verification.device_session_id ?? deviceSessionId),
      });

      if (verification.broker_grant) await this.options.credentialStore.set(GITHUB_BROKER_GRANT_CREDENTIAL, verification.broker_grant);
      if (options.showNotice) new Notice("GitHub connection verified.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub connection verification failed.";
      await this.updateState({
        status: "failed",
        last_error: message,
        last_verified_at: new Date().toISOString(),
      });
      if (options.showNotice) new Notice(message, 10000);
      return false;
    }
  }

  private async updateState(connection: Partial<GitHubAppConnectionState>): Promise<void> {
    const settings = this.options.manifestStore.getSettings();
    await this.options.manifestStore.updateSettings({
      ...settings,
      githubAppConnection: {
        ...settings.githubAppConnection,
        ...connection,
      },
    });
    this.options.onStateChange();
  }

  private createClient(baseUrl: string): BrokerAuthClient {
    return new BrokerAuthClient(baseUrl, this.options.isDevelopmentBuild());
  }

  private async getOrCreateDeviceSessionId(): Promise<string> {
    const settings = this.options.manifestStore.getSettings();
    const existing = settings.githubAppConnection.device?.device_session_id ?? settings.githubAppConnection.device_session_id;
    if (existing) return existing;

    const deviceSessionId = generateDeviceSessionId();
    await this.updateState({
      device_session_id: deviceSessionId,
      device: {
        device_session_id: deviceSessionId,
        status: "active",
        created_at: new Date().toISOString(),
      },
    });
    return deviceSessionId;
  }
}

function sanitizeGitHubConnectionMetadata(
  connection: GitHubAppConnectionMetadata,
  brokerBaseUrl: string,
  deviceSessionId?: string,
): GitHubAppConnectionMetadata {
  return {
    provider: "github",
    connection_id: connection.connection_id,
    broker_grant: connection.broker_grant,
    brokerBaseUrl,
    device_session_id: connection.device_session_id ?? deviceSessionId,
    account: connection.account
      ? {
          login: connection.account.login,
          id: connection.account.id,
          type: connection.account.type,
        }
      : undefined,
    installation: {
      id: connection.installation.id,
      account_login: connection.installation.account_login,
      setup_action: connection.installation.setup_action,
      html_url: connection.installation.html_url,
      manage_url: connection.installation.manage_url,
    },
    connected_at: connection.connected_at,
  };
}

function manageUrlForConnection(connection: GitHubAppConnectionMetadata): string | null {
  const brokerUrl = safeGitHubUrl(connection.installation.manage_url ?? connection.installation.html_url);
  if (brokerUrl) return brokerUrl;

  const installationId = connection.installation.id;
  const accountLogin = connection.account?.login ?? connection.installation.account_login;
  const accountType = connection.account?.type;
  if (!installationId) return null;

  if (accountLogin && accountType === "Organization") {
    return `https://github.com/organizations/${encodeURIComponent(accountLogin)}/settings/installations/${encodeURIComponent(installationId)}`;
  }

  return `https://github.com/settings/installations/${encodeURIComponent(installationId)}`;
}

function safeGitHubUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isConnectionExpired(connection: GitHubAppConnectionState): boolean {
  const setupFlow = currentSetupFlow(connection);
  if (!setupFlow?.expires_at) return true;
  return isTimestampExpiredOrInvalid(setupFlow.expires_at);
}

function isPendingConnectionActive(connection: GitHubAppConnectionState): boolean {
  const setupFlow = currentSetupFlow(connection);
  return connection.status === "pending" && Boolean(setupFlow?.flow_id) && !isConnectionExpired(connection);
}

function isTimestampExpiredOrInvalid(value: string): boolean {
  const timestamp = Date.parse(value);
  return !Number.isFinite(timestamp) || Date.now() > timestamp;
}

function shouldRefreshPendingConnection(connection: GitHubAppConnectionState): boolean {
  const checkedAtValue = currentSetupFlow(connection)?.last_status_checked_at ?? connection.last_status_checked_at;
  if (!checkedAtValue) return true;
  const checkedAt = Date.parse(checkedAtValue);
  if (!Number.isFinite(checkedAt)) return true;

  return Date.now() - checkedAt > 3000;
}

function currentSetupFlow(connection: GitHubAppConnectionState): GitHubAppConnectionState["setupFlow"] {
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

function mergeSetupFlow(
  connection: GitHubAppConnectionState,
  patch: Partial<NonNullable<GitHubAppConnectionState["setupFlow"]>>,
): GitHubAppConnectionState["setupFlow"] {
  const existing = currentSetupFlow(connection);
  if (!existing) return undefined;

  return {
    ...existing,
    ...patch,
  };
}

function hasLocalBrokerSession(connection: GitHubAppConnectionState): boolean {
  return Boolean(
    connection.connection &&
    (connection.device?.device_session_id ?? connection.device_session_id) &&
    (connection.session?.broker_grant ?? connection.connection.broker_grant),
  );
}

function generateDeviceSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
