import type { PublishManifest, PublishManifestEntry, SquidoData, SquidoSettings } from "./types";

export const DEFAULT_SETTINGS: SquidoSettings = {
  githubToken: "",
  owner: "",
  repo: "",
  branch: "main",
  targetFolder: "",
  commitMessageTemplate: "publish {{title}}",
};

export class ManifestStore {
  private data: SquidoData = {
    settings: { ...DEFAULT_SETTINGS },
    manifest: {},
  };

  constructor(
    private readonly load: () => Promise<unknown>,
    private readonly save: (data: SquidoData) => Promise<void>,
  ) {}

  async initialize(): Promise<void> {
    const stored = (await this.load()) as Partial<SquidoData> | null;
    this.data = {
      settings: { ...DEFAULT_SETTINGS, ...stored?.settings },
      manifest: { ...stored?.manifest },
    };
  }

  getSettings(): SquidoSettings {
    return { ...this.data.settings };
  }

  async updateSettings(settings: SquidoSettings): Promise<void> {
    this.data.settings = { ...settings };
    await this.persist();
  }

  get(localNotePath: string): PublishManifestEntry | undefined {
    const entry = this.data.manifest[localNotePath];
    return entry ? { ...entry } : undefined;
  }

  getAll(): PublishManifest {
    return structuredClone(this.data.manifest);
  }

  async set(entry: PublishManifestEntry): Promise<void> {
    this.data.manifest[entry.localNotePath] = { ...entry };
    await this.persist();
  }

  async move(oldPath: string, newPath: string, targetRepoPath: string): Promise<void> {
    const entry = this.data.manifest[oldPath];
    if (!entry) return;

    delete this.data.manifest[oldPath];
    this.data.manifest[newPath] = {
      ...entry,
      localNotePath: newPath,
      targetRepoPath,
      status: "changed",
    };
    await this.persist();
  }

  async markStatus(localNotePath: string, status: PublishManifestEntry["status"]): Promise<void> {
    const entry = this.data.manifest[localNotePath];
    if (!entry || entry.status === status) return;
    entry.status = status;
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.save(structuredClone(this.data));
  }
}

