import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { FramedBox } from "../ui/FramedBox.js";
import { DoctorFace } from "../ui/DoctorFace.js";
import { ProjectView } from "../ui/ProjectView.js";
import { listProjects, deleteProject } from "../store/index.js";
import type { ProjectSnapshot } from "../types.js";

export function DefaultCommand() {
  const [projects, setProjects] = useState(listProjects());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedProject, setSelectedProject] = useState<ProjectSnapshot | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useInput((input, key) => {
    if (selectedProject) {
      if (key.escape) {
        setSelectedProject(null);
      }
      return;
    }

    if (confirmDelete) {
      if (input.toLowerCase() === "y") {
        const toDelete = projects[selectedIndex];
        if (toDelete) {
          deleteProject(toDelete.id);
          const updated = listProjects();
          setProjects(updated);
          setSelectedIndex(Math.min(selectedIndex, updated.length - 1));
        }
        setConfirmDelete(false);
      } else if (input.toLowerCase() === "n" || key.escape) {
        setConfirmDelete(false);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(projects.length - 1, i + 1));
    } else if (key.return) {
      setSelectedProject(projects[selectedIndex]);
    } else if (input.toLowerCase() === "d") {
      setConfirmDelete(true);
    } else if (input.toLowerCase() === "q" || key.escape) {
      process.exit(0);
    }
  });

  if (projects.length === 0) {
    return (
      <Box>
        <Text dimColor>No projects found. Run `lenver scan` in a project directory.</Text>
      </Box>
    );
  }

  if (selectedProject) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>Press Esc to go back</Text>
        <ProjectView snapshot={selectedProject} />
      </Box>
    );
  }

  if (confirmDelete) {
    const target = projects[selectedIndex];
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="red">Delete project "{target?.name}"?</Text>
        <Text dimColor>This will remove {Object.keys(target?.vars ?? {}).length} vars from storage.</Text>
        <Text dimColor>Press Y to confirm, N to cancel</Text>
      </Box>
    );
  }

  const totalVars = projects.reduce((sum, p) => sum + Object.keys(p.vars).length, 0);
  const totalUnresolved = projects.reduce((sum, p) => sum + p.unresolvedRefs.length, 0);

  return (
    <Box flexDirection="column" gap={1}>
      <FramedBox width={40}>
        <Box flexDirection="row" gap={2}>
          <DoctorFace mood={totalUnresolved > 0 ? "critical" : "happy"} />
          <Box flexDirection="column" justifyContent="center">
            <Text>lenver</Text>
            <Text dimColor>{projects.length} projects · {totalVars} vars</Text>
            {totalUnresolved > 0 && (
              <Text color="red">{totalUnresolved} unresolved</Text>
            )}
          </Box>
        </Box>
      </FramedBox>

      <Box flexDirection="column">
        {projects.map((p, i) => {
          const isSelected = i === selectedIndex;
          const unresolved = p.unresolvedRefs.length;
          const vars = Object.keys(p.vars).length;

          return (
            <Box key={p.id} flexDirection="row">
              <Text color={isSelected ? "cyan" : undefined}>
                {isSelected ? "› " : "  "}
                {unresolved > 0 ? "✗" : "✓"} {p.name}
              </Text>
              <Text dimColor>
                {" "}({vars} vars{unresolved > 0 ? `, ${unresolved} unresolved` : ""}){" "}
                {new Date(p.lastScanned).toLocaleDateString()}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Text dimColor>  ↑↓ navigate · Enter to select · D to delete · Q to exit</Text>
    </Box>
  );
}
