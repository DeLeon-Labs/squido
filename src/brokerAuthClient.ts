import { requestUrl } from "obsidian";
import type { GitHubAppConnectionMetadata } from "./types";

export interface GitHubAuthStartResponse {
  status: "pending";
  flow_id: string;
  auth_url: string;
  expires_at: string;
  poll_interval_seconds: number;
}

export type GitHubAuthStatusResponse =
  | {
      status: "pending";
      flow_id: string;
      expires_at: string;
      poll_interval_seconds: number;
    }
  | {
      status: "completed";
      flow_id: string;
      expires_at: string;
      connection: GitHubAppConnectionMetadata;
    }
  | {
      status: "expired";
      flow_id: string;
      expires_at: string;
    }
  | {
      status: "failed";
      flow_id: string;
      error: string;
    };

export class BrokerAuthClient {
  constructor(private readonly baseUrl: string) {}

  async startGitHubAuth(pluginVersion?: string): Promise<GitHubAuthStartResponse> {
    const response = await requestUrl({
      url: brokerUrlFor(this.baseUrl, "/auth/github/start"),
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({
        client: "squido",
        platform: platformName(),
        returnMode: "poll",
        pluginVersion,
      }),
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Broker start failed (${response.status}): ${response.text}`);
    }

    const body = response.json as unknown;
    if (!isStartResponse(body)) {
      throw new Error("Broker start returned an invalid response.");
    }

    return body;
  }

  async getGitHubAuthStatus(flowId: string): Promise<GitHubAuthStatusResponse> {
    const url = brokerUrlFor(this.baseUrl, `/auth/github/status?flow_id=${encodeURIComponent(flowId)}`);
    const response = await requestUrl({
      url,
      method: "GET",
      throw: false,
    });

    if (response.status === 404) {
      throw new Error("Broker flow was not found.");
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Broker status failed (${response.status}): ${response.text}`);
    }

    const body = response.json as unknown;
    if (!isStatusResponse(body)) {
      throw new Error("Broker status returned an invalid response.");
    }

    return body;
  }
}

function brokerUrlFor(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/g, "");
  if (!base) throw new Error("Broker base URL is required.");
  return `${base}${path}`;
}

function platformName(): "desktop" | "mobile" | "web" | "unknown" {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("mobile") || userAgent.includes("iphone") || userAgent.includes("ipad") || userAgent.includes("android")) {
    return "mobile";
  }
  return "desktop";
}

function isStartResponse(value: unknown): value is GitHubAuthStartResponse {
  return typeof value === "object" && value !== null &&
    (value as { status?: unknown }).status === "pending" &&
    typeof (value as { flow_id?: unknown }).flow_id === "string" &&
    typeof (value as { auth_url?: unknown }).auth_url === "string" &&
    typeof (value as { expires_at?: unknown }).expires_at === "string" &&
    typeof (value as { poll_interval_seconds?: unknown }).poll_interval_seconds === "number";
}

function isStatusResponse(value: unknown): value is GitHubAuthStatusResponse {
  if (typeof value !== "object" || value === null) return false;
  const status = (value as { status?: unknown }).status;
  if (typeof (value as { flow_id?: unknown }).flow_id !== "string") return false;

  if (status === "pending") {
    return typeof (value as { expires_at?: unknown }).expires_at === "string" &&
      typeof (value as { poll_interval_seconds?: unknown }).poll_interval_seconds === "number";
  }

  if (status === "completed") {
    return typeof (value as { expires_at?: unknown }).expires_at === "string" &&
      isConnectionMetadata((value as { connection?: unknown }).connection);
  }

  if (status === "expired") {
    return typeof (value as { expires_at?: unknown }).expires_at === "string";
  }

  if (status === "failed") {
    return typeof (value as { error?: unknown }).error === "string";
  }

  return false;
}

function isConnectionMetadata(value: unknown): value is GitHubAppConnectionMetadata {
  if (typeof value !== "object" || value === null) return false;
  if ((value as { provider?: unknown }).provider !== "github") return false;
  const installation = (value as { installation?: unknown }).installation;
  return typeof installation === "object" && installation !== null &&
    typeof (installation as { id?: unknown }).id === "string" &&
    typeof (value as { connected_at?: unknown }).connected_at === "string";
}
