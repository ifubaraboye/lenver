import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getConfigPaths, loadLastVaultPath, saveLastVaultPath } from "./config-paths";

async function createTempHome() {
  return fs.mkdtemp(path.join(os.tmpdir(), "lenver-home-"));
}

async function cleanupTempHome(homeDir: string) {
  await fs.rm(homeDir, { recursive: true, force: true });
}

const homes: string[] = [];

afterEach(async () => {
  await Promise.all(homes.splice(0).map(cleanupTempHome));
});

describe("config-paths", () => {
  it("prefers the new lenver config path over the legacy path", async () => {
    const homeDir = await createTempHome();
    homes.push(homeDir);

    const paths = getConfigPaths(homeDir);
    const newVaultPath = path.join(homeDir, "new", ".vault.enc");
    const legacyVaultPath = path.join(homeDir, "legacy", ".vault.enc");

    await fs.mkdir(path.dirname(newVaultPath), { recursive: true });
    await fs.mkdir(path.dirname(legacyVaultPath), { recursive: true });
    await fs.writeFile(newVaultPath, "new");
    await fs.writeFile(legacyVaultPath, "legacy");
    await fs.mkdir(paths.configDir, { recursive: true });
    await fs.mkdir(paths.legacyConfigDir, { recursive: true });
    await fs.writeFile(paths.configFile, newVaultPath);
    await fs.writeFile(paths.legacyConfigFile, legacyVaultPath);

    await expect(loadLastVaultPath(homeDir)).resolves.toBe(newVaultPath);
  });

  it("falls back to the legacy envvault config path", async () => {
    const homeDir = await createTempHome();
    homes.push(homeDir);

    const paths = getConfigPaths(homeDir);
    const legacyVaultPath = path.join(homeDir, "legacy", ".vault.enc");

    await fs.mkdir(path.dirname(legacyVaultPath), { recursive: true });
    await fs.writeFile(legacyVaultPath, "legacy");
    await fs.mkdir(paths.legacyConfigDir, { recursive: true });
    await fs.writeFile(paths.legacyConfigFile, legacyVaultPath);

    await expect(loadLastVaultPath(homeDir)).resolves.toBe(legacyVaultPath);
  });

  it("returns null when neither config file points to an existing vault", async () => {
    const homeDir = await createTempHome();
    homes.push(homeDir);

    await expect(loadLastVaultPath(homeDir)).resolves.toBeNull();
  });

  it("writes the last vault path only to the new lenver config location", async () => {
    const homeDir = await createTempHome();
    homes.push(homeDir);

    const paths = getConfigPaths(homeDir);
    const vaultPath = path.join(homeDir, "vault", ".vault.enc");

    await saveLastVaultPath(vaultPath, homeDir);

    await expect(fs.readFile(paths.configFile, "utf8")).resolves.toBe(vaultPath);
    await expect(fs.access(paths.legacyConfigFile)).rejects.toThrow();
  });
});
