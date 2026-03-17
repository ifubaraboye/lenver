#!/usr/bin/env bun
import fs from "node:fs/promises";
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import prompts from "prompts";
import App from "./ui";
import { vault, detectDrives, type DriveInfo, type UnlockFailureReason } from "./crypto";

const program = new Command();

program
  .name("lenver")
  .description("Encrypted environment variable vault")
  .option("-e, --export", "Export keys to stdout (for eval)")
  .option("-d, --drive <path>", "Force vault directory")
  .parse();

const opts = program.opts();

const unlockFailureMessage: Record<UnlockFailureReason, string> = {
  incorrect_password: "Incorrect password or failed authentication.",
  invalid_format: "Vault file is not a valid lenver vault.",
  corrupt_vault: "Vault file is truncated or corrupted.",
  unsupported_version: "Vault version is not supported by this build.",
  filesystem_error: "Unable to read the vault file from disk.",
};

async function main() {
  if (opts.drive) {
    let drivePath = opts.drive;
    try {
      await fs.access(drivePath);
    } catch {
      // Path doesn't exist, try to find it as a drive name
      const drives = await detectDrives();
      const match = drives.find(
        (d) =>
          d.name.toLowerCase() === opts.drive.toLowerCase() ||
          d.label.toLowerCase().includes(opts.drive.toLowerCase())
      );
      if (match) {
        drivePath = match.path;
        console.log(`Found drive '${opts.drive}' at ${drivePath}`);
      }
    }
    vault.setVaultDir(drivePath);
  }

  if (opts.export) {
    if (!opts.drive) {
      // Logic: if not provided, try to find the one drive that has a vault,
      // or ask user interactively if multiple exist.
      const drives = await detectDrives();

      // Filter for drives that actually have a vault file
      const vaultDrives: DriveInfo[] = [];
      for (const drive of drives) {
        vault.setVaultDir(drive.path);
        if (await vault.exists()) {
          vaultDrives.push(drive);
        }
      }

      if (vaultDrives.length === 0) {
        console.error("❌ No vault file found on any connected drive.");
        process.exit(1);
      }

      if (vaultDrives.length === 1) {
        const [selectedDrive] = vaultDrives;
        if (!selectedDrive) {
          console.error("❌ Vault drive detection failed.");
          process.exit(1);
        }

        vault.setVaultDir(selectedDrive.path);
      } else {
        const { dir: selected } = await prompts({
          type: "select",
          name: "dir",
          message: "Select vault location",
          choices: vaultDrives.map((drive) => ({ title: drive.label, value: drive.path })),
        });
        if (!selected) {
          process.exit(1);
        }

        vault.setVaultDir(selected);
      }
    }

    // Now we have the dir, check again
    if (!await vault.exists()) {
      console.error("❌ Vault file not found.");
      process.exit(1);
    }

    const { pw } = await prompts({
      type: "password",
      name: "pw",
      message: "🔑 Vault password",
    });

    if (!pw) process.exit(1);

    const result = await vault.unlock(pw);
    if (!result.ok) {
      console.error(`❌ ${unlockFailureMessage[result.reason]}`);
      process.exit(1);
    }

    console.log(vault.getExports());
    process.exit(0);
  }

  // Normal TUI
  console.clear();
  const { waitUntilExit } = render(<App />);
  await waitUntilExit();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
