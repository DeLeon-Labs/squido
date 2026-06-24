import type { EventRef, TAbstractFile, TFile, Vault } from "obsidian";
import type { ManifestStore } from "./manifestStore";
import type { Publisher } from "./publisher";

export class FileEventHandler {
  private eventRefs: EventRef[] = [];

  constructor(
    private readonly vault: Vault,
    private readonly manifestStore: ManifestStore,
    private readonly publisher: Publisher,
    private readonly onStatusChange: (file?: TFile) => void,
  ) {}

  start(): void {
    this.eventRefs.push(
      this.vault.on("rename", (file, oldPath) => void this.handleRename(file, oldPath)),
      this.vault.on("delete", (file) => void this.handleDelete(file)),
      this.vault.on("modify", (file) => void this.handleModify(file)),
    );
  }

  stop(): void {
    for (const eventRef of this.eventRefs) this.vault.offref(eventRef);
    this.eventRefs = [];
  }

  private async handleRename(file: TAbstractFile, oldPath: string): Promise<void> {
    if (!isMarkdownFile(file)) return;
    await this.manifestStore.move(oldPath, file.path, this.publisher.targetPathForFile(file));
    this.onStatusChange(file);
  }

  private async handleDelete(file: TAbstractFile): Promise<void> {
    if (!isMarkdownFile(file)) return;
    await this.manifestStore.markStatus(file.path, "deleted");
    this.onStatusChange();
  }

  private async handleModify(file: TAbstractFile): Promise<void> {
    if (!isMarkdownFile(file) || !this.manifestStore.get(file.path)) return;
    await this.manifestStore.markStatus(file.path, "changed");
    this.onStatusChange(file);
  }
}

function isMarkdownFile(file: TAbstractFile): file is TFile {
  return "extension" in file && file.extension === "md";
}

