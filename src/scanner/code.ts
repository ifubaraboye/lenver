import { readFileSync } from "node:fs";
import { join } from "node:path";
import glob from "fast-glob";

const CODE_PATTERNS = [
  // Node: process.env.VAR_NAME
  /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  // Vite: import.meta.env.VAR_NAME
  /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  // Deno: Deno.env.get("VAR_NAME")
  /Deno\.env\.get\(["']([^"']+)["']\)/g,
  // Python: os.environ["VAR_NAME"] or os.environ['VAR_NAME']
  /os\.environ\[["']([^"']+)["']\]/g,
  // Python: os.getenv("VAR_NAME")
  /os\.getenv\(["']([^"']+)["']\)/g,
];

const SOURCE_GLOBS = [
  "**/*.{js,ts,jsx,tsx}",
  "**/*.py",
];

function readGitignore(cwd: string): string[] {
  try {
    const content = readFileSync(join(cwd, ".gitignore"), "utf-8");
    return content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return ["node_modules", ".git"];
  }
}

export async function scanCodeRefs(cwd: string): Promise<Map<string, string[]>> {
  const gitignorePatterns = readGitignore(cwd);
  const files = await glob(SOURCE_GLOBS, {
    cwd,
    ignore: gitignorePatterns,
    dot: true,
    onlyFiles: true,
  });

  const refs = new Map<string, string[]>();

  for (const file of files) {
    const fullPath = join(cwd, file);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }

    for (const pattern of CODE_PATTERNS) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const varName = match[1];
        if (!varName) continue;
        const existing = refs.get(varName) ?? [];
        if (!existing.includes(file)) {
          existing.push(file);
        }
        refs.set(varName, existing);
      }
    }
  }

  return refs;
}
