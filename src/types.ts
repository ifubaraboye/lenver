export interface VarEntry {
  value: string | null;
  sources: string[];
  referencedIn: string[];
  isSensitive: boolean;
}

export interface ProjectSnapshot {
  id: string;
  name: string;
  cwd: string;
  lastScanned: string;
  vars: Record<string, VarEntry>;
  unresolvedRefs: string[];
}

export interface ScannedVar {
  key: string;
  value: string | null;
  source: string;
  isSensitive: boolean;
  isExample: boolean;
  referencedIn?: string[];
}

export interface ScanResult {
  vars: ScannedVar[];
  referencedVars: string[];
  unresolvedRefs: string[];
}
