export interface CredentialKey {
  provider: string;
  name: string;
}

export interface CredentialStore {
  get(key: CredentialKey): Promise<string | null>;
  set(key: CredentialKey, value: string): Promise<void>;
  delete(key: CredentialKey): Promise<void>;
}

export const GITHUB_BROKER_GRANT_CREDENTIAL: CredentialKey = {
  provider: "github",
  name: "brokerGrant",
};

