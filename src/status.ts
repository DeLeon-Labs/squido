import type { Vault, TFile } from "obsidian";
import type { ManifestStore } from "./manifestStore";
import type { PublishStatus } from "./types";

export class PublishStatusService {
  constructor(
    private readonly vault: Vault,
    private readonly manifestStore: ManifestStore,
  ) {}

  async statusFor(file: TFile): Promise<PublishStatus> {
    const entry = this.manifestStore.get(file.path);
    if (!entry) return "unpublished";
    if (entry.status === "deleted" || entry.status === "error") return entry.status;

    const content = await this.vault.cachedRead(file);
    const hash = await hashContent(content);
    const status = hash === entry.lastPublishedHash ? "published" : "changed";
    await this.manifestStore.markStatus(file.path, status);
    return status;
  }
}

export async function hashContent(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

