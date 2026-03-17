import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const APP_NAME = "lenver";
const LEGACY_APP_NAME = "envvault";
const LAST_VAULT_FILE = "last-vault";

export interface ConfigPaths {
  configDir: string;
  configFile: string;
  legacyConfigDir: string;
  legacyConfigFile: string;
}

export function getConfigPaths(homeDir = process.env.HOME ?? os.homedir()): ConfigPaths {
  const configDir = path.join(homeDir, ".config", APP_NAME);
  const legacyConfigDir = path.join(homeDir, ".config", LEGACY_APP_NAME);

  return {
    configDir,
    configFile: path.join(configDir, LAST_VAULT_FILE),
    legacyConfigDir,
    legacyConfigFile: path.join(legacyConfigDir, LAST_VAULT_FILE),
  };
}

async function readExistingVaultPath(configFile: string): Promise<string | null> {
  try {
    const vaultPath = (await fs.readFile(configFile, "utf8")).trim();
    await fs.access(vaultPath);
    return vaultPath;
  } catch {
    return null;
  }
}

export async function saveLastVaultPath(vaultPath: string, homeDir?: string) {
  const { configDir, configFile } = getConfigPaths(homeDir);

  try {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configFile, vaultPath, "utf8");
  } catch {}
}

export async function loadLastVaultPath(homeDir?: string): Promise<string | null> {
  const { configFile, legacyConfigFile } = getConfigPaths(homeDir);

  return (await readExistingVaultPath(configFile)) ?? readExistingVaultPath(legacyConfigFile);
}
