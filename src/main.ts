import { Notice, Plugin, TFile } from "obsidian";
import { FileEventHandler } from "./fileEvents";
import { GitHubClient } from "./githubClient";
import { GitHubDeviceAuth } from "./githubDeviceAuth";
import { ManifestStore } from "./manifestStore";
import { commitMessageFor, Publisher } from "./publisher";
import { SecureCredentialStore } from "./secureCredentialStore";
import { SquidoSettingTab } from "./settings";
import { PublishStatusService } from "./status";
import type { SquidoData, SquidoSettings } from "./types";
import { PublishModal } from "./ui/PublishModal";
import { SquidoStatusBar } from "./ui/StatusBar";

export default class SquidoPlugin extends Plugin {
  private manifestStore!: ManifestStore;
  private publisher!: Publisher;
  private statusService!: PublishStatusService;
  private statusBar!: SquidoStatusBar;
  private fileEvents!: FileEventHandler;
  private deviceAuth = new GitHubDeviceAuth();
  private deviceFlowRunId = 0;
  private credentialStore!: SecureCredentialStore;

  async onload(): Promise<void> {
    this.manifestStore = new ManifestStore(
      () => this.loadData() as Promise<unknown>,
      (data: SquidoData) => this.saveData(data),
    );
    await this.manifestStore.initialize();
    this.credentialStore = new SecureCredentialStore(this.manifestStore);

    const githubClient = new GitHubClient(() => this.getGitHubAccessToken());
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
    await this.refreshStatus();
  }

  onunload(): void {
    this.fileEvents.stop();
  }

  getSettings(): SquidoSettings {
    return this.manifestStore.getSettings();
  }

  async updateSettings(settings: SquidoSettings): Promise<void> {
    await this.manifestStore.updateSettings(settings);
  }

  secureCredentialStatus(): string {
    return this.credentialStore.description();
  }

  async storeManualGitHubToken(token: string): Promise<void> {
    await this.storeGitHubAccessToken(token, "manual", "", "");
    new Notice("GitHub token stored in secure local storage.");
  }

  async startGitHubDeviceFlow(onUpdate?: () => void): Promise<void> {
    const settings = this.manifestStore.getSettings();
    const clientId = settings.githubOAuthClientId.trim();
    if (!clientId) {
      new Notice("Add a GitHub OAuth Client ID before connecting.");
      return;
    }

    const runId = ++this.deviceFlowRunId;
    const scope = settings.githubOAuthScopes.trim();

    try {
      await this.updateSettings({
        ...settings,
        githubDeviceStatus: "Requesting a GitHub device code.",
      });
      onUpdate?.();

      const deviceCode = await this.deviceAuth.requestDeviceCode(clientId, scope);
      const expiresAt = Date.now() + deviceCode.expiresIn * 1000;
      await this.updateSettings({
        ...this.manifestStore.getSettings(),
        githubDeviceUserCode: deviceCode.userCode,
        githubDeviceVerificationUri: deviceCode.verificationUri,
        githubDeviceExpiresAt: new Date(expiresAt).toISOString(),
        githubDeviceStatus: `Enter code ${deviceCode.userCode} at GitHub to finish connecting.`,
      });
      onUpdate?.();

      window.open(deviceCode.verificationUri);
      new Notice(`GitHub login opened. Enter code ${deviceCode.userCode}.`, 10000);

      const token = await this.deviceAuth.pollForToken(
        clientId,
        deviceCode.deviceCode,
        expiresAt,
        deviceCode.interval,
        async (progress) => {
          if (runId !== this.deviceFlowRunId) return;
          await this.updateSettings({
            ...this.manifestStore.getSettings(),
            githubDeviceStatus: progress.message,
          });
          onUpdate?.();
        },
      );
      if (runId !== this.deviceFlowRunId) return;

      const user = await this.deviceAuth.validateUser(token.accessToken);
      await this.storeGitHubAccessToken(token.accessToken, "device-flow", user.login, token.scope);
      await this.updateSettings({
        ...this.manifestStore.getSettings(),
        githubDeviceUserCode: "",
        githubDeviceVerificationUri: "",
        githubDeviceExpiresAt: "",
        githubDeviceStatus: `Connected as ${user.login}.`,
      });
      onUpdate?.();
      new Notice(`GitHub connected as ${user.login}.`);
    } catch (error) {
      if (runId !== this.deviceFlowRunId) return;
      const message = error instanceof Error ? error.message : "GitHub Device Flow failed.";
      await this.updateSettings({
        ...this.manifestStore.getSettings(),
        githubDeviceStatus: message,
      });
      onUpdate?.();
      new Notice(message, 10000);
    }
  }

  async disconnectGitHub(): Promise<void> {
    this.deviceFlowRunId += 1;
    const settings = this.manifestStore.getSettings();
    await this.credentialStore.delete(settings.githubCredentialKey);
    await this.updateSettings({
      ...settings,
      githubTokenSource: "manual",
      hasGitHubCredential: false,
      githubUserLogin: "",
      githubTokenScopes: "",
      githubDeviceUserCode: "",
      githubDeviceVerificationUri: "",
      githubDeviceExpiresAt: "",
      githubDeviceStatus: "Disconnected from GitHub.",
    });
  }

  private getGitHubAccessToken(): Promise<string> {
    return Promise.resolve(this.credentialStore.get(this.manifestStore.getSettings().githubCredentialKey));
  }

  private async storeGitHubAccessToken(
    token: string,
    source: SquidoSettings["githubTokenSource"],
    userLogin: string,
    scopes: string,
  ): Promise<void> {
    const trimmed = token.trim();
    if (!trimmed) throw new Error("Cannot store an empty GitHub token.");

    const settings = this.manifestStore.getSettings();
    await this.credentialStore.store(settings.githubCredentialKey, trimmed);
    await this.updateSettings({
      ...this.manifestStore.getSettings(),
      hasGitHubCredential: true,
      githubTokenSource: source,
      githubUserLogin: userLogin,
      githubTokenScopes: scopes,
    });
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
}
