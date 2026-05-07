import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { FramedBox } from "../ui/FramedBox.js";
import { DoctorFace } from "../ui/DoctorFace.js";
import { ConfirmPrompt } from "../ui/ConfirmPrompt.js";
import { listProjects } from "../store/index.js";
import type { ProjectSnapshot, VarEntry } from "../types.js";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

type Phase = "select" | "review" | "done" | "cancelled";

interface FileGroup {
  filename: string;
  vars: Array<{ key: string; entry: VarEntry }>;
  willOverwrite: boolean;
  written: number;
  omitted: number;
}

export function InitCommand() {
  const [projects] = useState(listProjects());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedProject, setSelectedProject] = useState<ProjectSnapshot | null>(null);
  const [phase, setPhase] = useState<Phase>("select");
  const [fileGroups, setFileGroups] = useState<FileGroup[]>([]);

  useInput((input, key) => {
    if (phase === "select") {
      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedIndex((i) => Math.min(projects.length - 1, i + 1));
      } else if (key.return) {
        const project = projects[selectedIndex];
        if (project) {
          setSelectedProject(project);
          const groups = buildFileGroups(project);
          setFileGroups(groups);
          setPhase("review");
        }
      } else if (input.toLowerCase() === "q" || key.escape) {
        process.exit(0);
      }
      return;
    }
  });

  React.useEffect(() => {
    if (phase === "cancelled") {
      const timer = setTimeout(() => process.exit(0), 100);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  function buildFileGroups(project: ProjectSnapshot): FileGroup[] {
    const cwd = process.cwd();
    const groups = new Map<string, Array<{ key: string; entry: VarEntry }>>();

    for (const [key, entry] of Object.entries(project.vars)) {
      // Each variable may have multiple source files — write it to each
      for (const source of entry.sources) {
        const filename = source.replace(/^.*[\\/]/, ""); // basename
        if (!groups.has(filename)) {
          groups.set(filename, []);
        }
        groups.get(filename)!.push({ key, entry });
      }
    }

    return Array.from(groups.entries()).map(([filename, vars]) => ({
      filename,
      vars,
      willOverwrite: existsSync(join(cwd, filename)),
      written: 0,
      omitted: 0,
    }));
  }

  function writeFiles(project: ProjectSnapshot, groups: FileGroup[]) {
    const cwd = process.cwd();
    const updatedGroups: FileGroup[] = [];

    for (const group of groups) {
      const targetPath = join(cwd, group.filename);
      const lines: string[] = [];
      let written = 0;
      let omitted = 0;

      // Header
      lines.push(`# Pulled from lenver project: ${project.name}`);
      lines.push(`# Source: ${project.cwd}`);
      lines.push(`# Last scanned: ${project.lastScanned}`);
      lines.push("");

      for (const { key, entry } of group.vars) {
        if (entry.isSensitive) {
          lines.push(`# ${key}=`);
          lines.push(`# ^ sensitive value omitted — set manually`);
          omitted++;
        } else if (entry.value === null) {
          lines.push(`# ${key}=`);
          lines.push(`# ^ value not available in store`);
          omitted++;
        } else {
          lines.push(`${key}=${entry.value}`);
          written++;
        }
        lines.push("");
      }

      writeFileSync(targetPath, lines.join("\n"), "utf-8");
      updatedGroups.push({ ...group, written, omitted });
    }

    setFileGroups(updatedGroups);
  }

  if (projects.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        <FramedBox width={40}>
          <Box flexDirection="row" gap={2}>
            <DoctorFace mood="neutral" />
            <Box flexDirection="column" justifyContent="center">
              <Text>lenver init</Text>
              <Text dimColor>No saved projects</Text>
            </Box>
          </Box>
        </FramedBox>
        <Text dimColor>Run `lenver scan` in a project first to save its variables.</Text>
      </Box>
    );
  }

  if (phase === "select") {
    return (
      <Box flexDirection="column" gap={1}>
        <FramedBox width={40}>
          <Box flexDirection="row" gap={2}>
            <DoctorFace mood="happy" />
            <Box flexDirection="column" justifyContent="center">
              <Text>lenver init</Text>
              <Text dimColor>Select a project to pull</Text>
            </Box>
          </Box>
        </FramedBox>

        <Box flexDirection="column">
          {projects.map((p, i) => {
            const isSelected = i === selectedIndex;
            const vars = Object.keys(p.vars).length;
            return (
              <Box key={p.id} flexDirection="row">
                <Text color={isSelected ? "cyan" : undefined}>
                  {isSelected ? "› " : "  "}
                  {p.name}
                </Text>
                <Text dimColor>
                  {" "}({vars} vars) {p.cwd.replace(process.env.HOME || "/home", "~")}
                </Text>
              </Box>
            );
          })}
        </Box>

        <Text dimColor>  ↑↓ navigate · Enter to select · Q to exit</Text>
      </Box>
    );
  }

  if (phase === "review") {
    const project = selectedProject!;
    const totalVars = Object.keys(project.vars).length;
    const sensitiveVars = Object.entries(project.vars).filter(([_, v]) => v.isSensitive).length;
    const anyOverwrite = fileGroups.some((g) => g.willOverwrite);

    return (
      <Box flexDirection="column" gap={1}>
        <FramedBox width={40}>
          <Box flexDirection="row" gap={2}>
            <DoctorFace mood={sensitiveVars > 0 ? "neutral" : "happy"} />
            <Box flexDirection="column" justifyContent="center">
              <Text>{project.name}</Text>
              <Text dimColor>{totalVars} vars · {fileGroups.length} files · {sensitiveVars} sensitive</Text>
            </Box>
          </Box>
        </FramedBox>

        <Box flexDirection="column" gap={1}>
          {fileGroups.map((group) => (
            <Box key={group.filename} flexDirection="column">
              <Box flexDirection="row">
                <Text color={group.willOverwrite ? "yellow" : "green"}>
                  {group.willOverwrite ? "~" : "✓"} {group.filename}
                </Text>
                <Text dimColor>
                  {" "}({group.vars.length} vars)
                  {group.willOverwrite && " will overwrite"}
                </Text>
              </Box>
              <Box flexDirection="column" paddingLeft={3}>
                {group.vars.map(({ key, entry }) => (
                  <Box key={key} flexDirection="row">
                    <Text dimColor>
                      {entry.isSensitive ? "~" : "✓"} {key}
                      {" "}
                      {entry.isSensitive
                        ? "[sensitive]"
                        : entry.value === null
                        ? "[null]"
                        : "••••••"}
                    </Text>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>

        {anyOverwrite && (
          <Text color="yellow">
            {" "}Warning: some files already exist and will be overwritten.
          </Text>
        )}

        <ConfirmPrompt
          message={`Write to ${fileGroups.length} files?`}
          onConfirm={(confirmed) => {
            if (confirmed) {
              writeFiles(project, fileGroups);
              setPhase("done");
            } else {
              setPhase("cancelled");
            }
          }}
        />
      </Box>
    );
  }

  if (phase === "done") {
    const totalWritten = fileGroups.reduce((sum, g) => sum + g.written, 0);
    const totalOmitted = fileGroups.reduce((sum, g) => sum + g.omitted, 0);

    return (
      <Box flexDirection="column" gap={1}>
        <FramedBox width={40}>
          <Box flexDirection="row" gap={2}>
            <DoctorFace mood="happy" />
            <Box flexDirection="column" justifyContent="center">
              <Text>Done</Text>
              <Text dimColor>
                {totalWritten} written · {totalOmitted} omitted · {fileGroups.length} files
              </Text>
            </Box>
          </Box>
        </FramedBox>

        <Box flexDirection="column">
          {fileGroups.map((group) => (
            <Box key={group.filename} flexDirection="row">
              <Text color="green">✓ {group.filename}</Text>
              <Text dimColor>
                {" "}{group.written} vars
                {group.omitted > 0 && ` · ${group.omitted} omitted`}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Text>Init cancelled.</Text>
    </Box>
  );
}
