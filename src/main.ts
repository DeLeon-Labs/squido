import { Notice, Plugin, TFile } from "obsidian";
import { GitHubConnectionController } from "./auth/githubConnection";
import { PluginDataCredentialStore } from "./credentials/pluginDataCredentialStore";
import { loadBuildInfo } from "./diagnostics/buildInfo";
import { FileEventHandler } from "./fileEvents";
import { GitHubClient } from "./githubClient";
import { ManifestStore } from "./storage/manifestStore";
import { commitMessageFor, Publisher } from "./publisher";
import { SquidoSettingTab } from "./settings/settingsTab";
import { PublishStatusService } from "./status";
import type { BuildInfo, BuildInfoDiagnostics, SquidoData, SquidoSettings } from "./types";
import { PublishModal } from "./ui/PublishModal";
import { SquidoStatusBar } from "./ui/StatusBar";

export default class SquidoPlugin extends Plugin {
  private manifestStore!: ManifestStore;
  private publisher!: Publisher;
  private statusService!: PublishStatusService;
  private statusBar!: SquidoStatusBar;
  private fileEvents!: FileEventHandler;
  private githubConnection!: GitHubConnectionController;
  private buildInfo: BuildInfo | null = null;
  private buildInfoDiagnostics: BuildInfoDiagnostics | null = null;
  private connectionStateChangeHandler: (() => void) | null = null;

  async onload(): Promise<void> {
    this.manifestStore = new ManifestStore(
      () => this.loadData() as Promise<unknown>,
      (data: SquidoData) => this.saveData(data),
    );
    await this.manifestStore.initialize();
    const buildInfoResult = await loadBuildInfo(this.app, this.manifest.dir);
    this.buildInfo = buildInfoResult.buildInfo;
    this.buildInfoDiagnostics = buildInfoResult.diagnostics;

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
    this.githubConnection = new GitHubConnectionController({
      manifestStore: this.manifestStore,
      credentialStore: new PluginDataCredentialStore(this.manifestStore),
      pluginVersion: this.manifest.version,
      isDevelopmentBuild: () => this.isDevelopmentBuild(),
      registerInterval: (id) => this.registerInterval(id),
      onStateChange: () => this.connectionStateChangeHandler?.(),
    });

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
    this.registerDomEvent(window, "focus", () => void this.githubConnection.refreshPending());
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") void this.githubConnection.refreshPending();
    });
    this.fileEvents.start();
    void this.githubConnection.refreshStored({ showNotice: false });
    this.githubConnection.resumePending();
    await this.refreshStatus();
  }

  onunload(): void {
    this.githubConnection.stopPolling();
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

  getBuildInfoDiagnostics(): BuildInfoDiagnostics | null {
    return this.buildInfoDiagnostics;
  }

  setConnectionStateChangeHandler(handler: (() => void) | null): void {
    this.connectionStateChangeHandler = handler;
  }

  async connectGitHub(): Promise<void> {
    await this.githubConnection.connect();
  }

  async disconnectGitHub(): Promise<void> {
    await this.githubConnection.disconnect();
  }

  async clearPendingGitHubConnection(): Promise<void> {
    await this.githubConnection.clearPending();
  }

  async refreshGitHubConnectionStatus(options: { showNotice?: boolean } = { showNotice: true }): Promise<void> {
    await this.githubConnection.refreshStatus(options);
  }

  async refreshStoredGitHubConnection(options: { showNotice?: boolean } = { showNotice: true }): Promise<void> {
    await this.githubConnection.refreshStored(options);
  }

  reopenGitHubConnectionUrl(): void {
    this.githubConnection.reopenUrl();
  }

  manageGitHubAccess(): void {
    this.githubConnection.manageAccess();
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

  private isDevelopmentBuild(): boolean {
    return this.buildInfo !== null;
  }
}
