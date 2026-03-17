import { describe, expect, it } from "bun:test";
import { parseLsblkOutput } from "./drive-detection";

describe("parseLsblkOutput", () => {
  it("returns removable mounted drives and ignores system mounts", () => {
    const drives = parseLsblkOutput(JSON.stringify({
      blockdevices: [
        {
          name: "nvme0n1",
          type: "disk",
          rm: "0",
          children: [
            {
              name: "nvme0n1p1",
              type: "part",
              mountpoints: ["/"],
              label: "root",
              size: "256G",
            },
          ],
        },
        {
          name: "sdb",
          type: "disk",
          rm: "1",
          size: "29.8G",
          children: [
            {
              name: "sdb1",
              type: "part",
              label: "WORK_USB",
              mountpoints: ["/media/oribi/WORK_USB"],
              size: "29.8G",
            },
          ],
        },
      ],
    }));

    expect(drives).toEqual([
      {
        path: "/media/oribi/WORK_USB",
        label: "WORK_USB (29.8G)",
        name: "WORK_USB",
        mounted: true,
      },
    ]);
  });
});
