export type PublishStatus =
  | "unpublished"
  | "published"
  | "changed"
  | "deleted"
  | "error";

export interface SquidoSettings {
  githubToken: string;
  owner: string;
  repo: string;
  branch: string;
  targetFolder: string;
  commitMessageTemplate: string;
  authBrokerBaseUrl: string;
  githubAppConnection: GitHubAppConnectionState;
}

export type GitHubAppConnectionStatus =
  | "not_connected"
  | "pending"
  | "connected"
  | "expired"
  | "failed";

export interface GitHubAppConnectionMetadata {
  provider: "github";
  account?: {
    login?: string;
    id?: string;
    type?: string;
  };
  installation: {
    id: string;
    account_login?: string;
    setup_action?: string;
  };
  connected_at: string;
}

export interface GitHubAppConnectionState {
  status: GitHubAppConnectionStatus;
  flow_id?: string;
  auth_url?: string;
  expires_at?: string;
  poll_interval_seconds?: number;
  started_at?: string;
  completed_at?: string;
  last_error?: string;
  connection?: GitHubAppConnectionMetadata;
}

export interface BuildInfo {
  plugin: string;
  version: string;
  branch: string;
  commit: string;
  shortCommit: string;
  builtAt: string;
  dirty: boolean;
  release: boolean;
  defaultBrokerUrl?: string;
}

export interface PublishManifestEntry {
  localNotePath: string;
  targetRepoPath: string;
  publishedUrl?: string;
  lastPublishedHash: string;
  lastPublishedAt: string;
  status: PublishStatus;
}

export type PublishManifest = Record<string, PublishManifestEntry>;

export interface SquidoData {
  settings: SquidoSettings;
  manifest: PublishManifest;
}

export interface PublishRequest {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  content: string;
  message: string;
}

export interface PublishResult {
  publishedUrl?: string;
  commitUrl?: string;
}
