import { Notice, Plugin, TFile } from "obsidian";
import { BrokerAuthClient, type GitHubAuthStatusResponse } from "./brokerAuthClient";
import { FileEventHandler } from "./fileEvents";
import { GitHubClient } from "./githubClient";
import { ManifestStore } from "./manifestStore";
import { commitMessageFor, Publisher } from "./publisher";
import { SquidoSettingTab } from "./settings";
import { PublishStatusService } from "./status";
import type { BuildInfo, GitHubAppConnectionState, SquidoData, SquidoSettings } from "./types";
import { PublishModal } from "./ui/PublishModal";
import { SquidoStatusBar } from "./ui/StatusBar";

export default class SquidoPlugin extends Plugin {
  private manifestStore!: ManifestStore;
  private publisher!: Publisher;
  private statusService!: PublishStatusService;
  private statusBar!: SquidoStatusBar;
  private fileEvents!: FileEventHandler;
  private buildInfo: BuildInfo | null = null;
  private activeConnectionPoll: number | null = null;
  private connectionStateChangeHandler: (() => void) | null = null;

  async onload(): Promise<void> {
    this.manifestStore = new ManifestStore(
      () => this.loadData() as Promise<unknown>,
      (data: SquidoData) => this.saveData(data),
    );
    await this.manifestStore.initialize();
    this.buildInfo = await this.loadBuildInfo();

    const githubClient = new GitHubClient(() => this.manifestStore.getSettings().githubToken);
    this.publisher = new Publisher(this.app.vault, this.manifestStore, githubClient);
    this.statusService = new PublishStatusService(this.app.vault, this.manifestStore);
    this.statusBar = new SquidoStatusBar(this.addStatusBarItem());
    this.fileEvents = new FileEventHandler(
      this.app.vault,
      this.manifestStore,
      this.publisher,
      (file) => void this.refreshStatus(file),
    );

    this.addSettingTab(new SquidoSettingTab(this.app, this));
    this.addCommand({
      id: "publish-current-note",
      name: "Publish current note",
      checkCallback: (checking) => {
        const canPublish = this.currentMarkdownFile() !== null;
        if (canPublish && !checking) void this.publishCurrentNote();
        return canPublish;
      },
    });
    this.addRibbonIcon("upload", "Publish current note", () => void this.publishCurrentNote());
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => void this.refreshStatus()));
    this.fileEvents.start();
    this.resumePendingGitHubConnection();
    await this.refreshStatus();
  }

  onunload(): void {
    this.stopGitHubConnectionPolling();
    this.fileEvents.stop();
  }

  getSettings(): SquidoSettings {
    return this.manifestStore.getSettings();
  }

  async updateSettings(settings: SquidoSettings): Promise<void> {
    await this.manifestStore.updateSettings(settings);
  }

  getBuildInfo(): BuildInfo | null {
    return this.buildInfo;
  }

  setConnectionStateChangeHandler(handler: (() => void) | null): void {
    this.connectionStateChangeHandler = handler;
  }

  async connectGitHub(): Promise<void> {
    const settings = this.manifestStore.getSettings();
    if (settings.githubAppConnection.status === "pending") {
      new Notice("GitHub connection is already pending.");
      return;
    }

    const client = new BrokerAuthClient(settings.authBrokerBaseUrl);

    try {
      const start = await client.startGitHubAuth(this.manifest.version);
      await this.updateGitHubConnectionState({
        status: "pending",
        flow_id: start.flow_id,
        auth_url: start.auth_url,
        expires_at: start.expires_at,
        poll_interval_seconds: start.poll_interval_seconds,
        started_at: new Date().toISOString(),
        last_error: undefined,
        connection: undefined,
      });

      window.open(start.auth_url, "_blank");
      this.startGitHubConnectionPolling(start.flow_id, start.poll_interval_seconds, start.expires_at);
      new Notice("GitHub connection started. Complete installation in the browser.", 8000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start GitHub connection.";
      await this.updateGitHubConnectionState({
        status: "failed",
        last_error: message,
      });
      new Notice(message, 10000);
    }
  }

  async disconnectGitHub(): Promise<void> {
    this.stopGitHubConnectionPolling();
    await this.updateGitHubConnectionState({
      status: "not_connected",
      flow_id: undefined,
      auth_url: undefined,
      expires_at: undefined,
      poll_interval_seconds: undefined,
      started_at: undefined,
      completed_at: undefined,
      last_error: undefined,
      connection: undefined,
    });
    new Notice("GitHub connection cleared locally.");
  }

  private async publishCurrentNote(): Promise<void> {
    const file = this.currentMarkdownFile();
    if (!file) {
      new Notice("Open a Markdown note before publishing.");
      return;
    }

    const settings = this.manifestStore.getSettings();
    const defaultMessage = commitMessageFor(file, settings.commitMessageTemplate);
    const targetPath = this.publisher.targetPathForFile(file, settings);
    const destination = `${settings.owner || "<owner>"}/${settings.repo || "<repo>"}@${settings.branch || "<branch>"}:${targetPath}`;
    const message = await new PublishModal(this.app, file, destination, defaultMessage).openAndWait();
    if (!message) return;

    try {
      const result = await this.publisher.publish(file, message);
      new Notice(result.publishedUrl ? "Note published to GitHub." : "Note published.");
    } catch (error) {
      await this.manifestStore.markStatus(file.path, "error");
      new Notice(error instanceof Error ? error.message : "Squido could not publish the note.", 8000);
    }
    await this.refreshStatus(file);
  }

  private currentMarkdownFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    return file?.extension === "md" ? file : null;
  }

  private async refreshStatus(file = this.currentMarkdownFile() ?? undefined): Promise<void> {
    if (!file) {
      this.statusBar.clear();
      return;
    }
    this.statusBar.setStatus(await this.statusService.statusFor(file));
  }

  private startGitHubConnectionPolling(flowId: string, pollIntervalSeconds: number, expiresAt: string): void {
    this.stopGitHubConnectionPolling();
    const intervalMs = Math.max(1, pollIntervalSeconds) * 1000;
    const poll = () => void this.pollGitHubConnection(flowId, expiresAt);
    poll();
    this.activeConnectionPoll = window.setInterval(poll, intervalMs);
    this.registerInterval(this.activeConnectionPoll);
  }

  private stopGitHubConnectionPolling(): void {
    if (this.activeConnectionPoll === null) return;
    window.clearInterval(this.activeConnectionPoll);
    this.activeConnectionPoll = null;
  }

  private async pollGitHubConnection(flowId: string, expiresAt: string): Promise<void> {
    if (Date.now() > Date.parse(expiresAt)) {
      this.stopGitHubConnectionPolling();
      await this.updateGitHubConnectionState({
        status: "expired",
        last_error: "GitHub connection flow expired.",
      });
      return;
    }

    const settings = this.manifestStore.getSettings();
    const client = new BrokerAuthClient(settings.authBrokerBaseUrl);

    try {
      const status = await client.getGitHubAuthStatus(flowId);
      await this.applyGitHubConnectionStatus(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not check GitHub connection status.";
      this.stopGitHubConnectionPolling();
      await this.updateGitHubConnectionState({
        status: "failed",
        last_error: message,
      });
    }
  }

  private async applyGitHubConnectionStatus(status: GitHubAuthStatusResponse): Promise<void> {
    switch (status.status) {
      case "pending":
        await this.updateGitHubConnectionState({
          status: "pending",
          flow_id: status.flow_id,
          expires_at: status.expires_at,
          poll_interval_seconds: status.poll_interval_seconds,
        });
        return;
      case "completed":
        this.stopGitHubConnectionPolling();
        await this.updateGitHubConnectionState({
          status: "connected",
          flow_id: status.flow_id,
          expires_at: status.expires_at,
          completed_at: new Date().toISOString(),
          connection: status.connection,
          last_error: undefined,
        });
        new Notice("GitHub connected.", 8000);
        return;
      case "expired":
        this.stopGitHubConnectionPolling();
        await this.updateGitHubConnectionState({
          status: "expired",
          flow_id: status.flow_id,
          expires_at: status.expires_at,
          last_error: "GitHub connection flow expired.",
        });
        return;
      case "failed":
        this.stopGitHubConnectionPolling();
        await this.updateGitHubConnectionState({
          status: "failed",
          flow_id: status.flow_id,
          last_error: status.error,
        });
        return;
    }
  }

  private async updateGitHubConnectionState(connection: Partial<GitHubAppConnectionState>): Promise<void> {
    const settings = this.manifestStore.getSettings();
    await this.manifestStore.updateSettings({
      ...settings,
      githubAppConnection: {
        ...settings.githubAppConnection,
        ...connection,
      },
    });
    this.connectionStateChangeHandler?.();
  }

  private resumePendingGitHubConnection(): void {
    const connection = this.manifestStore.getSettings().githubAppConnection;
    if (connection.status !== "pending" || !connection.flow_id || !connection.expires_at) return;

    if (Date.now() > Date.parse(connection.expires_at)) {
      void this.updateGitHubConnectionState({
        status: "expired",
        last_error: "GitHub connection flow expired.",
      });
      return;
    }

    this.startGitHubConnectionPolling(
      connection.flow_id,
      connection.poll_interval_seconds ?? 2,
      connection.expires_at,
    );
  }

  private async loadBuildInfo(): Promise<BuildInfo | null> {
    const pluginDirectory = this.manifest.dir;
    if (!pluginDirectory) return null;

    const buildInfoPath = `${pluginDirectory}/build-info.json`;
    try {
      if (!await this.app.vault.adapter.exists(buildInfoPath)) return null;
      const parsed = JSON.parse(await this.app.vault.adapter.read(buildInfoPath)) as unknown;
      return isBuildInfo(parsed) && !parsed.release ? parsed : null;
    } catch (error) {
      console.warn("Squido could not read build-info.json", error);
      return null;
    }
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
