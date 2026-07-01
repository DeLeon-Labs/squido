import { requestUrl } from "obsidian";

export type BrokerTestKind =
  | "reachable"
  | "invalid_response"
  | "not_found"
  | "not_implemented"
  | "network_failure"
  | "http_error";

export interface BrokerTestResult {
  kind: BrokerTestKind;
  stage: "reachability" | "auth_start";
  savedBaseUrl: string;
  url: string;
  method: "GET" | "POST";
  status?: number;
  body?: string;
  parsed?: unknown;
  error?: string;
}

type DebugLogger = (message: string, details: Record<string, unknown>) => void;

export class BrokerAuthClient {
  constructor(
    private readonly baseUrl: string,
    private readonly debugLogger?: DebugLogger,
  ) {}

  async testReachability(): Promise<BrokerTestResult> {
    const savedBaseUrl = this.baseUrl;
    return await this.request({
      stage: "reachability",
      savedBaseUrl,
      url: brokerUrlFor(savedBaseUrl, "/health"),
      method: "GET",
      validateSuccess: isOkHealthResponse,
    });
  }

  async startAuthFlow(): Promise<BrokerTestResult> {
    const savedBaseUrl = this.baseUrl;
    return await this.request({
      stage: "auth_start",
      savedBaseUrl,
      url: brokerUrlFor(savedBaseUrl, "/auth/github/start"),
      method: "POST",
      validateSuccess: isAuthStartResponse,
    });
  }

  private async request(options: {
    stage: BrokerTestResult["stage"];
    savedBaseUrl: string;
    url: string;
    method: "GET" | "POST";
    validateSuccess: (value: unknown) => boolean;
  }): Promise<BrokerTestResult> {
    try {
      const response = await requestUrl({
        url: options.url,
        method: options.method,
        contentType: options.method === "POST" ? "application/json" : undefined,
        body: options.method === "POST" ? "{}" : undefined,
        throw: false,
      });

      const parsed = parseJson(response.text);
      const result: BrokerTestResult = {
        kind: kindForResponse(response.status, parsed, options.validateSuccess),
        stage: options.stage,
        savedBaseUrl: options.savedBaseUrl,
        url: options.url,
        method: options.method,
        status: response.status,
        body: response.text,
        parsed,
      };
      this.log(result);
      return result;
    } catch (error) {
      const result: BrokerTestResult = {
        kind: "network_failure",
        stage: options.stage,
        savedBaseUrl: options.savedBaseUrl,
        url: options.url,
        method: options.method,
        error: error instanceof Error ? error.message : String(error),
      };
      this.log(result);
      return result;
    }
  }

  private log(result: BrokerTestResult): void {
    this.debugLogger?.("Squido broker test request", {
      stage: result.stage,
      savedBaseUrl: result.savedBaseUrl,
      url: result.url,
      method: result.method,
      status: result.status,
      body: result.body,
      parsed: result.parsed,
      error: result.error,
      kind: result.kind,
    });
  }
}

function brokerUrlFor(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/g, "");
  if (!base) throw new Error("Broker base URL is required.");
  return `${base}${path}`;
}

function kindForResponse(status: number, parsed: unknown, validateSuccess: (value: unknown) => boolean): BrokerTestKind {
  if (status === 404) return "not_found";
  if (status === 501) return "not_implemented";
  if (status < 200 || status >= 300) return "http_error";
  return validateSuccess(parsed) ? "reachable" : "invalid_response";
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isOkHealthResponse(value: unknown): value is { ok: true } {
  return typeof value === "object" && value !== null && "ok" in value &&
    (value as { ok?: unknown }).ok === true;
}

function isAuthStartResponse(value: unknown): boolean {
  return typeof value === "object" && value !== null &&
    "flow_id" in value && typeof (value as { flow_id?: unknown }).flow_id === "string" &&
    "auth_url" in value && typeof (value as { auth_url?: unknown }).auth_url === "string";
}
