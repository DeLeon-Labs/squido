import { requestUrl } from "obsidian";
import type { DiscoveryAuthorization } from "./auth/installationTokenExchange";
import type { RepositoryChoice } from "./destinationDiscovery";

/** Metadata only: one transient authorization across bounded installation-scoped pages.
 * Never follows Link/html_url, uses /user/repos, infers push permission or reads contents.
 */
export async function listInstallationRepositories(
  authorization: DiscoveryAuthorization,
  assertCurrent: () => void,
  send: typeof requestUrl = requestUrl,
  now: () => number = Date.now,
): Promise<RepositoryChoice[]> {
  const rows: RepositoryChoice[] = [];
  const ids = new Set<number>();
  let expectedTotal: number | undefined;
  for (let page = 1; page <= 100; page++) {
    assertCurrent();
    if (authorization.purpose !== "repo_discovery" || !authorization.token || Date.parse(authorization.expiresAt) <= now() + 30_000 || !Number.isFinite(Date.parse(authorization.expiresAt))) {
      throw new Error("GitHub installation authorization expired. Verify the connection and retry discovery.");
    }
    let response: Awaited<ReturnType<typeof requestUrl>>;
    try {
      response = await send({ url: `https://api.github.com/installation/repositories?per_page=100&page=${page}`, method: "GET", throw: false,
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${authorization.token}`, "X-GitHub-Api-Version": "2022-11-28" } });
    } catch { throw new Error("Network failure contacting GitHub. No repository selection was saved."); }
    assertCurrent();
    if (response.status === 401) throw new Error("GitHub installation authorization expired or was revoked. Verify or reauthorize this device.");
    if (response.status === 403) throw new Error("GitHub denied installation access. Check App repository access, organization approval or API rate limits; approval and denial cannot be distinguished here.");
    if (response.status === 404) throw new Error("GitHub installation repositories unavailable. Access may have been removed; manage GitHub App access and verify the connection.");
    if (response.status < 200 || response.status >= 300) throw new Error(`GitHub installation repository discovery failed (${response.status}). No selection was saved.`);
    const data: unknown = response.json;
    if (!record(data) || !Number.isSafeInteger(data.total_count) || (data.total_count as number) < 0 || (data.total_count as number) > 10_000 ||
        !Array.isArray(data.repositories) || data.repositories.length > 100) throw invalid();
    const total = data.total_count as number;
    if (expectedTotal !== undefined && total !== expectedTotal) throw invalid();
    expectedTotal = total;
    for (const row of data.repositories) {
      if (!record(row) || !Number.isSafeInteger(row.id) || (row.id as number) <= 0 || ids.has(row.id as number) ||
          !record(row.owner) || !nonempty(row.owner.login) || !nonempty(row.name) ||
          (row.default_branch !== null && !nonempty(row.default_branch))) throw invalid();
      ids.add(row.id as number);
      rows.push({ owner: row.owner.login, name: row.name, defaultBranch: row.default_branch ?? "" });
    }
    if (rows.length === total) { assertCurrent(); return rows; }
    if (rows.length > total || data.repositories.length < 100) throw invalid();
  }
  throw invalid();
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function invalid(): Error { return new Error("GitHub returned an inconsistent installation repository listing. Retry discovery; no partial list or selection was saved."); }
