import type { PublishManifest, PublishManifestEntry, SquidoData, SquidoSettings } from "../types";

export const DEFAULT_SETTINGS: SquidoSettings = {
  githubToken: "",
  owner: "",
  repo: "",
  branch: "main",
  targetFolder: "",
  commitMessageTemplate: "publish {{title}}",
  authBrokerBaseUrl: "https://auth.jondeleonmedia.com",
  githubAppConnection: {
    status: "not_connected",
  },
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
    const settings = { ...DEFAULT_SETTINGS, ...stored?.settings };
    settings.githubAppConnection = normalizeGitHubAppConnectionState(settings.githubAppConnection);
    this.data = {
      settings,
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

function normalizeGitHubAppConnectionState(
  connection: SquidoSettings["githubAppConnection"],
): SquidoSettings["githubAppConnection"] {
  const legacyFlowId = connection.flow_id;
  const legacyDeviceId = (connection as { device_id?: unknown }).device_id;
  const deviceSessionId = connection.device_session_id ?? (typeof legacyDeviceId === "string" ? legacyDeviceId : undefined);
  const legacyConnectionDeviceId = connection.connection
    ? (connection.connection as unknown as { device_id?: unknown }).device_id
    : undefined;
  const nestedDeviceSessionId = connection.device?.device_session_id;
  const effectiveDeviceSessionId = nestedDeviceSessionId ?? deviceSessionId;
  const legacyBrokerGrant = connection.connection?.broker_grant;
  const setupFlow = connection.setupFlow ??
    (typeof legacyFlowId === "string" &&
      typeof connection.auth_url === "string" &&
      typeof connection.expires_at === "string" &&
      typeof connection.poll_interval_seconds === "number" &&
      typeof connection.started_at === "string"
      ? {
          flow_id: legacyFlowId,
          auth_url: connection.auth_url,
          expires_at: connection.expires_at,
          poll_interval_seconds: connection.poll_interval_seconds,
          started_at: connection.started_at,
          completed_at: connection.completed_at,
          last_status_checked_at: connection.last_status_checked_at,
          last_status_url: connection.last_status_url,
          last_status_result: connection.last_status_result,
        }
      : undefined);

  return {
    ...connection,
    setupFlow,
    device: effectiveDeviceSessionId
      ? {
          ...connection.device,
          device_session_id: effectiveDeviceSessionId,
          last_verified_at: connection.device?.last_verified_at ?? connection.last_verified_at,
        }
      : connection.device,
    session: connection.session ?? (legacyBrokerGrant
      ? {
          broker_grant: legacyBrokerGrant,
          status: connection.status === "connected" ? "active" : undefined,
          last_verified_at: connection.last_verified_at,
        }
      : undefined),
    device_session_id: effectiveDeviceSessionId,
    connection: connection.connection
      ? {
          ...connection.connection,
          device_session_id: connection.connection.device_session_id ??
            (typeof legacyConnectionDeviceId === "string"
              ? legacyConnectionDeviceId
              : effectiveDeviceSessionId),
        }
      : undefined,
  };
}
