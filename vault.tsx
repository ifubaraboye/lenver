#!/usr/bin/env bun
import fs from "node:fs/promises";
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import prompts from "prompts";
import App from "./ui";
import { vault, detectDrives, type DriveInfo, type UnlockFailureReason, type VaultEntry } from "./crypto";

const unlockFailureMessage: Record<UnlockFailureReason, string> = {
  incorrect_password: "Incorrect password or failed authentication.",
  invalid_format: "Vault file is not a valid lenver vault.",
  corrupt_vault: "Vault file is truncated or corrupted.",
  unsupported_version: "Vault version is not supported by this build.",
  filesystem_error: "Unable to read the vault file from disk.",
};

async function getVaultDir(driveOption?: string): Promise<string> {
  if (driveOption) {
    let drivePath = driveOption;
    try {
      await fs.access(drivePath);
    } catch {
      const drives = await detectDrives();
      const match = drives.find(
        (d) =>
          d.name.toLowerCase() === driveOption.toLowerCase() ||
          d.label.toLowerCase().includes(driveOption.toLowerCase())
      );
      if (match) {
        drivePath = match.path;
      }
    }
    return drivePath;
  }
  const drives = await detectDrives();
  const vaultDrives: DriveInfo[] = [];
  for (const drive of drives) {
    vault.setVaultDir(drive.path);
    if (await vault.exists()) {
      vaultDrives.push(drive);
    }
  }
  if (vaultDrives.length === 0) {
    console.error("No vault file found on any connected drive.");
    process.exit(1);
  }
  if (vaultDrives.length === 1) {
    return vaultDrives[0]!.path;
  }
  const { dir: selected } = await prompts({
    type: "select",
    name: "dir",
    message: "Select vault location",
    choices: vaultDrives.map((drive) => ({ title: drive.label, value: drive.path })),
  });
  if (!selected) {
    process.exit(1);
  }
  return selected;
}

async function unlockVault(driveOption?: string): Promise<void> {
  const drivePath = await getVaultDir(driveOption);
  vault.setVaultDir(drivePath);
  if (!await vault.exists()) {
    console.error("Vault file not found.");
    process.exit(1);
  }
  const { pw } = await prompts({
    type: "password",
    name: "pw",
    message: "Enter vault password",
  });
  if (!pw) process.exit(1);
  const result = await vault.unlock(pw);
  if (!result.ok) {
    console.error(`${unlockFailureMessage[result.reason]}`);
    process.exit(1);
  }
}

const program = new Command();

program
  .name("lenver")
  .description("Encrypted environment variable vault")
  .option("-d, --drive <path>", "Vault directory")
  .argument("[args...]", "Commands: set KEY=VALUE, export [file]")
  .passThroughOptions()
  .action(async (args, opts) => {
    const cmd = args[0];
    if (!cmd) {
      console.clear();
      const { waitUntilExit } = render(<App />);
      waitUntilExit().catch((err) => {
        console.error(err);
        process.exit(1);
      });
      return;
    }

    if (cmd === "set") {
      const arg = args[1];
      if (!arg) {
        console.error("Usage: lenver set KEY=VALUE");
        process.exit(1);
      }
      const match = arg.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) {
        console.error("Invalid format. Use KEY=VALUE (e.g., STRIPE_KEY=sk_live_xxx)");
        process.exit(1);
      }
      const [, key, value] = match;
      await unlockVault(opts.drive);
      const entry: VaultEntry = { value };
      await vault.setSecret(key.toUpperCase(), entry);
      console.log(`Stored ${key.toUpperCase()}`);
      process.exit(0);
    }

    if (cmd === "export") {
      const file = args[1];
      await unlockVault(opts.drive);
      const exports = vault.getExports();
      if (file) {
        await fs.writeFile(file, exports + "\n", { mode: 0o600 });
        console.log(`✓ Exported to ${file}`);
      } else {
        console.log(exports);
      }
      process.exit(0);
    }

    console.error(`Unknown command: ${cmd}`);
    console.error("Usage: lenver [set KEY=VALUE] [export [file]]");
    process.exit(1);
  });

program.parse();
