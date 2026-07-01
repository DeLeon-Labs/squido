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
  brokerDebugLogging: boolean;
  brokerGitHubConnection: BrokerGitHubConnectionState;
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

export type BrokerStageStatus =
  | "not_run"
  | "checking"
  | "succeeded"
  | "not_found"
  | "not_implemented"
  | "invalid_response"
  | "failed";

export interface BrokerStageState {
  status: BrokerStageStatus;
  checkedAt?: string;
  savedBaseUrl?: string;
  url?: string;
  method?: "GET" | "POST";
  responseStatus?: number;
  responseBody?: string;
  parsedResponse?: string;
  message?: string;
}

export type BrokerGitHubConnectionStatus =
  | "not_connected"
  | "checking"
  | "reachable"
  | "not_found"
  | "invalid_response"
  | "failed";

export interface BrokerGitHubConnectionState {
  status: BrokerGitHubConnectionStatus;
  lastError?: string;
  reachability?: BrokerStageState;
  authStart?: BrokerStageState;
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
