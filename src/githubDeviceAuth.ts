import { requestUrl } from "obsidian";
import type { GitHubDeviceCode, GitHubDeviceToken, GitHubUser } from "./types";

const DEVICE_CODE_ENDPOINT = "https://github.com/login/device/code";
const ACCESS_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const USER_ENDPOINT = "https://api.github.com/user";
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

export type DeviceFlowPollStatus =
  | "authorization_pending"
  | "slow_down"
  | "expired_token"
  | "access_denied"
  | "device_flow_disabled"
  | "incorrect_client_credentials"
  | "incorrect_device_code"
  | "unsupported_grant_type"
  | "success";

export interface DeviceFlowProgress {
  status: DeviceFlowPollStatus;
  message: string;
  intervalSeconds: number;
}

interface GitHubDeviceCodeResponse {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
}

interface GitHubDeviceTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  interval?: number;
}

interface GitHubUserResponse {
  login?: string;
}

export class GitHubDeviceAuth {
  async requestDeviceCode(clientId: string, scope: string): Promise<GitHubDeviceCode> {
    const response = await requestUrl({
      url: DEVICE_CODE_ENDPOINT,
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      headers: { Accept: "application/json" },
      body: formBody({
        client_id: clientId,
        scope,
      }),
      throw: false,
    });

    const body = response.json as GitHubDeviceCodeResponse;
    if (response.status < 200 || response.status >= 300 || body.error) {
      throw new Error(deviceFlowError(body, "Could not start GitHub Device Flow."));
    }

    if (!body.device_code || !body.user_code || !body.verification_uri || !body.expires_in) {
      throw new Error("GitHub Device Flow response was missing required fields.");
    }

    return {
      deviceCode: body.device_code,
      userCode: body.user_code,
      verificationUri: body.verification_uri,
      expiresIn: body.expires_in,
      interval: body.interval ?? 5,
    };
  }

  async pollForToken(
    clientId: string,
    deviceCode: string,
    expiresAt: number,
    initialIntervalSeconds: number,
    onProgress: (progress: DeviceFlowProgress) => Promise<void>,
  ): Promise<GitHubDeviceToken> {
    let intervalSeconds = Math.max(initialIntervalSeconds, 5);

    while (Date.now() < expiresAt) {
      await sleep(intervalSeconds * 1000);

      const response = await requestUrl({
        url: ACCESS_TOKEN_ENDPOINT,
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        headers: { Accept: "application/json" },
        body: formBody({
          client_id: clientId,
          device_code: deviceCode,
          grant_type: DEVICE_GRANT_TYPE,
        }),
        throw: false,
      });

      const body = response.json as GitHubDeviceTokenResponse;
      if (body.access_token) {
        await onProgress({
          status: "success",
          message: "GitHub authentication succeeded.",
          intervalSeconds,
        });
        return {
          accessToken: body.access_token,
          tokenType: body.token_type ?? "bearer",
          scope: body.scope ?? "",
        };
      }

      const error = normalizeDeviceFlowError(body.error);
      if (error === "authorization_pending") {
        await onProgress({
          status: error,
          message: "Waiting for GitHub authorization.",
          intervalSeconds,
        });
        continue;
      }

      if (error === "slow_down") {
        intervalSeconds = Math.max(body.interval ?? intervalSeconds + 5, intervalSeconds + 5);
        await onProgress({
          status: error,
          message: `GitHub requested slower polling. Waiting ${intervalSeconds} seconds between checks.`,
          intervalSeconds,
        });
        continue;
      }

      if (error) {
        await onProgress({
          status: error,
          message: deviceFlowError(body, "GitHub Device Flow failed."),
          intervalSeconds,
        });
        throw new Error(deviceFlowError(body, "GitHub Device Flow failed."));
      }

      if (response.status < 200 || response.status >= 300) {
        throw new Error(deviceFlowError(body, `GitHub token request failed (${response.status}).`));
      }
    }

    throw new Error("GitHub Device Flow expired before authorization completed.");
  }

  async validateUser(accessToken: string): Promise<GitHubUser> {
    const response = await requestUrl({
      url: USER_ENDPOINT,
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GitHub user validation failed (${response.status}).`);
    }

    const body = response.json as GitHubUserResponse;
    if (!body.login) throw new Error("GitHub user validation did not return a login.");
    return { login: body.login };
  }
}

function formBody(values: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function normalizeDeviceFlowError(error: string | undefined): DeviceFlowPollStatus | undefined {
  if (error === "token_expired") return "expired_token";
  if (
    error === "authorization_pending" ||
    error === "slow_down" ||
    error === "expired_token" ||
    error === "access_denied" ||
    error === "device_flow_disabled" ||
    error === "incorrect_client_credentials" ||
    error === "incorrect_device_code" ||
    error === "unsupported_grant_type"
  ) {
    return error;
  }
  return undefined;
}

function deviceFlowError(body: { error?: string; error_description?: string }, fallback: string): string {
  if (body.error_description) return body.error_description;
  if (body.error) return `${fallback} ${body.error}`;
  return fallback;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
