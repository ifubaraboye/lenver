import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

export interface DriveInfo {
  path: string;
  label: string;
  name: string;
  isDefault?: boolean;
  mounted: boolean;
}

interface LsblkDevice {
  name?: unknown;
  label?: unknown;
  mountpoints?: unknown;
  mountpoint?: unknown;
  rm?: unknown;
  hotplug?: unknown;
  size?: unknown;
  type?: unknown;
  children?: unknown;
}

const SYSTEM_MOUNTS = new Set(["/", "[SWAP]"]);
const SYSTEM_PREFIXES = ["/boot", "/snap", "/sys", "/proc", "/dev", "/run/snapd"];

const isTruthy = (value: unknown) => value === true || value === 1 || value === "1";

const isSystemMount = (mountpoint: string) =>
  SYSTEM_MOUNTS.has(mountpoint) || SYSTEM_PREFIXES.some((prefix) => mountpoint.startsWith(prefix));

function getMountpoints(device: LsblkDevice): string[] {
  if (Array.isArray(device.mountpoints)) {
    return device.mountpoints.filter((mountpoint): mountpoint is string => typeof mountpoint === "string" && mountpoint.length > 0);
  }

  if (typeof device.mountpoint === "string" && device.mountpoint.length > 0) {
    return [device.mountpoint];
  }

  return [];
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value !== "null" ? value : null;
}

function addDrive(drives: DriveInfo[], seenPaths: Set<string>, drive: DriveInfo) {
  if (!drive.path || seenPaths.has(drive.path)) {
    return;
  }

  seenPaths.add(drive.path);
  drives.push(drive);
}

function walkBlockDevices(
  device: LsblkDevice,
  drives: DriveInfo[],
  seenPaths: Set<string>,
  isParentRemovable = false,
) {
  const isRemovable = isParentRemovable || isTruthy(device.rm) || isTruthy(device.hotplug);
  const deviceType = normalizeString(device.type);
  const isInteresting = isRemovable || deviceType === "part" || deviceType === "rom";

  if (isInteresting) {
    for (const mountpoint of getMountpoints(device)) {
      if (isSystemMount(mountpoint)) {
        continue;
      }

      const fallbackName = path.basename(mountpoint);
      const name = normalizeString(device.label) ?? normalizeString(device.name) ?? fallbackName;
      const size = normalizeString(device.size);
      const label = size ? `${name} (${size})` : name;
      addDrive(drives, seenPaths, {
        path: mountpoint,
        label,
        name,
        mounted: true,
      });
    }
  }

  if (Array.isArray(device.children)) {
    for (const child of device.children) {
      if (child && typeof child === "object") {
        walkBlockDevices(child as LsblkDevice, drives, seenPaths, isRemovable);
      }
    }
  }
}

export function parseLsblkOutput(raw: string): DriveInfo[] {
  const parsed = JSON.parse(raw) as { blockdevices?: unknown };
  const drives: DriveInfo[] = [];
  const seenPaths = new Set<string>();

  if (!Array.isArray(parsed.blockdevices)) {
    return drives;
  }

  for (const device of parsed.blockdevices) {
    if (device && typeof device === "object") {
      walkBlockDevices(device as LsblkDevice, drives, seenPaths);
    }
  }

  return drives;
}

function getCandidateUsers(): string[] {
  const candidates = [
    process.env.SUDO_USER,
    process.env.USER,
    process.env.LOGNAME,
    (() => {
      try {
        return execSync("who | awk '{print $1}' | head -1", { encoding: "utf8", timeout: 500 }).trim();
      } catch {
        return null;
      }
    })(),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return [...new Set(candidates)];
}

async function scanLinuxUnmountedUsb(drives: DriveInfo[], seenPaths: Set<string>) {
  try {
    const byIdDir = "/dev/disk/by-id";
    const entries = await fs.readdir(byIdDir).catch(() => []);
    const usbEntries = entries.filter((entry) => entry.startsWith("usb-") && !entry.includes("-part"));
    const mounts = await fs.readFile("/proc/mounts", "utf8").catch(() => "");
    const mountedDevices = new Set(mounts.split("\n").map((line) => line.split(" ")[0]).filter(Boolean));

    for (const entry of usbEntries) {
      const partitionEntries = entries.filter((candidate) => candidate.startsWith(entry) && candidate !== entry);
      const targets = partitionEntries.length > 0 ? partitionEntries : [entry];

      for (const target of targets) {
        const targetPath = await fs.realpath(path.join(byIdDir, target)).catch(() => null);
        if (!targetPath || seenPaths.has(targetPath) || mountedDevices.has(targetPath)) {
          continue;
        }

        try {
          const sizeSectors = await fs.readFile(`/sys/class/block/${path.basename(targetPath)}/size`, "utf8");
          const sizeBytes = Number.parseInt(sizeSectors.trim(), 10) * 512;
          if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
            continue;
          }

          const sizeGb = (sizeBytes / (1024 * 1024 * 1024)).toFixed(1);
          addDrive(drives, seenPaths, {
            path: targetPath,
            label: `${path.basename(target)} (${sizeGb}G) [Unmounted]`,
            name: path.basename(target),
            mounted: false,
          });
        } catch {}
      }
    }
  } catch {}
}

async function scanCommonMountDirs(drives: DriveInfo[], seenPaths: Set<string>) {
  const usernames = getCandidateUsers();
  const platform = process.platform;
  const commonDirs =
    platform === "darwin"
      ? ["/Volumes"]
      : [
          ...usernames.flatMap((username) => [`/run/media/${username}`, `/media/${username}`]),
          "/media",
          "/mnt",
          "/Volumes",
        ];

  for (const dir of commonDirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        addDrive(drives, seenPaths, {
          path: path.join(dir, entry.name),
          label: `${entry.name} (manual scan)`,
          name: entry.name,
          mounted: true,
        });
      }
    } catch {}
  }
}

export async function detectDrives(): Promise<DriveInfo[]> {
  const drives: DriveInfo[] = [];
  const seenPaths = new Set<string>();

  if (process.platform === "linux") {
    try {
      const raw = execSync("lsblk -J -o NAME,LABEL,MOUNTPOINTS,RM,HOTPLUG,SIZE,TYPE,FSTYPE", {
        encoding: "utf8",
        timeout: 2000,
      });
      for (const drive of parseLsblkOutput(raw)) {
        addDrive(drives, seenPaths, drive);
      }
    } catch {}

    await scanLinuxUnmountedUsb(drives, seenPaths);
  }

  await scanCommonMountDirs(drives, seenPaths);

  addDrive(drives, seenPaths, {
    path: process.cwd(),
    label: "Current Folder",
    name: "Current Folder",
    mounted: true,
    isDefault: true,
  });

  return drives;
}
