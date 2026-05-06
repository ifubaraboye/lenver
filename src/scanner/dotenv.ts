import { readFileSync } from "node:fs";
import { join } from "node:path";
import glob from "fast-glob";
import type { ScannedVar } from "../types.js";

const SENSITIVE_PATTERNS = [/\.prod/i, /\.production/i, /\.staging/i];
const EXAMPLE_PATTERN = /\.example/i;

function isSensitiveFile(filePath: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(filePath));
}

function isExampleFile(filePath: string): boolean {
  return EXAMPLE_PATTERN.test(filePath);
}

function parseDotenv(content: string): Array<{ key: string; value: string }> {
  const vars: Array<{ key: string; value: string }> = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!key) continue;
    vars.push({ key, value });
  }
  return vars;
}

export async function scanDotenvFiles(cwd: string): Promise<ScannedVar[]> {
  const gitignorePatterns = readGitignore(cwd);
  const files = await glob("**/.env*", {
    cwd,
    ignore: gitignorePatterns,
    dot: true,
    onlyFiles: true,
  });

  const results: ScannedVar[] = [];
  for (const file of files) {
    const fullPath = join(cwd, file);
    try {
      const content = readFileSync(fullPath, "utf-8");
      const parsed = parseDotenv(content);
      const sensitive = isSensitiveFile(file);
      const example = isExampleFile(file);

      for (const { key, value } of parsed) {
        results.push({
          key,
          value: example ? null : value,
          source: file,
          isSensitive: sensitive,
          isExample: example,
        });
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}

function readGitignore(cwd: string): string[] {
  try {
    const content = readFileSync(join(cwd, ".gitignore"), "utf-8");
    return content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .filter((l) => {
        // Never ignore patterns that would match .env files
        if (l.includes(".env")) return false;
        if (l === "*.local") return false;
        return true;
      });
  } catch {
    return ["node_modules", ".git"];
  }
}
