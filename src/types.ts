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

