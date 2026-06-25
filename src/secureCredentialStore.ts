import type { ManifestStore } from "./manifestStore";
import type { SecureCredentialRecord } from "./types";

interface ElectronSafeStorage {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?(): string;
}

interface ElectronModule {
  safeStorage?: ElectronSafeStorage;
  remote?: {
    safeStorage?: ElectronSafeStorage;
  };
}

interface WindowWithRequire extends Window {
  require?: (moduleName: string) => unknown;
}

export class SecureCredentialStore {
  constructor(private readonly manifestStore: ManifestStore) {}

  isAvailable(): boolean {
    const safeStorage = this.safeStorage();
    if (!safeStorage?.isEncryptionAvailable()) return false;
    return safeStorage.getSelectedStorageBackend?.() !== "basic_text";
  }

  description(): string {
    const safeStorage = this.safeStorage();
    if (!safeStorage) return "Secure credential storage is not available in this runtime.";
    if (!safeStorage.isEncryptionAvailable()) return "Secure credential storage is not available on this system.";
    const backend = safeStorage.getSelectedStorageBackend?.();
    if (backend === "basic_text") return "Linux secure storage fell back to basic_text, so Squido will not store secrets.";
    return backend ? `Secure credential storage is available through ${backend}.` : "Secure credential storage is available.";
  }

  async store(key: string, value: string): Promise<void> {
    const safeStorage = this.requireSafeStorage();
    const existing = this.manifestStore.getCredential(key);
    const now = new Date().toISOString();
    const record: SecureCredentialRecord = {
      storage: "electron-safe-storage",
      value: safeStorage.encryptString(value).toString("base64"),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.manifestStore.setCredential(key, record);
  }

  get(key: string): string {
    const record = this.manifestStore.getCredential(key);
    if (!record) return "";
    if (record.storage !== "electron-safe-storage") {
      throw new Error("Unsupported credential storage backend.");
    }

    const safeStorage = this.requireSafeStorage();
    return safeStorage.decryptString(Buffer.from(record.value, "base64"));
  }

  async delete(key: string): Promise<void> {
    await this.manifestStore.deleteCredential(key);
  }

  private requireSafeStorage(): ElectronSafeStorage {
    const safeStorage = this.safeStorage();
    if (!safeStorage?.isEncryptionAvailable()) {
      throw new Error("Secure credential storage is not available on this system.");
    }
    if (safeStorage.getSelectedStorageBackend?.() === "basic_text") {
      throw new Error("Secure credential storage is using basic_text fallback; Squido will not store secrets.");
    }
    return safeStorage;
  }

  private safeStorage(): ElectronSafeStorage | undefined {
    const electronRequire = typeof require === "function" ? require : (window as WindowWithRequire).require;
    if (typeof electronRequire !== "function") return undefined;

    try {
      const electron = electronRequire("electron") as ElectronModule;
      return electron.safeStorage ?? electron.remote?.safeStorage;
    } catch {
      return undefined;
    }
  }
}
