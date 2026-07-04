import { requestUrl } from "obsidian";
import type { GitHubAppConnectionMetadata } from "../types";

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
      expires_at?: string;
      connection: GitHubAppConnectionMetadata;
    }
  | {
      status: "complete";
      flow_id: string;
      expires_at?: string;
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

export type GitHubConnectionVerificationResponse =
  | {
      status: "connected";
      provider: "github";
      connection_id: string;
      broker_grant?: string;
      device_id?: string;
      account?: {
        login?: string;
        id?: string;
        type?: string;
      } | null;
      installation_id: string | number;
      setup_action?: string | null;
      connected_at: string;
      verified_at: string;
    }
  | {
      status: "failed";
      connection_id?: string;
      error: string;
    }
  | {
      status: "expired" | "revoked";
      connection_id?: string;
      error?: string;
    };

export interface GitHubConnectionRevocationResponse {
  status: "revoked" | "not_found" | "not_supported" | "failed";
  connection_id?: string;
  error?: string;
}

export class BrokerAuthClient {
  constructor(
    private readonly baseUrl: string,
    private readonly debug = false,
  ) {}

  async startGitHubAuth(pluginVersion?: string, deviceId?: string): Promise<GitHubAuthStartResponse> {
    const response = await requestUrl({
      url: brokerUrlFor(this.baseUrl, "/auth/github/start"),
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({
        client: "squido",
        device_id: deviceId,
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
    const url = this.statusUrl(flowId);
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
    this.debugLog("raw GitHub auth status response", body);

    const normalized = normalizeStatusResponse(body, flowId);
    if (!normalized) {
      throw new Error("Broker status returned an invalid response.");
    }

    this.debugLog("parsed GitHub auth status", normalized);

    return normalized;
  }

  async verifyGitHubConnection(brokerGrant: string, deviceId?: string): Promise<GitHubConnectionVerificationResponse> {
    const url = brokerUrlFor(this.baseUrl, "/auth/github/connection/status");
    const response = await requestUrl({
      url,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({
        broker_grant: brokerGrant,
        device_id: deviceId,
      }),
      throw: false,
    });

    const body = response.json as unknown;
    this.debugLog("raw GitHub connection verification response", body);

    const normalized = normalizeConnectionVerificationResponse(body);
    if (!normalized && (response.status < 200 || response.status >= 300)) {
      throw new Error(`Broker connection verification failed (${response.status}): ${response.text}`);
    }

    if (!normalized) {
      throw new Error("Broker connection verification returned an invalid response.");
    }

    this.debugLog("parsed GitHub connection verification", normalized);

    return normalized;
  }

  async revokeGitHubConnection(brokerGrant: string, deviceId?: string): Promise<GitHubConnectionRevocationResponse> {
    const url = brokerUrlFor(this.baseUrl, "/auth/github/connection/revoke");
    const response = await requestUrl({
      url,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({
        broker_grant: brokerGrant,
        device_id: deviceId,
      }),
      throw: false,
    });

    const body = response.json as unknown;
    this.debugLog("raw GitHub connection revocation response", body);

    const normalized = normalizeConnectionRevocationResponse(body);
    if (normalized) {
      this.debugLog("parsed GitHub connection revocation", normalized);
      return normalized;
    }

    if (response.status === 404 || response.status === 410 || response.status === 501) {
      return {
        status: response.status === 501 ? "not_supported" : "not_found",
        error: response.text || `Broker revocation returned ${response.status}.`,
      };
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Broker connection revocation failed (${response.status}): ${response.text}`);
    }

    return { status: "revoked" };
  }

  statusUrl(flowId: string): string {
    return brokerUrlFor(this.baseUrl, `/auth/github/status?flow_id=${encodeURIComponent(flowId)}`);
  }

  private debugLog(label: string, value: unknown): void {
    if (!this.debug) return;
    console.debug(`[Squido] ${label}`, value);
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

function normalizeStatusResponse(value: unknown, fallbackFlowId: string): GitHubAuthStatusResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const status = (value as { status?: unknown }).status;
  const flowId = typeof (value as { flow_id?: unknown }).flow_id === "string"
    ? (value as { flow_id: string }).flow_id
    : fallbackFlowId;

  if (status === "pending") {
    if (
      typeof (value as { expires_at?: unknown }).expires_at !== "string" ||
      typeof (value as { poll_interval_seconds?: unknown }).poll_interval_seconds !== "number"
    ) {
      return null;
    }

    return {
      status: "pending",
      flow_id: flowId,
      expires_at: (value as { expires_at: string }).expires_at,
      poll_interval_seconds: (value as { poll_interval_seconds: number }).poll_interval_seconds,
    };
  }

  if (status === "completed" || status === "complete") {
    const connection = normalizeConnectionMetadata(value);
    if (!connection) return null;

    return {
      status,
      flow_id: flowId,
      expires_at: typeof (value as { expires_at?: unknown }).expires_at === "string"
        ? (value as { expires_at: string }).expires_at
        : undefined,
      connection,
    };
  }

  if (status === "expired") {
    if (typeof (value as { expires_at?: unknown }).expires_at !== "string") return null;

    return {
      status: "expired",
      flow_id: flowId,
      expires_at: (value as { expires_at: string }).expires_at,
    };
  }

  if (status === "failed") {
    return {
      status: "failed",
      flow_id: flowId,
      error: typeof (value as { error?: unknown }).error === "string"
        ? (value as { error: string }).error
        : "auth_flow_failed",
    };
  }

  return null;
}

function normalizeConnectionMetadata(value: unknown): GitHubAppConnectionMetadata | null {
  if (typeof value !== "object" || value === null) return null;
  const nested = (value as { connection?: unknown }).connection;

  if (typeof nested === "object" && nested !== null) {
    const normalizedNested = normalizeNestedConnectionMetadata(nested);
    if (normalizedNested) return normalizedNested;
  }

  if ((value as { provider?: unknown }).provider !== "github") return null;

  const installationId = (value as { installation_id?: unknown }).installation_id;
  const account = (value as { account?: unknown }).account;
  const connectedAt = (value as { connected_at?: unknown }).connected_at;
  const setupAction = (value as { setup_action?: unknown }).setup_action;

  if ((typeof installationId !== "string" && typeof installationId !== "number") || typeof connectedAt !== "string") {
    return null;
  }

  return {
    provider: "github",
    connection_id: typeof (value as { connection_id?: unknown }).connection_id === "string"
      ? (value as { connection_id: string }).connection_id
      : undefined,
    broker_grant: typeof (value as { broker_grant?: unknown }).broker_grant === "string"
      ? (value as { broker_grant: string }).broker_grant
      : undefined,
    device_id: typeof (value as { device_id?: unknown }).device_id === "string"
      ? (value as { device_id: string }).device_id
      : undefined,
    account: normalizeAccount(account),
    installation: {
      id: String(installationId),
      setup_action: typeof setupAction === "string" ? setupAction : undefined,
    },
    connected_at: connectedAt,
  };
}

function isConnectionMetadata(value: unknown): value is GitHubAppConnectionMetadata {
  if (typeof value !== "object" || value === null) return false;
  if ((value as { provider?: unknown }).provider !== "github") return false;
  const installation = (value as { installation?: unknown }).installation;
  return typeof installation === "object" && installation !== null &&
    typeof (installation as { id?: unknown }).id === "string" &&
    typeof (value as { connected_at?: unknown }).connected_at === "string";
}

function normalizeNestedConnectionMetadata(value: unknown): GitHubAppConnectionMetadata | null {
  if (typeof value !== "object" || value === null) return null;
  if ((value as { provider?: unknown }).provider !== "github") return null;
  const installation = (value as { installation?: unknown }).installation;
  const connectedAt = (value as { connected_at?: unknown }).connected_at;

  if (typeof installation !== "object" || installation === null || typeof connectedAt !== "string") {
    return null;
  }

  const installationId = (installation as { id?: unknown }).id;
  if (typeof installationId !== "string" && typeof installationId !== "number") return null;

  return {
    provider: "github",
    connection_id: typeof (value as { connection_id?: unknown }).connection_id === "string"
      ? (value as { connection_id: string }).connection_id
      : undefined,
    broker_grant: typeof (value as { broker_grant?: unknown }).broker_grant === "string"
      ? (value as { broker_grant: string }).broker_grant
      : undefined,
    device_id: typeof (value as { device_id?: unknown }).device_id === "string"
      ? (value as { device_id: string }).device_id
      : undefined,
    account: normalizeAccount((value as { account?: unknown }).account),
    installation: {
      id: String(installationId),
      account_login: typeof (installation as { account_login?: unknown }).account_login === "string"
        ? (installation as { account_login: string }).account_login
        : undefined,
      setup_action: typeof (installation as { setup_action?: unknown }).setup_action === "string"
        ? (installation as { setup_action: string }).setup_action
        : undefined,
    },
    connected_at: connectedAt,
  };
}

function normalizeConnectionVerificationResponse(value: unknown): GitHubConnectionVerificationResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const status = (value as { status?: unknown }).status;

  if (status === "connected") {
    const installationId = (value as { installation_id?: unknown }).installation_id;
    const connectedAt = (value as { connected_at?: unknown }).connected_at;
    const verifiedAt = (value as { verified_at?: unknown }).verified_at;
    const connectionId = (value as { connection_id?: unknown }).connection_id;

    if (
      (typeof installationId !== "string" && typeof installationId !== "number") ||
      typeof connectedAt !== "string" ||
      typeof verifiedAt !== "string" ||
      typeof connectionId !== "string"
    ) {
      return null;
    }

    return {
      status: "connected",
      provider: "github",
      connection_id: connectionId,
      broker_grant: typeof (value as { broker_grant?: unknown }).broker_grant === "string"
        ? (value as { broker_grant: string }).broker_grant
        : undefined,
      device_id: typeof (value as { device_id?: unknown }).device_id === "string"
        ? (value as { device_id: string }).device_id
        : undefined,
      account: normalizeAccount((value as { account?: unknown }).account) ?? null,
      installation_id: installationId,
      setup_action: typeof (value as { setup_action?: unknown }).setup_action === "string"
        ? (value as { setup_action: string }).setup_action
        : null,
      connected_at: connectedAt,
      verified_at: verifiedAt,
    };
  }

  if (status === "failed") {
    return {
      status: "failed",
      connection_id: typeof (value as { connection_id?: unknown }).connection_id === "string"
        ? (value as { connection_id: string }).connection_id
        : undefined,
      error: typeof (value as { error?: unknown }).error === "string"
        ? (value as { error: string }).error
        : "connection_verification_failed",
    };
  }

  if (status === "expired" || status === "revoked") {
    return {
      status,
      connection_id: typeof (value as { connection_id?: unknown }).connection_id === "string"
        ? (value as { connection_id: string }).connection_id
        : undefined,
      error: typeof (value as { error?: unknown }).error === "string"
        ? (value as { error: string }).error
        : undefined,
    };
  }

  return null;
}

function normalizeConnectionRevocationResponse(value: unknown): GitHubConnectionRevocationResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const status = (value as { status?: unknown }).status;
  if (status !== "revoked" && status !== "not_found" && status !== "not_supported" && status !== "failed") return null;

  return {
    status,
    connection_id: typeof (value as { connection_id?: unknown }).connection_id === "string"
      ? (value as { connection_id: string }).connection_id
      : undefined,
    error: typeof (value as { error?: unknown }).error === "string"
      ? (value as { error: string }).error
      : undefined,
  };
}

function normalizeAccount(value: unknown): GitHubAppConnectionMetadata["account"] {
  if (typeof value !== "object" || value === null) return undefined;

  const login = (value as { login?: unknown }).login;
  const id = (value as { id?: unknown }).id;
  const type = (value as { type?: unknown }).type;

  return {
    login: typeof login === "string" ? login : undefined,
    id: typeof id === "string" || typeof id === "number" ? String(id) : undefined,
    type: typeof type === "string" ? type : undefined,
  };
}
