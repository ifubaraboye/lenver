import React from "react";
import { Box, Text } from "ink";
import { ProjectView } from "../ui/ProjectView.js";
import { readProject } from "../store/index.js";
import { getProjectId, getProjectName } from "../store/project.js";

interface ListCommandProps {
  showValues?: boolean;
}

export function ListCommand({ showValues = false }: ListCommandProps) {
  const cwd = process.cwd();
  const projectId = getProjectId(cwd);
  const projectName = getProjectName(cwd);
  const snapshot = readProject(projectId);

  if (!snapshot) {
    return (
      <Box>
        <Text>
          No snapshot found for <Text>{projectName}</Text>. Run{" "}
          <Text>lenver scan</Text> first.
        </Text>
      </Box>
    );
  }

  return <ProjectView snapshot={snapshot} showValues={showValues} />;
}
