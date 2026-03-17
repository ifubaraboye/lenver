import { describe, expect, it } from "bun:test";
import {
  buildExports,
  createInitialVaultData,
  createSalt,
  decryptVaultBuffer,
  deriveMasterKey,
  encryptPlaintext,
  encryptVaultData,
  type VaultData,
} from "./vault-format";

describe("vault-format", () => {
  it("round-trips a valid vault payload", async () => {
    const salt = createSalt();
    const masterKey = await deriveMasterKey("topsecret", salt);
    const vaultData: VaultData = {
      ...createInitialVaultData("remember me"),
      API_KEY: { value: "abc123", note: "primary" },
    };

    const encrypted = encryptVaultData(vaultData, masterKey, salt);
    const result = await decryptVaultBuffer(encrypted, "topsecret");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.__meta__.hint).toBe("remember me");
    expect(result.data.API_KEY).toEqual({ value: "abc123", note: "primary" });
  });

  it("rejects an incorrect password", async () => {
    const salt = createSalt();
    const masterKey = await deriveMasterKey("correct", salt);
    const encrypted = encryptVaultData(createInitialVaultData(), masterKey, salt);

    const result = await decryptVaultBuffer(encrypted, "wrong");

    expect(result).toEqual({ ok: false, reason: "incorrect_password" });
  });

  it("rejects an invalid magic header", async () => {
    const result = await decryptVaultBuffer(Buffer.concat([Buffer.from("BAD!"), Buffer.alloc(80)]), "irrelevant");
    expect(result).toEqual({ ok: false, reason: "invalid_format" });
  });

  it("rejects decryptable non-json payloads", async () => {
    const salt = createSalt();
    const masterKey = await deriveMasterKey("pw", salt);
    const encrypted = encryptPlaintext("not json", masterKey, salt);

    const result = await decryptVaultBuffer(encrypted, "pw");

    expect(result).toEqual({ ok: false, reason: "invalid_format" });
  });

  it("rejects decryptable schema-invalid payloads", async () => {
    const salt = createSalt();
    const masterKey = await deriveMasterKey("pw", salt);
    const encrypted = encryptPlaintext(JSON.stringify({
      __meta__: { version: 1 },
      BROKEN: { value: 123 },
    }), masterKey, salt);

    const result = await decryptVaultBuffer(encrypted, "pw");

    expect(result).toEqual({ ok: false, reason: "invalid_format" });
  });

  it("rejects unsupported vault versions", async () => {
    const salt = createSalt();
    const masterKey = await deriveMasterKey("pw", salt);
    const encrypted = encryptPlaintext(JSON.stringify({
      __meta__: { version: 2 },
      KEY: { value: "abc" },
    }), masterKey, salt);

    const result = await decryptVaultBuffer(encrypted, "pw");

    expect(result).toEqual({ ok: false, reason: "unsupported_version" });
  });

  it("escapes exports safely for shell eval", () => {
    const exports = buildExports({
      ...createInitialVaultData(),
      API_KEY: { value: "simple" },
      QUOTED: { value: "o'hara && rm -rf /" },
    });

    expect(exports).toContain("export API_KEY='simple'");
    expect(exports).toContain("export QUOTED='o'\\''hara && rm -rf /'");
  });
});
