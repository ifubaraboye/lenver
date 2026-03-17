import crypto from "node:crypto";
import { z } from "zod";

export const VAULT_ALGO = "aes-256-gcm";
export const VAULT_MAGIC = Buffer.from("EVLT");
export const SCRYPT_OPTS = { N: 131072, r: 8, p: 1, maxmem: 1024 * 1024 * 1024 } as const;

export const vaultEntrySchema = z.object({
  value: z.string(),
  note: z.string().optional(),
}).strict();

const rawVaultSchema = z.object({
  __meta__: z.object({
    version: z.number().int(),
    hint: z.string().optional(),
  }).strict(),
}).catchall(vaultEntrySchema);

export const vaultDataSchema = z.object({
  __meta__: z.object({
    version: z.literal(1),
    hint: z.string().optional(),
  }).strict(),
}).catchall(vaultEntrySchema);

export interface VaultEntry extends z.infer<typeof vaultEntrySchema> {}
export interface VaultMeta {
  version: 1;
  hint?: string;
}

export interface VaultData {
  __meta__: VaultMeta;
  [key: string]: VaultEntry | VaultMeta;
}
export type UnlockFailureReason =
  | "incorrect_password"
  | "invalid_format"
  | "corrupt_vault"
  | "unsupported_version"
  | "filesystem_error";

export type UnlockResult =
  | { ok: true; data: VaultData; masterKey: Buffer; salt: Buffer }
  | { ok: false; reason: UnlockFailureReason };

export function createInitialVaultData(hint = ""): VaultData {
  return {
    __meta__: {
      version: 1,
      hint,
    },
  };
}

export function createSalt() {
  return crypto.randomBytes(32);
}

export function createIv() {
  return crypto.randomBytes(12);
}

export function deriveMasterKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 32, SCRYPT_OPTS, (error, key) =>
      error ? reject(error) : resolve(key as Buffer),
    ),
  );
}

export function encryptPlaintext(plaintext: string, masterKey: Buffer, salt: Buffer): Buffer {
  const iv = createIv();
  const cipher = crypto.createCipheriv(VAULT_ALGO, masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([VAULT_MAGIC, salt, iv, tag, encrypted]);
}

export function encryptVaultData(data: VaultData, masterKey: Buffer, salt: Buffer): Buffer {
  return encryptPlaintext(JSON.stringify(data), masterKey, salt);
}

export async function decryptVaultBuffer(buffer: Buffer, password: string): Promise<UnlockResult> {
  if (buffer.length < 64) {
    return { ok: false, reason: "corrupt_vault" };
  }

  if (!buffer.subarray(0, 4).equals(VAULT_MAGIC)) {
    return { ok: false, reason: "invalid_format" };
  }

  const salt = buffer.subarray(4, 36);
  const iv = buffer.subarray(36, 48);
  const tag = buffer.subarray(48, 64);
  const ciphertext = buffer.subarray(64);

  let masterKey: Buffer;
  try {
    masterKey = await deriveMasterKey(password, salt);
  } catch {
    return { ok: false, reason: "filesystem_error" };
  }

  let plaintext: string;
  try {
    const decipher = crypto.createDecipheriv(VAULT_ALGO, masterKey, iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return { ok: false, reason: "incorrect_password" };
  }

  let jsonValue: unknown;
  try {
    jsonValue = JSON.parse(plaintext);
  } catch {
    return { ok: false, reason: "invalid_format" };
  }

  const rawParsed = rawVaultSchema.safeParse(jsonValue);
  if (!rawParsed.success) {
    return { ok: false, reason: "invalid_format" };
  }

  if (rawParsed.data.__meta__.version !== 1) {
    return { ok: false, reason: "unsupported_version" };
  }

  const parsed = vaultDataSchema.safeParse(jsonValue);
  if (!parsed.success) {
    return { ok: false, reason: "invalid_format" };
  }

  return {
    ok: true,
    data: parsed.data,
    masterKey,
    salt,
  };
}

export function buildExports(data: VaultData): string {
  const entries = Object.entries(data).filter(([key]) => key !== "__meta__") as Array<[string, VaultEntry]>;

  return entries
    .map(([key, value]) => `export ${key}='${value.value.replace(/'/g, "'\\''")}'`)
    .join("\n");
}
