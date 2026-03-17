import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import { loadLastVaultPath, saveLastVaultPath } from "./config-paths";
import { detectDrives, type DriveInfo } from "./drive-detection";
import {
  buildExports,
  createInitialVaultData,
  createSalt,
  decryptVaultBuffer,
  deriveMasterKey,
  encryptVaultData,
  type UnlockFailureReason,
  type UnlockResult,
  type VaultData,
  type VaultEntry,
} from "./vault-format";

const VAULT_FILENAME = ".vault.enc";

export { detectDrives, loadLastVaultPath };
export type { DriveInfo, UnlockFailureReason, UnlockResult, VaultData, VaultEntry };

interface AtomicWriteOptions {
  mode?: number;
  rename?: typeof fs.rename;
  unlink?: typeof fs.unlink;
}

export async function writeFileAtomically(
  targetPath: string,
  data: Buffer,
  { mode = 0o600, rename = fs.rename, unlink = fs.unlink }: AtomicWriteOptions = {},
) {
  const tempPath = `${targetPath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;

  try {
    handle = await fs.open(tempPath, "w", mode);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(tempPath, targetPath);
  } catch (error) {
    if (handle) {
      try {
        await handle.close();
      } catch {}
    }

    try {
      await unlink(tempPath);
    } catch {}

    throw error;
  }
}

interface VaultManagerOptions {
  persistLastVaultPath?: boolean;
}

export class VaultManager {
  private masterKey: Buffer | null = null;
  private salt: Buffer | null = null;
  public data: VaultData | null = null;
  private vaultPath: string;
  private readonly persistLastVaultPath: boolean;

  constructor({ persistLastVaultPath = true }: VaultManagerOptions = {}) {
    const projectDir = path.dirname(fileURLToPath(import.meta.url));
    this.vaultPath = path.join(projectDir, VAULT_FILENAME);
    this.persistLastVaultPath = persistLastVaultPath;
  }

  setVaultDir(dir: string) {
    this.vaultPath = path.join(dir, VAULT_FILENAME);
    if (this.persistLastVaultPath) {
      void saveLastVaultPath(this.vaultPath);
    }
  }

  getVaultPath() {
    return this.vaultPath;
  }

  async exists(): Promise<boolean> {
    try { await fs.access(this.vaultPath); return true; } catch { return false; }
  }

  async init(password: string, hint = "") {
    this.salt = createSalt();
    this.masterKey = await deriveMasterKey(password, this.salt);
    this.data = createInitialVaultData(hint);
    await this.save();
  }

  async unlock(password: string): Promise<UnlockResult> {
    try {
      const buf = await fs.readFile(this.vaultPath);
      const result = await decryptVaultBuffer(buf, password);
      if (!result.ok) {
        this.masterKey = null;
        this.salt = null;
        this.data = null;
        return result;
      }

      this.masterKey = result.masterKey;
      this.salt = result.salt;
      this.data = result.data;
      return result;
    } catch {
      this.masterKey = null;
      this.salt = null;
      this.data = null;
      return { ok: false, reason: "filesystem_error" };
    }
  }

  async save() {
    if (!this.masterKey || !this.data || !this.salt) throw new Error("Vault not unlocked");
    const encrypted = encryptVaultData(this.data, this.masterKey, this.salt);
    await writeFileAtomically(this.vaultPath, encrypted, { mode: 0o600 });
  }

  getExports(): string {
    return this.data ? buildExports(this.data) : "";
  }

  listSecrets(): string[] {
    return Object.keys(this.data ?? {}).filter((key) => key !== "__meta__");
  }

  getSecret(keyName: string): VaultEntry | undefined {
    if (keyName === "__meta__") {
      return undefined;
    }

    return this.data?.[keyName] as VaultEntry | undefined;
  }

  getHint(): string | undefined {
    return this.data?.__meta__.hint;
  }

  async setSecret(keyName: string, entry: VaultEntry) {
    if (!this.data) {
      throw new Error("Vault not unlocked");
    }

    this.data[keyName] = entry;
    await this.save();
  }

  async deleteSecret(keyName: string) {
    if (!this.data) {
      throw new Error("Vault not unlocked");
    }

    delete this.data[keyName];
    await this.save();
  }
}

export const vault = new VaultManager();
