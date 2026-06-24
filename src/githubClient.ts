import { requestUrl, type RequestUrlParam } from "obsidian";
import type { PublishRequest, PublishResult } from "./types";

interface GitHubContentResponse {
  sha?: string;
}

interface GitHubCommitResponse {
  content?: { html_url?: string };
  commit?: { html_url?: string };
}

export class GitHubClient {
  constructor(private readonly getToken: () => string) {}

  async publishFile(request: PublishRequest): Promise<PublishResult> {
    const token = this.getToken().trim();
    if (!token) throw new Error("A GitHub token is required.");

    const endpoint = this.contentEndpoint(request.owner, request.repo, request.path);
    const sha = await this.findExistingSha(endpoint, request.branch, token);
    const body: Record<string, string> = {
      message: request.message,
      content: encodeBase64(request.content),
      branch: request.branch,
    };
    if (sha) body.sha = sha;

    const response = await requestUrl({
      url: endpoint,
      method: "PUT",
      headers: this.headers(token),
      contentType: "application/json",
      body: JSON.stringify(body),
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(githubError(response.status, response.json));
    }

    const result = response.json as GitHubCommitResponse;
    return {
      publishedUrl: result.content?.html_url,
      commitUrl: result.commit?.html_url,
    };
  }

  private async findExistingSha(endpoint: string, branch: string, token: string): Promise<string | undefined> {
    const params: RequestUrlParam = {
      url: `${endpoint}?ref=${encodeURIComponent(branch)}`,
      method: "GET",
      headers: this.headers(token),
      throw: false,
    };
    const response = await requestUrl(params);
    if (response.status === 404) return undefined;
    if (response.status < 200 || response.status >= 300) {
      throw new Error(githubError(response.status, response.json));
    }
    return (response.json as GitHubContentResponse).sha;
  }

  private contentEndpoint(owner: string, repo: string, path: string): string {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;
  }

  private headers(token: string): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function githubError(status: number, body: unknown): string {
  const message = isMessageBody(body) ? body.message : "Unknown GitHub API error";
  return `GitHub API request failed (${status}): ${message}`;
}

function isMessageBody(value: unknown): value is { message: string } {
  return typeof value === "object" && value !== null && "message" in value &&
    typeof (value as { message?: unknown }).message === "string";
}

