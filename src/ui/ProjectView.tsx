import React from "react";
import { Box, Text } from "ink";
import { FramedBox } from "./FramedBox.js";
import { DoctorFace } from "./DoctorFace.js";
import { ScoreBar } from "./ScoreBar.js";
import type { ProjectSnapshot } from "../types.js";

interface ProjectViewProps {
  snapshot: ProjectSnapshot;
  showValues?: boolean;
  showHeader?: boolean;
}

export function ProjectView({ snapshot, showValues = false, showHeader = true }: ProjectViewProps) {
  const totalVars = Object.keys(snapshot.vars).length;
  const unresolvedCount = snapshot.unresolvedRefs.length;
  const sensitiveCount = Object.values(snapshot.vars).filter((v) => v.isSensitive).length;
  const resolvedCount = totalVars - unresolvedCount;

  let mood: "happy" | "neutral" | "critical" = "happy";
  if (unresolvedCount > 0) mood = "critical";
  else if (sensitiveCount > 0) mood = "neutral";

  const percent = totalVars > 0 ? (resolvedCount / totalVars) * 100 : 100;

  return (
    <Box flexDirection="column" gap={1}>
      {showHeader && (
        <FramedBox width={40}>
          <Box flexDirection="row" gap={2}>
            <DoctorFace mood={mood} />
            <Box flexDirection="column" justifyContent="center">
              <Text>{snapshot.name}</Text>
              <Text dimColor>{resolvedCount} / {totalVars} vars</Text>
              <ScoreBar percent={percent} width={30} />
              <Box flexDirection="row" gap={2}>
                {unresolvedCount > 0 && (
                  <Text color="red">✗ {unresolvedCount} unresolved</Text>
                )}
                {sensitiveCount > 0 && (
                  <Text color="yellow">~ {sensitiveCount} sensitive</Text>
                )}
                {unresolvedCount === 0 && sensitiveCount === 0 && (
                  <Text color="green">✓ all clean</Text>
                )}
              </Box>
            </Box>
          </Box>
        </FramedBox>
      )}

      <Box flexDirection="column" gap={0}>
        {snapshot.unresolvedRefs.map((ref) => (
          <Box key={ref} flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text color="red">  ✗ {ref}</Text>
              <Text dimColor>unresolved</Text>
            </Box>
            <Text dimColor>    referenced in code but not defined</Text>
          </Box>
        ))}

        {Object.entries(snapshot.vars).map(([key, entry]) => {
          if (snapshot.unresolvedRefs.includes(key)) return null;

          const sourceText = entry.sources.join(", ");
          const keyPadding = 30;
          const paddedKey = key.length >= keyPadding ? key : key + " ".repeat(keyPadding - key.length);

          const valuePreview = showValues
            ? entry.value ?? "null"
            : entry.isSensitive
            ? "[sensitive]"
            : entry.value === null
            ? "null"
            : "••••••••";

          if (entry.isSensitive) {
            return (
              <Box key={key} flexDirection="column">
                <Box flexDirection="row">
                  <Text color="yellow">  ~ {paddedKey}</Text>
                  <Text dimColor>{sourceText}</Text>
                </Box>
                <Text dimColor>    {valuePreview}</Text>
              </Box>
            );
          }

          return (
            <Box key={key} flexDirection="column">
              <Box flexDirection="row">
                <Text color="green">  ✓ {paddedKey}</Text>
                <Text dimColor>{sourceText}</Text>
              </Box>
              <Text dimColor>    {valuePreview}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
