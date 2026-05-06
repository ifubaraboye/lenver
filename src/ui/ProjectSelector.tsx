import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ProjectSnapshot } from "../types.js";

interface ProjectSelectorProps {
  projects: ProjectSnapshot[];
  onSelect: (project: ProjectSnapshot) => void;
}

export function ProjectSelector({ projects, onSelect }: ProjectSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(projects.length - 1, i + 1));
    } else if (key.return) {
      onSelect(projects[selectedIndex]);
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Select a project:</Text>
      <Box flexDirection="column">
        {projects.map((p, i) => {
          const isSelected = i === selectedIndex;
          const unresolved = p.unresolvedRefs.length;
          const vars = Object.keys(p.vars).length;

          return (
            <Box key={p.id} flexDirection="row">
              <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                {isSelected ? "› " : "  "}
                {p.name}
              </Text>
              <Text dimColor>
                {" "}({vars} vars{unresolved > 0 ? `, ${unresolved} unresolved` : ""}){" "}
                {new Date(p.lastScanned).toLocaleDateString()}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Text dimColor>↑↓ to navigate · Enter to select</Text>
    </Box>
  );
}
