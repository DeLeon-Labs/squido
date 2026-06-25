export type PublishStatus =
  | "unpublished"
  | "published"
  | "changed"
  | "deleted"
  | "error";

export interface SquidoSettings {
  githubCredentialKey: string;
  hasGitHubCredential: boolean;
  githubTokenSource: "manual" | "device-flow";
  githubOAuthClientId: string;
  githubOAuthScopes: string;
  githubUserLogin: string;
  githubTokenScopes: string;
  githubDeviceUserCode: string;
  githubDeviceVerificationUri: string;
  githubDeviceExpiresAt: string;
  githubDeviceStatus: string;
  owner: string;
  repo: string;
  branch: string;
  targetFolder: string;
  commitMessageTemplate: string;
}

export interface GitHubDeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface GitHubDeviceToken {
  accessToken: string;
  tokenType: string;
  scope: string;
}

export interface GitHubUser {
  login: string;
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
  credentials: SecureCredentialStore;
}

export interface SecureCredentialRecord {
  storage: "electron-safe-storage";
  value: string;
  createdAt: string;
  updatedAt: string;
}

export type SecureCredentialStore = Record<string, SecureCredentialRecord>;

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
