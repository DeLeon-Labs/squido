import { normalizePath, type TFile, type Vault } from "obsidian";
import type { GitHubClient } from "./githubClient";
import type { ManifestStore } from "./manifestStore";
import { hashContent } from "./status";
import type { PublishResult, SquidoSettings } from "./types";

export class Publisher {
  constructor(
    private readonly vault: Vault,
    private readonly manifestStore: ManifestStore,
    private readonly githubClient: GitHubClient,
  ) {}

  async publish(file: TFile, commitMessage: string): Promise<PublishResult> {
    const settings = this.manifestStore.getSettings();
    validateSettings(settings);

    const content = await this.vault.cachedRead(file);
    const targetRepoPath = this.targetPathForFile(file, settings);
    const result = await this.githubClient.publishFile({
      owner: settings.owner.trim(),
      repo: settings.repo.trim(),
      branch: settings.branch.trim(),
      path: targetRepoPath,
      content,
      message: commitMessage.trim(),
    });

    await this.manifestStore.set({
      localNotePath: file.path,
      targetRepoPath,
      publishedUrl: result.publishedUrl,
      lastPublishedHash: await hashContent(content),
      lastPublishedAt: new Date().toISOString(),
      status: "published",
    });
    return result;
  }

  targetPathForFile(file: TFile, settings = this.manifestStore.getSettings()): string {
    const folder = settings.targetFolder.trim().replace(/^\/+|\/+$/g, "");
    return normalizePath(folder ? `${folder}/${file.name}` : file.name);
  }
}

export function commitMessageFor(file: TFile, template: string): string {
  return template.replaceAll("{{title}}", file.basename);
}

function validateSettings(settings: SquidoSettings): void {
  const required: Array<[string, string]> = [
    ["GitHub token", settings.githubToken],
    ["owner or organization", settings.owner],
    ["repository", settings.repo],
    ["branch", settings.branch],
  ];
  const missing = required.filter(([, value]) => !value.trim()).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Complete the Squido settings first: ${missing.join(", ")}.`);
  }
}
