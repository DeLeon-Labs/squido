import { requestUrl } from "obsidian";
import type { ConnectionMode } from "./types";

export interface CurrentDestination { owner: string; repo: string; branch: string; targetFolder: string }
export interface RepositoryChoice { owner: string; name: string; defaultBranch: string }
export const APP_DISCOVERY_UNAVAILABLE = "GitHub App destination discovery is unavailable: this plugin has no authorized installation-token integration. No PAT fallback is used. App publishing remains disabled. Use PAT mode or preserve your manual destination for later.";

/** Discovery never calls the broker, persists tokens, or follows server-provided URLs. */
export class DestinationDiscovery {
  constructor(
    private readonly mode: () => ConnectionMode | undefined,
    private readonly token: () => Promise<string | null>,
    private readonly send: typeof requestUrl = requestUrl,
  ) {}

  async repositories(): Promise<RepositoryChoice[]> {
    const rows = await this.pages("/user/repos?affiliation=owner,collaborator,organization_member&sort=full_name");
    const repositories: RepositoryChoice[] = [];
    for (const row of rows) {
      if (isRecord(row) && isRecord(row.permissions) && row.permissions.push === true && row.archived !== true && row.disabled !== true &&
        isRecord(row.owner) && typeof row.owner.login === "string" && typeof row.name === "string" && typeof row.default_branch === "string") {
        repositories.push({ owner: row.owner.login, name: row.name, defaultBranch: row.default_branch });
      }
    }
    return repositories;
  }

  async branches(destination: CurrentDestination): Promise<string[]> {
    const rows = await this.pages(`${repoEndpoint(destination)}/branches?`);
    return rows.flatMap((row) => isRecord(row) && typeof row.name === "string" ? [row.name] : []);
  }

  async folders(destination: CurrentDestination): Promise<string[]> {
    validateDestination(destination);
    const path = destination.targetFolder.trim().replace(/^\/+|\/+$/g, "");
    const rows = await this.get(`${repoEndpoint(destination)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(destination.branch.trim())}`, "folder");
    if (!Array.isArray(rows)) throw new Error("The target path is a file, not a folder. Choose a directory or enter a new folder path manually.");
    // Contents returns at most 1000 entries; never imply a complete recursive tree.
    if (rows.length >= 1000) throw new Error("This folder is too large to browse reliably. Enter its exact path manually.");
    return rows.flatMap((row: unknown) => isRecord(row) && row.type === "dir" && typeof row.path === "string" ? [row.path] : []).sort();
  }

  private async pages(endpoint: string): Promise<unknown[]> {
    const rows: unknown[] = [];
    for (let page = 1; page <= 100; page++) {
      const data = await this.get(`${endpoint}&per_page=100&page=${page}`, endpoint.includes("branches") ? "branch" : "repository");
      if (!Array.isArray(data)) throw new Error("GitHub returned an invalid discovery response. Retry or use manual fields.");
      rows.push(...data);
      if (data.length < 100) return rows;
    }
    throw new Error("Too many results to browse reliably. Use manual destination fields.");
  }

  private async get(endpoint: string, scope: string): Promise<unknown> {
    if (this.mode() !== "pat") throw new Error(APP_DISCOVERY_UNAVAILABLE);
    const token = (await this.token())?.trim();
    if (this.mode() !== "pat") throw new Error(APP_DISCOVERY_UNAVAILABLE);
    if (!token) throw new Error("Authentication required: save a PAT in SecretStorage on this device first.");
    let response: Awaited<ReturnType<typeof requestUrl>>;
    try {
      response = await this.send({ url: `https://api.github.com${endpoint}`, method: "GET", throw: false,
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" } });
    } catch { throw new Error("Network failure contacting GitHub. Check your connection and retry; manual fields remain available."); }
    if (this.mode() !== "pat") throw new Error(APP_DISCOVERY_UNAVAILABLE);
    if (response.status === 401) throw new Error("Authentication failed: the PAT may be expired or revoked. Replace it in SecretStorage.");
    if (response.status === 403) throw new Error("GitHub denied access: check PAT permissions, organization approval/SSO, or API rate limits. Pending approval cannot be distinguished from denied access here.");
    if (response.status === 404) throw new Error(`GitHub ${scope} unavailable: check repository access, branch and path. Access may have been revoked; a missing folder can be entered manually for creation on publish.`);
    if (response.status < 200 || response.status >= 300) throw new Error(`GitHub ${scope} discovery failed (${response.status}). Retry or use manual fields.`);
    return response.json;
  }
}

function repoEndpoint(destination: Pick<CurrentDestination, "owner" | "repo">): string {
  if (!destination.owner.trim() || !destination.repo.trim()) throw new Error("Enter or select an owner and repository first.");
  return `/repos/${encodeURIComponent(destination.owner.trim())}/${encodeURIComponent(destination.repo.trim())}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Validate without rewriting the saved path, including a legacy leading slash. */
export function validateDestination(destination: CurrentDestination): void {
  repoEndpoint(destination);
  if (!destination.branch.trim()) throw new Error("Enter or select a branch first.");
  const path = destination.targetFolder;
  if (/[\u0000-\u001f\\]/.test(path) || path.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("Use a repository folder path without control characters, backslashes, '.' or '..' segments.");
  }
}
