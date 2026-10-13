import { requestUrl } from "obsidian";
import { GITHUB_BROKER_GRANT_CREDENTIAL, type CredentialStore } from "../credentials/credentialStore";

export const TOKEN_EXCHANGE_ERROR = "GitHub App token exchange failed. Verify or reauthorize this device before trying again.";
export interface DiscoveryTokenContext {
  mode: "github-app" | "pat";
  connected: boolean;
  brokerBaseUrl: string;
  connectionId: string;
  installationId: string;
  deviceSessionId: string;
  /** Monotonic lifecycle revision; detects A→B→A even when identity is unchanged. */
  generation?: number;
}
export interface DiscoveryAuthorization {
  token: string;
  expiresAt: string;
  purpose: "repo_discovery";
}

/** One instance per coordinated connection lifecycle. Callers drain the full operation before
 * verification, disconnect, repair or mode changes. Never cache the authorization.
 */
export class InstallationTokenExchange {
  private busy = false;
  private blocked = false;

  constructor(
    private readonly credentials: CredentialStore,
    private readonly context: () => DiscoveryTokenContext,
    private readonly send: typeof requestUrl = requestUrl,
    private readonly now: () => number = Date.now,
  ) {}

  async withRepoDiscoveryToken<T>(operation: (authorization: DiscoveryAuthorization) => Promise<T>): Promise<T> {
    if (this.busy || this.blocked) throw new Error(TOKEN_EXCHANGE_ERROR);
    this.busy = true;
    let authorization: DiscoveryAuthorization;
    try {
      try {
        const context = { ...this.context() };
        if (context.mode !== "github-app" || !context.connected ||
            !context.connectionId || !context.installationId || context.deviceSessionId.trim().length < 8) {
          throw new Error(TOKEN_EXCHANGE_ERROR);
        }
        const base = new URL(context.brokerBaseUrl);
        if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
          throw new Error(TOKEN_EXCHANGE_ERROR);
        }
        const grant = await this.credentials.get(GITHUB_BROKER_GRANT_CREDENTIAL);
        if (!grant || !this.matches(context)) throw new Error(TOKEN_EXCHANGE_ERROR);
        const response = await this.send({
          url: new URL("/auth/github/token", base).toString(), method: "POST", contentType: "application/json",
          body: JSON.stringify({ broker_grant: grant, device_session_id: context.deviceSessionId, purpose: "repo_discovery" }),
          throw: false,
        });
        const cacheControl = Object.entries(response.headers).find(([key]) => key.toLowerCase() === "cache-control")?.[1];
        if (response.status < 200 || response.status >= 300 ||
            !cacheControl?.split(",").some((value) => value.trim().toLowerCase() === "no-store")) {
          throw new Error(TOKEN_EXCHANGE_ERROR);
        }
        const body: unknown = response.json;
        if (!isDiscoveryResponse(body, context, grant, this.now())) throw new Error(TOKEN_EXCHANGE_ERROR);
        if (!this.matches(context, true) || await this.credentials.get(GITHUB_BROKER_GRANT_CREDENTIAL) !== grant) {
          throw new Error(TOKEN_EXCHANGE_ERROR);
        }
        // Save valid rotation even if a queued mutation invalidated discovery's generation.
        // Shared lifecycle serialization keeps identity/mode stable until this write completes.
        // Only the rotated broker grant is durable. Never persist the installation token.
        await this.credentials.set(GITHUB_BROKER_GRANT_CREDENTIAL, body.broker_grant);
        if (!this.matches(context) || !validExpiry(body.expires_at, this.now(), 60 * 60 * 1000)) {
          throw new Error(TOKEN_EXCHANGE_ERROR);
        }
        authorization = { token: body.token, expiresAt: body.expires_at, purpose: "repo_discovery" };
      } catch {
        // No automatic retry: dispatch/rotation may have succeeded despite a lost response.
        this.blocked = true;
        throw new Error(TOKEN_EXCHANGE_ERROR);
      }
      return await operation(authorization);
    } finally {
      this.busy = false;
    }
  }

  private matches(expected: DiscoveryTokenContext, ignoreGeneration = false): boolean {
    const current = this.context();
    return (Object.keys(expected) as Array<keyof DiscoveryTokenContext>).every((key) =>
      (ignoreGeneration && key === "generation") || current[key] === expected[key]);
  }
}

interface DiscoveryResponse {
  token: string;
  expires_at: string;
  broker_grant: string;
}
function validExpiry(value: unknown, now: number, maxLifetime?: number): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const expiry = Date.parse(value);
  return Number.isFinite(expiry) && expiry > now + 30_000 && (maxLifetime === undefined || expiry <= now + maxLifetime);
}
function isDiscoveryResponse(value: unknown, context: DiscoveryTokenContext, oldGrant: string, now: number): value is DiscoveryResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const permissions = body.permissions;
  return body.status === "issued" && body.provider === "github" && body.purpose === "repo_discovery" &&
    body.token_type === "installation" && body.connection_id === context.connectionId && body.installation_id === context.installationId &&
    body.rotated_broker_grant === true && body.device_session_bound === true &&
    typeof body.token === "string" && body.token.trim().length > 0 &&
    typeof body.broker_grant === "string" && body.broker_grant.trim().length > 0 && body.broker_grant !== oldGrant &&
    validExpiry(body.expires_at, now, 60 * 60 * 1000) && validExpiry(body.broker_grant_expires_at, now) &&
    !!permissions && typeof permissions === "object" && !Array.isArray(permissions) &&
    Object.keys(permissions).length === 1 && (permissions as Record<string, unknown>).metadata === "read";
}
