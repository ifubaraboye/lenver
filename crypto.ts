import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT_FILENAME = ".vault.enc";
const CONFIG_DIR = path.join(process.env.HOME ?? "~", ".config", "envvault");
const CONFIG_FILE = path.join(CONFIG_DIR, "last-vault");

async function saveLastVaultPath(p: string) {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(CONFIG_FILE, p, "utf8");
  } catch {}
}

export async function loadLastVaultPath(): Promise<string | null> {
  try {
    const p = (await fs.readFile(CONFIG_FILE, "utf8")).trim();
    await fs.access(p); // only return if the vault file still exists
    return p;
  } catch {
    return null;
  }
}
const ALGO = "aes-256-gcm";
const MAGIC = Buffer.from("EVLT");
const SCRYPT_OPTS = { N: 131072, r: 8, p: 1, maxmem: 1024 * 1024 * 1024 };

export interface VaultData {
  __meta__: { version: number; hint?: string };
  [key: string]: any;
}

export interface DriveInfo {
  path: string;
  label: string;
  name: string;
  isDefault?: boolean;
  mounted: boolean;
}

// ─── Drive Detection ──────────────────────────────────────────────────────────

export async function detectDrives(): Promise<DriveInfo[]> {
  const drives: DriveInfo[] = [];
  const seenPaths = new Set<string>();

  // Helper to add unique drive
  const add = (p: string, l: string, n: string, mounted: boolean, isDefault = false) => {
    if (!p || seenPaths.has(p)) return;
    seenPaths.add(p);
    drives.push({ path: p, label: l, name: n, mounted, isDefault });
  };

  // 1. ROBUST LSBLK SCAN (The most reliable method)
  try {
    const raw = execSync(
      "lsblk -J -o NAME,LABEL,MOUNTPOINTS,RM,HOTPLUG,SIZE,TYPE,FSTYPE",
      { encoding: "utf8", timeout: 2000 }
    );
    const data = JSON.parse(raw);

    const isTruthy = (v: any) => v === true || v === "1" || v === 1;

    const SYSTEM_MOUNTS = new Set(["/", "[SWAP]"]);
    const SYSTEM_PREFIXES = ["/boot", "/snap", "/sys", "/proc", "/dev", "/run/snapd"];

    const isSystemMount = (mp: string) =>
      SYSTEM_MOUNTS.has(mp) ||
      SYSTEM_PREFIXES.some(p => mp.startsWith(p));

    // lsblk >= 2.37 returns mountpoints (array), older returns mountpoint (string)
    const getMountpoints = (device: any): string[] => {
      if (Array.isArray(device.mountpoints)) {
        return device.mountpoints.filter(Boolean);
      }
      return device.mountpoint ? [device.mountpoint] : [];
    };

    const walk = (device: any, isParentRemovable = false) => {
      // FIX 1: coerce rm/hotplug — lsblk returns "1"/"0" strings or booleans
      const isRemovable = isParentRemovable || isTruthy(device.rm) || isTruthy(device.hotplug);
      const isInteresting = isRemovable || device.type === "part" || device.type === "rom";

      if (isInteresting) {
        for (const mp of getMountpoints(device)) {
          if (!isSystemMount(mp)) {
            let label = device.label || path.basename(mp);
            if (!label || label === "null") label = device.name;
            add(mp, `${label} (${device.size})`, label, true);
          }
        }
      }

      if (device.children) {
        device.children.forEach((child: any) => walk(child, isRemovable));
      }
    };

    if (data.blockdevices) {
      data.blockdevices.forEach((d: any) => walk(d));
    }

  } catch (e) {
    // lsblk failed, fall back to manual folder scan
  }

  // 1b. FALLBACK: Scan /dev/disk/by-id for unmounted USB drives (if lsblk missed them)
  // This handles cases where the drive is plugged in but not auto-mounted.
  try {
    const byIdDir = "/dev/disk/by-id";
    const entries = await fs.readdir(byIdDir).catch(() => []);
    const usbEntries = entries.filter(e => e.startsWith("usb-") && !e.includes("-part"));
    
    // Get list of currently mounted devices to avoid duplicates
    const mounts = await fs.readFile("/proc/mounts", "utf8").catch(() => "");
    const mountedDevs = new Set(mounts.split("\n").map(line => line.split(" ")[0]));

    for (const entry of usbEntries) {
      const fullPath = path.join(byIdDir, entry);
      const realPath = await fs.realpath(fullPath); // e.g., /dev/sda
      const name = path.basename(realPath);
      
      // Check partitions for this device
      const partEntries = entries.filter(e => e.startsWith(entry) && e !== entry);
      
      // If partitions exist, suggest them. If not, suggest raw device (or maybe it just has no partitions yet)
      const targets = partEntries.length > 0 ? partEntries : [entry];
      
      for (const target of targets) {
          const targetPath = await fs.realpath(path.join(byIdDir, target));
          
          // Skip if already found (mounted)
          if (seenPaths.has(targetPath)) continue;
          
          // Check if it's already mounted but somehow missed (unlikely but safe)
          if (mountedDevs.has(targetPath)) continue;
          
          // Check size to ensure it's valid
          try {
             const sizeSectors = await fs.readFile(`/sys/class/block/${path.basename(targetPath)}/size`, "utf8");
             const sizeBytes = parseInt(sizeSectors.trim()) * 512;
             if (sizeBytes <= 0) continue; 
             
             // Format size
             const sizeGB = (sizeBytes / (1024 * 1024 * 1024)).toFixed(1);
              add(targetPath, `${path.basename(target)} (${sizeGB}G) [Unmounted]`, path.basename(target), false);
          } catch {}
      }
    }
  } catch (e) {}

  // 2. FALLBACK: Manual Scan of Standard Mount Dirs (Gnome/Linux)
  // FIX 2: Try all likely usernames — sudo may mask the real user
  const candidates = [
    process.env.SUDO_USER,
    process.env.USER,
    process.env.LOGNAME,
    // Parse who is actually logged in to a display session
    (() => { try { return execSync("who | awk '{print $1}' | head -1", { encoding: "utf8", timeout: 500 }).trim(); } catch { return null; } })(),
  ].filter(Boolean) as string[];

  // Deduplicate but keep order
  const usernames = [...new Set(candidates)];

  const commonDirs: string[] = [
    ...usernames.flatMap(u => [
      `/run/media/${u}`,  // Modern Arch/Fedora (omarchy default)
      `/media/${u}`,      // Debian/Ubuntu
    ]),
    "/media",             // Old school
    "/mnt",              // Manual mounts
    "/Volumes",          // macOS
  ];

  for (const dir of commonDirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          add(path.join(dir, e.name), `${e.name} (manual scan)`, e.name, true);
        }
      }
    } catch {}
  }

  // 3. Current Directory (Always available)
  add(process.cwd(), "Current Folder", "Current Folder", true, true);

  return drives;
}

// ─── Vault Logic (Unchanged) ──────────────────────────────────────────────────

export class VaultManager {
  private masterKey: Buffer | null = null;
  private salt: Buffer | null = null;
  public data: VaultData | null = null;
  private vaultPath: string;

  constructor() {
    const projectDir = path.dirname(fileURLToPath(import.meta.url));
    this.vaultPath = path.join(projectDir, VAULT_FILENAME);
  }

  setVaultDir(dir: string) {
    this.vaultPath = path.join(dir, VAULT_FILENAME);
    saveLastVaultPath(this.vaultPath);
  }

  getVaultPath() {
    return this.vaultPath;
  }

  async exists(): Promise<boolean> {
    try { await fs.access(this.vaultPath); return true; } catch { return false; }
  }

  private deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) =>
      crypto.scrypt(password, salt, 32, SCRYPT_OPTS, (err, key) =>
        err ? reject(err) : resolve(key as Buffer)
      )
    );
  }

  async init(password: string, hint = "") {
    this.salt = crypto.randomBytes(32);
    this.masterKey = await this.deriveKey(password, this.salt);
    this.data = { __meta__: { version: 1, hint } };
    await this.save();
  }

  async unlock(password: string): Promise<boolean> {
    try {
      const buf = await fs.readFile(this.vaultPath);
      if (!buf.subarray(0, 4).equals(MAGIC)) return false;

      const salt = buf.subarray(4, 36);
      const iv   = buf.subarray(36, 48);
      const tag  = buf.subarray(48, 64);
      const text = buf.subarray(64);

      const key = await this.deriveKey(password, salt);
      const dec = crypto.createDecipheriv(ALGO, key, iv);
      dec.setAuthTag(tag);

      this.data = JSON.parse(
        Buffer.concat([dec.update(text), dec.final()]).toString("utf8")
      );
      this.masterKey = key;
      this.salt = salt;
      return true;
    } catch {
      return false;
    }
  }

  async save() {
    if (!this.masterKey || !this.data || !this.salt) throw new Error("Vault not unlocked");
    const salt = this.salt;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, this.masterKey, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(this.data), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    await fs.writeFile(this.vaultPath, Buffer.concat([MAGIC, salt, iv, tag, enc]), { mode: 0o600 });
  }

  getExports(): string {
    if (!this.data) return "";
    return Object.entries(this.data)
      .filter(([k]) => k !== "__meta__")
      .map(([k, v]) => `export ${k}='${String(v.value).replace(/'/g, "'\\''")}'`)
      .join("\n");
  }
}

export const vault = new VaultManager();