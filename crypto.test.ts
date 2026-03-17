import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VaultManager, writeFileAtomically } from "./crypto";

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "lenver-vault-"));
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("VaultManager", () => {
  it("persists secrets across save and unlock", async () => {
    const vaultDir = await createTempDir();
    tempDirs.push(vaultDir);
    const manager = new VaultManager({ persistLastVaultPath: false });
    manager.setVaultDir(vaultDir);

    await manager.init("password", "hint");
    await manager.setSecret("API_KEY", { value: "secret", note: "primary" });

    const reopened = new VaultManager({ persistLastVaultPath: false });
    reopened.setVaultDir(vaultDir);
    const result = await reopened.unlock("password");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(reopened.getSecret("API_KEY")).toEqual({ value: "secret", note: "primary" });

    await reopened.deleteSecret("API_KEY");
    expect(reopened.listSecrets()).toEqual([]);
  });

  it("preserves the existing file when an atomic rename fails", async () => {
    const vaultDir = await createTempDir();
    tempDirs.push(vaultDir);
    const targetPath = path.join(vaultDir, ".vault.enc");

    await fs.writeFile(targetPath, "old");

    await expect(
      writeFileAtomically(targetPath, Buffer.from("new"), {
        rename: async () => {
          throw new Error("rename failed");
        },
      }),
    ).rejects.toThrow("rename failed");

    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("old");

    const entries = await fs.readdir(vaultDir);
    expect(entries.filter((entry) => entry.endsWith(".tmp"))).toHaveLength(0);
  });
});
