import React, { useState } from "react";
import { Box, Text } from "ink";
import { deleteProject, listProjects } from "../store/index.js";

export function DeleteCommand() {
  const [nameOrId] = useState(process.argv[3] || "");
  const [result, setResult] = useState<string | null>(null);

  React.useEffect(() => {
    if (!nameOrId) {
      setResult("Usage: lenver delete <project-name-or-id>");
      return;
    }

    const projects = listProjects();
    const target = projects.find(
      (p) => p.id === nameOrId || p.name === nameOrId
    );

    if (!target) {
      setResult(`Project "${nameOrId}" not found. Run \`lenver\` to see all projects.`);
      return;
    }

    const success = deleteProject(target.id);
    if (success) {
      setResult(`Deleted "${target.name}" (${Object.keys(target.vars).length} vars removed)`);
    } else {
      setResult(`Failed to delete "${target.name}"`);
    }
  }, [nameOrId]);

  const isError = result?.startsWith("Usage:") || result?.includes("not found") || result?.startsWith("Failed");

  return (
    <Box>
      <Text color={isError ? "red" : "green"}>{result}</Text>
    </Box>
  );
}
