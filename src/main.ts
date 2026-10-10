import { Notice, Plugin, TFile } from "obsidian";
import { GitHubConnectionController } from "./auth/githubConnection";
import { SecretStorageCredentialStore } from "./credentials/secretStorageCredentialStore";
import { GITHUB_PAT_CREDENTIAL } from "./credentials/credentialStore";
import { loadBuildInfo } from "./diagnostics/buildInfo";
import { FileEventHandler } from "./fileEvents";
import { GitHubClient } from "./githubClient";
import { DestinationDiscovery } from "./destinationDiscovery";
import { ManifestStore } from "./storage/manifestStore";
import { commitMessageFor, Publisher } from "./publisher";
import { SquidoSettingTab } from "./settings/settingsTab";
import { PublishStatusService } from "./status";
import type { BuildInfo, BuildInfoDiagnostics, SquidoData, SquidoSettings } from "./types";
import { PublishModal } from "./ui/PublishModal";
import { SquidoStatusBar } from "./ui/StatusBar";
import { SETUP_VIEW_TYPE, SetupView } from "./ui/SetupView";
import type { ConnectionMode } from "./types";

export default class SquidoPlugin extends Plugin {
  private credentialStore!: SecretStorageCredentialStore;
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
    this.credentialStore = new SecretStorageCredentialStore(this.manifestStore, this.app.secretStorage);
    try {
      await this.credentialStore.migrateLegacy();
    } catch {
      new Notice("Squido could not migrate or access SecretStorage. Publishing and connection setup are disabled; legacy credentials were not erased. Check this device's secrets and reload Squido.", 12000);
      throw new Error("Squido SecretStorage initialization failed.");
    }
    const buildInfoResult = await loadBuildInfo(this.app, this.manifest.dir);
    this.buildInfo = buildInfoResult.buildInfo;
    this.buildInfoDiagnostics = buildInfoResult.diagnostics;

    const githubClient = new GitHubClient(async () => await this.credentialStore.get(GITHUB_PAT_CREDENTIAL) ?? "");
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
      credentialStore: this.credentialStore,
      pluginVersion: this.manifest.version,
      isDevelopmentBuild: () => this.isDevelopmentBuild(),
      registerInterval: (id) => this.registerInterval(id),
      onStateChange: () => {
        this.connectionStateChangeHandler?.();
        for (const leaf of this.app.workspace.getLeavesOfType(SETUP_VIEW_TYPE)) {
          if (leaf.view instanceof SetupView) leaf.view.render();
        }
      },
    });

    this.addSettingTab(new SquidoSettingTab(this.app, this));
    this.registerView(SETUP_VIEW_TYPE, (leaf) => new SetupView(leaf, this));
    this.addCommand({ id: "open-setup", name: "Open Welcome / Setup", callback: () => void this.openSetup() });
    if (!this.getSettings().setupSelectionMade) this.app.workspace.onLayoutReady(() => void this.openSetup());
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
    this.registerDomEvent(window, "focus", () => {
      if (this.brokerEnabled()) void this.githubConnection.refreshPending();
    });
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState === "visible" && this.brokerEnabled()) void this.githubConnection.refreshPending();
    });
    this.fileEvents.start();
    if (this.brokerEnabled()) {
      void this.githubConnection.refreshStored({ showNotice: false });
      this.githubConnection.resumePending();
    }
    await this.refreshStatus();
  }

  onunload(): void {
    this.githubConnection?.stopPolling();
    this.fileEvents?.stop();
  }

  getSettings(): SquidoSettings {
    return this.manifestStore.getSettings();
  }

  getDestinationDiscovery(): DestinationDiscovery {
    return new DestinationDiscovery(() => this.getSettings().connectionMode,
      () => this.credentialStore.get(GITHUB_PAT_CREDENTIAL));
  }

  async updateSettings(settings: SquidoSettings): Promise<void> {
    await this.manifestStore.updateSettings(settings);
  }

  async saveGitHubPat(value: string): Promise<void> {
    await this.credentialStore.set(GITHUB_PAT_CREDENTIAL, value.trim());
  }

  async forgetGitHubPat(): Promise<void> {
    await this.credentialStore.delete(GITHUB_PAT_CREDENTIAL);
  }

  private brokerEnabled(): boolean { return this.getSettings().connectionMode === "broker"; }

  async selectConnectionMode(mode: ConnectionMode): Promise<void> {
    if (mode !== "broker" && mode !== "pat") throw new Error("Invalid connection mode.");
    // Quiesce in-flight requests before committing PAT mode; no broker operation may start afterward.
    await this.githubConnection.quiesce();
    try {
      await this.updateSettings({ ...this.getSettings(), connectionMode: mode, setupSelectionMade: true });
    } finally {
      if (this.brokerEnabled()) this.githubConnection.resumeBroker();
    }
  }

  async openSetup(): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType(SETUP_VIEW_TYPE)[0] ?? this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: SETUP_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
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
    if (!this.brokerEnabled()) return;
    await this.githubConnection.connect();
  }

  async disconnectGitHub(): Promise<void> {
    if (!this.brokerEnabled()) return;
    await this.githubConnection.disconnect();
  }

  async reauthorizeGitHubDevice(): Promise<void> {
    if (!this.brokerEnabled()) return;
    await this.githubConnection.reauthorizeDevice();
  }

  async clearPendingGitHubConnection(): Promise<void> {
    if (!this.brokerEnabled()) return;
    await this.githubConnection.clearPending();
  }

  async refreshGitHubConnectionStatus(options: { showNotice?: boolean } = { showNotice: true }): Promise<void> {
    if (!this.brokerEnabled()) return;
    await this.githubConnection.refreshStatus(options);
  }

  async refreshStoredGitHubConnection(options: { showNotice?: boolean } = { showNotice: true }): Promise<void> {
    if (!this.brokerEnabled()) return;
    await this.githubConnection.refreshStored(options);
  }

  reopenGitHubConnectionUrl(): void {
    if (!this.brokerEnabled()) return;
    this.githubConnection.reopenUrl();
  }

  manageGitHubAccess(): void {
    if (!this.brokerEnabled()) return;
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
