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
  | "device_disconnected"
  | "expired"
  | "failed";

export interface GitHubAppConnectionMetadata {
  provider: "github";
  connection_id?: string;
  connection_status?: string;
  broker_grant?: string;
  brokerBaseUrl?: string;
  device_session_id?: string;
  account?: {
    login?: string;
    id?: string;
    type?: string;
  };
  installation: {
    id: string;
    account_login?: string;
    setup_action?: string;
    html_url?: string;
    manage_url?: string;
  };
  connected_at: string;
}

export interface GitHubAppSetupFlowState {
  kind?: "setup" | "repair";
  flow_id: string;
  auth_url: string;
  expires_at: string;
  poll_interval_seconds: number;
  started_at: string;
  completed_at?: string;
  last_status_checked_at?: string;
  last_status_url?: string;
  last_status_result?: string;
}

export interface GitHubAppDeviceState {
  device_session_id: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  last_verified_at?: string;
}

export interface GitHubAppSessionState {
  broker_grant?: string;
  status?: "active" | "expired" | "revoked" | "failed";
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
  last_verified_at?: string;
}

export interface GitHubAppConnectionState {
  status: GitHubAppConnectionStatus;
  setupFlow?: GitHubAppSetupFlowState;
  device?: GitHubAppDeviceState;
  session?: GitHubAppSessionState;
  device_session_id?: string;
  flow_id?: string;
  auth_url?: string;
  expires_at?: string;
  poll_interval_seconds?: number;
  started_at?: string;
  completed_at?: string;
  last_error?: string;
  last_status_checked_at?: string;
  last_status_url?: string;
  last_status_result?: string;
  last_verified_at?: string;
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

export interface BuildInfoDiagnostics {
  path?: string;
  status: "loaded" | "missing_plugin_directory" | "missing_file" | "invalid_json" | "invalid_shape" | "release_build" | "read_error";
  error?: string;
  rawText?: string;
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
