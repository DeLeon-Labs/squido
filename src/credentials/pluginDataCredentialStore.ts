import { GITHUB_BROKER_GRANT_CREDENTIAL, type CredentialKey, type CredentialStore } from "./credentialStore";
import type { ManifestStore } from "../storage/manifestStore";

export class PluginDataCredentialStore implements CredentialStore {
  constructor(private readonly manifestStore: ManifestStore) {}

  async get(key: CredentialKey): Promise<string | null> {
    if (!isSameCredential(key, GITHUB_BROKER_GRANT_CREDENTIAL)) return null;

    const connection = this.manifestStore.getSettings().githubAppConnection;
    return connection.session?.broker_grant ?? connection.connection?.broker_grant ?? null;
  }

  async set(key: CredentialKey, value: string): Promise<void> {
    if (!isSameCredential(key, GITHUB_BROKER_GRANT_CREDENTIAL)) return;

    const settings = this.manifestStore.getSettings();
    const connection = settings.githubAppConnection.connection;
    if (!connection) return;

    await this.manifestStore.updateSettings({
      ...settings,
      githubAppConnection: {
        ...settings.githubAppConnection,
        session: {
          ...settings.githubAppConnection.session,
          broker_grant: value,
          status: "active",
        },
        connection: {
          ...connection,
          broker_grant: undefined,
        },
      },
    });
  }

  async delete(key: CredentialKey): Promise<void> {
    if (!isSameCredential(key, GITHUB_BROKER_GRANT_CREDENTIAL)) return;

    const settings = this.manifestStore.getSettings();
    const connection = settings.githubAppConnection.connection;
    const session = settings.githubAppConnection.session;
    if (!connection?.broker_grant && !session?.broker_grant) return;

    await this.manifestStore.updateSettings({
      ...settings,
      githubAppConnection: {
        ...settings.githubAppConnection,
        session: session
          ? {
              ...session,
              broker_grant: undefined,
            }
          : undefined,
        connection: connection
          ? {
              ...connection,
              broker_grant: undefined,
            }
          : undefined,
      },
    });
  }
}

function isSameCredential(left: CredentialKey, right: CredentialKey): boolean {
  return left.provider === right.provider && left.name === right.name;
}
