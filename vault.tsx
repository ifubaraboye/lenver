#!/usr/bin/env bun
import fs from "node:fs/promises";
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import prompts from "prompts";
import App from "./ui";
import { vault, detectDrives } from "./crypto";

const program = new Command();

program
  .name("envvault")
  .description("Encrypted environment variable vault")
  .option("-e, --export", "Export keys to stdout (for eval)")
  .option("-d, --drive <path>", "Force vault directory")
  .parse();

const opts = program.opts();

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
    let dir = opts.drive;

    if (!dir) {
      // Logic: if not provided, try to find the one drive that has a vault,
      // or ask user interactively if multiple exist.
      const drives = await detectDrives();
      
      // Filter for drives that actually have a vault file
      const vaultDrives = [];
      for(const d of drives) {
          vault.setVaultDir(d.path);
          if(await vault.exists()) vaultDrives.push(d);
      }

      if (vaultDrives.length === 0) {
        console.error("❌ No vault file found on any connected drive.");
        process.exit(1);
      }

      if (vaultDrives.length === 1) {
        vault.setVaultDir(vaultDrives[0].path);
      } else {
        const { dir: selected } = await prompts({
          type: "select",
          name: "dir",
          message: "Select vault location",
          choices: vaultDrives.map(d => ({ title: d.label, value: d.path })),
        });
        if (!selected) process.exit(1);
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

    const ok = await vault.unlock(pw);
    if (!ok) {
      console.error("❌ Incorrect password.");
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