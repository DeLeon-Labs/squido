import { Notice, Plugin, TFile } from "obsidian";
import { BrokerAuthClient, type BrokerTestResult } from "./brokerAuthClient";
import { FileEventHandler } from "./fileEvents";
import { GitHubClient } from "./githubClient";
import { ManifestStore } from "./manifestStore";
import { commitMessageFor, Publisher } from "./publisher";
import { SquidoSettingTab } from "./settings";
import { PublishStatusService } from "./status";
import type { BrokerGitHubConnectionState, BrokerStageState, BuildInfo, SquidoData, SquidoSettings } from "./types";
import { PublishModal } from "./ui/PublishModal";
import { SquidoStatusBar } from "./ui/StatusBar";

export default class SquidoPlugin extends Plugin {
  private manifestStore!: ManifestStore;
  private publisher!: Publisher;
  private statusService!: PublishStatusService;
  private statusBar!: SquidoStatusBar;
  private fileEvents!: FileEventHandler;
  private buildInfo: BuildInfo | null = null;

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

  getBuildInfo(): BuildInfo | null {
    return this.buildInfo;
  }

  async testBrokerReachability(): Promise<void> {
    const settings = this.manifestStore.getSettings();
    if (settings.brokerGitHubConnection.status === "checking") {
      new Notice("Broker test is already in progress.");
      return;
    }

    const brokerClient = new BrokerAuthClient(
      settings.authBrokerBaseUrl,
      settings.brokerDebugLogging
        ? (message, details) => console.log(message, details)
        : undefined,
    );

    try {
      await this.updateBrokerState({
        status: "checking",
        reachability: {
          status: "checking",
        },
      });

      const result = await brokerClient.testReachability();
      console.log("Squido broker reachability debug", debugDetailsForBrokerTest(result));
      const stage = stageStateForBrokerTest(result);
      await this.updateBrokerState({
        status: result.kind === "reachable" ? "reachable" : statusForBrokerTest(result),
        reachability: stage,
      });
      new Notice(noticeForBrokerTest("Broker reachability", result), 12000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Broker reachability check failed.";
      await this.updateBrokerState({
        status: "failed",
        lastError: message,
        reachability: {
          status: "failed",
          message,
        },
      });
      new Notice(message, 8000);
    }
  }

  async startBrokerAuthFlow(): Promise<void> {
    const settings = this.manifestStore.getSettings();
    if (settings.brokerGitHubConnection.status === "checking") {
      new Notice("Broker test is already in progress.");
      return;
    }

    const brokerClient = new BrokerAuthClient(
      settings.authBrokerBaseUrl,
      settings.brokerDebugLogging
        ? (message, details) => console.log(message, details)
        : undefined,
    );

    try {
      await this.updateBrokerState({
        status: "checking",
        authStart: {
          status: "checking",
        },
      });

      const result = await brokerClient.startAuthFlow();
      console.log("Squido broker auth start debug", debugDetailsForBrokerTest(result));
      const stage = stageStateForBrokerTest(result);
      await this.updateBrokerState({
        status: statusFromStages(this.manifestStore.getSettings().brokerGitHubConnection.reachability, stage),
        authStart: stage,
      });
      new Notice(noticeForBrokerTest("Start auth flow", result), 12000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Broker auth start failed.";
      await this.updateBrokerState({
        status: "failed",
        lastError: message,
        authStart: {
          status: "failed",
          message,
        },
      });
      new Notice(message, 8000);
    }
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

  private async updateBrokerState(connection: Partial<BrokerGitHubConnectionState>): Promise<void> {
    const settings = this.manifestStore.getSettings();
    const current = settings.brokerGitHubConnection;
    await this.manifestStore.updateSettings({
      ...settings,
      brokerGitHubConnection: {
        ...current,
        ...connection,
      },
    });
  }
}

function stageStateForBrokerTest(result: BrokerTestResult): BrokerStageState {
  const checkedAt = new Date().toISOString();
  return {
    status: stageStatusForBrokerTest(result),
    checkedAt,
    savedBaseUrl: result.savedBaseUrl,
    url: result.url,
    method: result.method,
    responseStatus: result.status,
    responseBody: result.body,
    parsedResponse: stringifyParsed(result.parsed),
    message: messageForBrokerTest(result),
  };
}

function stageStatusForBrokerTest(result: BrokerTestResult): BrokerStageState["status"] {
  switch (result.kind) {
    case "not_found":
      return "not_found";
    case "not_implemented":
      return "not_implemented";
    case "invalid_response":
      return "invalid_response";
    case "reachable":
      return "succeeded";
    case "network_failure":
    case "http_error":
      return "failed";
  }
}

function statusForBrokerTest(result: BrokerTestResult): BrokerGitHubConnectionState["status"] {
  switch (result.kind) {
    case "reachable":
      return "reachable";
    case "not_found":
      return "not_found";
    case "invalid_response":
      return "invalid_response";
    case "not_implemented":
    case "network_failure":
    case "http_error":
      return "failed";
  }
}

function statusFromStages(reachability: BrokerStageState | undefined, authStart: BrokerStageState): BrokerGitHubConnectionState["status"] {
  if (authStart.status === "succeeded") return "reachable";
  if (authStart.status === "not_implemented") return "reachable";
  if (authStart.status === "not_found") return "not_found";
  if (authStart.status === "invalid_response") return "invalid_response";
  if (reachability?.status === "succeeded") return "reachable";
  return "failed";
}

function noticeForBrokerTest(label: string, result: BrokerTestResult): string {
  return [
    `${label}: ${messageForBrokerTest(result)}`,
    `Base: ${result.savedBaseUrl}`,
    `URL: ${result.url}`,
    `Method: ${result.method}`,
    `Status: ${result.status ?? "none"}`,
    `Parsed/error: ${stringifyParsed(result.parsed) ?? result.error ?? "none"}`,
  ].join("\n");
}

function messageForBrokerTest(result: BrokerTestResult): string {
  const route = result.stage === "reachability" ? "/health" : "/auth/github/start";
  switch (result.kind) {
    case "reachable":
      return result.stage === "reachability" ? "Broker reachable" : "Auth flow started";
    case "invalid_response":
      return `Broker ${route} returned 200, but the response shape was not expected.`;
    case "not_found":
      return `Broker ${route} returned 404. Check the saved broker base URL.`;
    case "not_implemented":
      return `Broker ${route} returned 501 Not Implemented.`;
    case "network_failure":
      return `Broker ${route} network failure: ${result.error ?? "unknown error"}`;
    case "http_error":
      return `Broker ${route} returned HTTP ${result.status}.`;
  }
}

function debugDetailsForBrokerTest(result: BrokerTestResult): Record<string, unknown> {
  return {
    stage: result.stage,
    savedBrokerBaseUrl: result.savedBaseUrl,
    url: result.url,
    method: result.method,
    status: result.status,
    body: result.body,
    parsed: result.parsed,
    error: result.error,
    kind: result.kind,
  };
}

function stringifyParsed(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
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
