import type { PublishManifest, PublishManifestEntry, SecureCredentialRecord, SquidoData, SquidoSettings } from "./types";

export const DEFAULT_SETTINGS: SquidoSettings = {
  githubCredentialKey: "github",
  hasGitHubCredential: false,
  githubTokenSource: "manual",
  githubOAuthClientId: "",
  githubOAuthScopes: "repo",
  githubUserLogin: "",
  githubTokenScopes: "",
  githubDeviceUserCode: "",
  githubDeviceVerificationUri: "",
  githubDeviceExpiresAt: "",
  githubDeviceStatus: "",
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
    credentials: {},
  };

  constructor(
    private readonly load: () => Promise<unknown>,
    private readonly save: (data: SquidoData) => Promise<void>,
  ) {}

  async initialize(): Promise<void> {
    const stored = (await this.load()) as Partial<SquidoData> | null;
    const settings = { ...DEFAULT_SETTINGS, ...stored?.settings };
    delete (settings as { githubToken?: string }).githubToken;
    this.data = {
      settings,
      manifest: { ...stored?.manifest },
      credentials: { ...stored?.credentials },
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

  getCredential(key: string): SecureCredentialRecord | undefined {
    const record = this.data.credentials[key];
    return record ? { ...record } : undefined;
  }

  async setCredential(key: string, record: SecureCredentialRecord): Promise<void> {
    this.data.credentials[key] = { ...record };
    await this.persist();
  }

  async deleteCredential(key: string): Promise<void> {
    delete this.data.credentials[key];
    await this.persist();
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
