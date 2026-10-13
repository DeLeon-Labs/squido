import { GITHUB_BROKER_GRANT_CREDENTIAL, GITHUB_PAT_CREDENTIAL, type CredentialKey, type CredentialStore } from "./credentialStore";
import type { ManifestStore } from "../storage/manifestStore";
import type { SquidoSettings } from "../types";

/** Public Obsidian API only. Availability and storage protection are separate concerns. */
export interface SecretStorageApi {
  getSecret(id: string): string | null;
  setSecret(id: string, secret: string): void;
}

export const STORAGE_ERROR = "Squido cannot access or verify Obsidian SecretStorage. No plaintext fallback is used. Check this device's secrets or reconnect.";

export class SecretStorageCredentialStore implements CredentialStore {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly manifestStore: ManifestStore, private readonly storage: SecretStorageApi | undefined) {}

  private api(): SecretStorageApi {
    if (!this.storage?.getSecret || !this.storage?.setSecret) throw new Error(STORAGE_ERROR);
    return this.storage;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  async get(key: CredentialKey): Promise<string | null> {
    await this.pending;
    try {
      const api = this.api();
      const id = this.manifestStore.getSettings().credentialRefs?.[slot(key)];
      return id ? api.getSecret(id) || null : null;
    } catch { throw new Error(STORAGE_ERROR); }
  }

  set(key: CredentialKey, value: string): Promise<void> {
    return this.serialize(async () => {
      if (!value.trim()) throw new Error("A non-empty credential is required.");
      const settings = this.manifestStore.getSettings();
      const name = slot(key);
      const id = settings.credentialRefs?.[name] ?? newId(name);
      this.writeVerified(id, value);
      await this.manifestStore.updateSettings({
        ...settings, credentialRefs: { ...settings.credentialRefs, [name]: id },
      });
    });
  }

  delete(key: CredentialKey): Promise<void> {
    return this.serialize(async () => {
      const settings = this.manifestStore.getSettings();
      const name = slot(key);
      const id = settings.credentialRefs?.[name];
      // SecretStorage has no public delete API. Clear the value before forgetting our reference.
      if (id) this.writeVerified(id, "");
      else this.api();
      await this.manifestStore.updateSettings({
        ...settings, credentialRefs: { ...settings.credentialRefs, [name]: undefined },
      });
    });
  }

  /** Called before any controller, publisher or event handler starts. */
  migrateLegacy(): Promise<void> {
    return this.serialize(async () => {
      const settings = this.manifestStore.getSettings();
      const grant = settings.githubAppConnection.session?.broker_grant ?? settings.githubAppConnection.connection?.broker_grant;
      const entries: Array<[CredentialKey, string | undefined]> = [
        [GITHUB_PAT_CREDENTIAL, settings.githubToken], [GITHUB_BROKER_GRANT_CREDENTIAL, grant],
      ];
      const refs = { ...settings.credentialRefs };
      this.api();
      for (const [key, value] of entries) {
        if (!value) continue;
        const name = slot(key);
        const id = refs[name] ?? newId(name);
        // A successful partial migration can be retried; never erase legacy material on failed verification.
        this.writeVerified(id, value);
        refs[name] = id;
      }
      const sanitized = withoutLegacyCredentials(settings);
      await this.manifestStore.updateSettings({ ...sanitized, credentialRefs: refs });
    });
  }

  private writeVerified(id: string, value: string): void {
    try {
      const api = this.api();
      api.setSecret(id, value);
      if ((api.getSecret(id) ?? "") !== value) throw new Error(STORAGE_ERROR);
    } catch { throw new Error(STORAGE_ERROR); }
  }
}

function slot(key: CredentialKey): "githubPat" | "brokerGrant" {
  if (key.provider === "github" && key.name === "pat") return "githubPat";
  if (key.provider === "github" && key.name === "brokerGrant") return "brokerGrant";
  throw new Error("Unsupported Squido credential.");
}

function newId(name: string): string {
  return `squido-${name.toLowerCase()}-${crypto.randomUUID()}`;
}

export function withoutLegacyCredentials(settings: SquidoSettings): SquidoSettings {
  const connection = settings.githubAppConnection;
  return {
    ...settings, githubToken: "",
    githubAppConnection: {
      ...connection,
      session: connection.session ? { ...connection.session, broker_grant: undefined } : undefined,
      connection: connection.connection ? { ...connection.connection, broker_grant: undefined } : undefined,
    },
  };
}
