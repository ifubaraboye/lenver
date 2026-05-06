import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const HASH_LENGTH = 16;

export function getProjectId(cwd: string = process.cwd()): string {
  const gitUrl = getGitRemoteUrl(cwd);
  const input = gitUrl ?? cwd;
  return createHash("sha256").update(input).digest("hex").slice(0, HASH_LENGTH);
}

export function getProjectName(cwd: string = process.cwd()): string {
  try {
    const packageJsonPath = `${cwd}/package.json`;
    const pkg = require(packageJsonPath);
    if (pkg.name && typeof pkg.name === "string") {
      return pkg.name;
    }
  } catch {
    // ignore
  }
  return cwd.split("/").pop() ?? "unknown";
}

function getGitRemoteUrl(cwd: string): string | undefined {
  try {
    const url = execSync("git remote get-url origin", {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const trimmed = url.trim();
    return trimmed || undefined;
  } catch {
    return undefined;
  }
}
