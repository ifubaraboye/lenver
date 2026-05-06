import { scanDotenvFiles } from "./dotenv.js";
import { scanCodeRefs } from "./code.js";
import type { ScanResult, ScannedVar } from "../types.js";

export async function runScan(cwd: string): Promise<ScanResult> {
  const [dotenvVars, codeRefs] = await Promise.all([
    scanDotenvFiles(cwd),
    scanCodeRefs(cwd),
  ]);

  // Build a set of all keys found in .env files
  const definedKeys = new Set(dotenvVars.map((v) => v.key));

  // Attach referencedIn to vars that exist in .env files
  const varsWithRefs: ScannedVar[] = dotenvVars.map((v) => {
    const files = codeRefs.get(v.key);
    return {
      ...v,
      referencedIn: files ?? [],
    };
  });

  // Calculate unresolved refs: referenced in code but not in .env
  const unresolvedRefs: string[] = [];
  for (const key of codeRefs.keys()) {
    if (!definedKeys.has(key)) {
      unresolvedRefs.push(key);
    }
  }

  return {
    vars: varsWithRefs,
    referencedVars: Array.from(codeRefs.keys()),
    unresolvedRefs,
  };
}
