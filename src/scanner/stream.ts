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

export type ScanEvent =
  | { type: "file"; file: string }
  | { type: "var"; file: string; var: ScannedVar }
  | { type: "done"; totalFiles: number };

export async function* scanStream(cwd: string): AsyncGenerator<ScanEvent> {
  const gitignore = readGitignore(cwd);

  const envFiles = await glob("**/.env*", {
    cwd,
    ignore: gitignore,
    dot: true,
    onlyFiles: true,
  });

  for (const file of envFiles) {
    yield { type: "file", file };
    try {
      const content = readFileSync(join(cwd, file), "utf-8");
      const parsed = parseDotenv(content);
      const sensitive = isSensitiveFile(file);
      const example = isExampleFile(file);

      for (const { key, value } of parsed) {
        const sv: ScannedVar = {
          key,
          value: example ? null : value,
          source: file,
          isSensitive: sensitive,
          isExample: example,
        };
        yield { type: "var", file, var: sv };
      }
    } catch {
      // skip unreadable
    }
  }

  yield { type: "done", totalFiles: envFiles.length };
}
