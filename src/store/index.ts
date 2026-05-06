import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProjectSnapshot, ScanResult, ScannedVar, VarEntry } from "../types.js";

const STORE_DIR = join(homedir(), ".config", "lenver", "projects");

function ensureStoreDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

function projectPath(id: string): string {
  return join(STORE_DIR, `${id}.json`);
}

export function readProject(id: string): ProjectSnapshot | undefined {
  ensureStoreDir();
  const path = projectPath(id);
  if (!existsSync(path)) return undefined;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as ProjectSnapshot;
  } catch {
    return undefined;
  }
}

export function writeProject(snapshot: ProjectSnapshot): void {
  ensureStoreDir();
  const path = projectPath(snapshot.id);
  writeFileSync(path, JSON.stringify(snapshot, null, 2));
}

export function deleteProject(id: string): boolean {
  const path = projectPath(id);
  if (!existsSync(path)) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

export function listProjects(): ProjectSnapshot[] {
  ensureStoreDir();
  const files = readdirSync(STORE_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      try {
        const raw = readFileSync(join(STORE_DIR, f), "utf-8");
        return JSON.parse(raw) as ProjectSnapshot;
      } catch {
        return undefined;
      }
    })
    .filter((s): s is ProjectSnapshot => s !== undefined);
}

export function mergeScanIntoSnapshot(
  existing: ProjectSnapshot | undefined,
  scan: ScanResult,
  projectId: string,
  projectName: string,
  cwd: string,
  includeSensitive: boolean = false
): ProjectSnapshot {
  const vars: Record<string, VarEntry> = existing ? { ...existing.vars } : {};

  // Sort so non-sensitive files are processed last, ensuring their values take priority
  const sortedVars = [...scan.vars].sort((a, b) => {
    const aWeight = a.isSensitive ? 0 : 1;
    const bWeight = b.isSensitive ? 0 : 1;
    return aWeight - bWeight;
  });

  for (const sv of sortedVars) {
    const entry = vars[sv.key] ?? {
      value: null,
      sources: [],
      referencedIn: [],
      isSensitive: false,
    };

    // Update sources
    if (!entry.sources.includes(sv.source)) {
      entry.sources.push(sv.source);
    }

    // Update sensitivity
    if (sv.isSensitive) {
      entry.isSensitive = true;
    }

    // Update value
    if (sv.isExample) {
      // .env.example never writes a value
      entry.value = entry.value ?? null;
    } else if (sv.isSensitive && !includeSensitive) {
      entry.value = null;
    } else {
      entry.value = sv.value;
    }

    // Update referencedIn from code scan
    if (sv.referencedIn) {
      for (const file of sv.referencedIn) {
        if (!entry.referencedIn.includes(file)) {
          entry.referencedIn.push(file);
        }
      }
    }

    vars[sv.key] = entry;
  }

  return {
    id: projectId,
    name: projectName,
    cwd,
    lastScanned: new Date().toISOString(),
    vars,
    unresolvedRefs: scan.unresolvedRefs,
  };
}
