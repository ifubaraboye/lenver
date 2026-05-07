import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { scanStream } from "../scanner/stream.js";
import { readProject, writeProject, mergeScanIntoSnapshot } from "../store/index.js";
import { getProjectId, getProjectName } from "../store/project.js";
import { ConfirmPrompt } from "../ui/ConfirmPrompt.js";
import { FramedBox } from "../ui/FramedBox.js";
import { DoctorFace } from "../ui/DoctorFace.js";
import { ScoreBar } from "../ui/ScoreBar.js";
import { ProjectView } from "../ui/ProjectView.js";
import type { ScannedVar, ProjectSnapshot } from "../types.js";

type Phase = "confirm" | "scanning" | "review" | "naming" | "saved" | "cancelled";

interface ScanCommandProps {
  includeSensitive?: boolean;
}

export function ScanCommand({ includeSensitive = false }: ScanCommandProps) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [scannedFiles, setScannedFiles] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const [vars, setVars] = useState<ScannedVar[]>([]);
  const [projectName, setProjectName] = useState(getProjectName());
  const [error, setError] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<ProjectSnapshot | null>(null);

  const cwd = process.cwd();
  const projectId = getProjectId(cwd);

  useEffect(() => {
    if (phase !== "scanning") return;

    const allVars: ScannedVar[] = [];

    async function run() {
      try {
        for await (const event of scanStream(cwd)) {
          switch (event.type) {
            case "file": {
              setScannedFiles((c) => c + 1);
              setCurrentFile(event.file);
              break;
            }
            case "var": {
              const sv = event.var;
              allVars.push(sv);
              setVars((prev) => [...prev, sv]);
              break;
            }
            case "done": {
              const varsWithRefs = allVars.map((v) => ({
                ...v,
                referencedIn: [] as string[],
              }));

              const existing = readProject(projectId);
              const snapshot = mergeScanIntoSnapshot(
                existing,
                { vars: varsWithRefs, referencedVars: [], unresolvedRefs: [] },
                projectId,
                projectName,
                cwd,
                includeSensitive
              );
              writeProject(snapshot);
              setSavedSnapshot(snapshot);
              setPhase("review");
              break;
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }

    run();
  }, [phase, cwd, projectId, projectName, includeSensitive]);

  useInput((input, key) => {
    if (phase === "review" && key.return) {
      setPhase("naming");
    } else if (phase === "review" && (input.toLowerCase() === "q" || key.escape)) {
      setPhase("cancelled");
    } else if (phase === "naming" && (input.toLowerCase() === "q" || key.escape)) {
      setPhase("cancelled");
    }
  });

  React.useEffect(() => {
    if (phase === "cancelled") {
      const timer = setTimeout(() => process.exit(0), 100);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  if (error) {
    return (
      <Box>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (phase === "confirm") {
    return (
      <ConfirmPrompt
        message={`Scan env files in ${cwd}?`}
        onConfirm={(confirmed) => {
          if (confirmed) setPhase("scanning");
          else setPhase("cancelled");
        }}
      />
    );
  }

  if (phase === "scanning" || phase === "review") {
    const totalVars = vars.length;
    const sensitiveCount = vars.filter((v) => v.isSensitive).length;
    const resolvedCount = totalVars - sensitiveCount;
    const percent = totalVars > 0 ? (resolvedCount / totalVars) * 100 : 100;

    let mood: "happy" | "neutral" | "critical" = "happy";
    if (sensitiveCount > 0) mood = "neutral";

    const isScanning = phase === "scanning";

    return (
      <Box flexDirection="column" gap={1}>
        <FramedBox width={40}>
          <Box flexDirection="row" gap={2}>
            <DoctorFace mood={mood} />
            <Box flexDirection="column" justifyContent="center">
              <Text>{projectName}</Text>
              <Text dimColor>{resolvedCount} / {totalVars} vars</Text>
              <ScoreBar percent={percent} width={30} />
              {isScanning ? (
                <Box flexDirection="row" gap={1}>
                  <Text color="green">
                    <Spinner type="dots" />
                  </Text>
                  <Text dimColor>{currentFile}</Text>
                </Box>
              ) : (
                <Text color="green">  ✓ Scan complete</Text>
              )}
            </Box>
          </Box>
        </FramedBox>

        <Box flexDirection="column">
          {vars.map((v, i) => {
            const sourceText = v.source;
            const keyPadding = 30;
            const paddedKey = v.key.length >= keyPadding ? v.key : v.key + " ".repeat(keyPadding - v.key.length);

            const valuePreview = v.isSensitive
              ? "[sensitive]"
              : v.isExample
              ? "[example]"
              : v.value === null
              ? "null"
              : "••••••••";

            return (
              <Box key={`${v.key}-${v.source}-${i}`} flexDirection="column">
                <Box flexDirection="row">
                  <Text color={v.isSensitive ? "yellow" : "green"}>
                    {v.isSensitive ? "~" : "✓"} {paddedKey}
                  </Text>
                  <Text dimColor>{sourceText}</Text>
                </Box>
                <Text dimColor>    {valuePreview}</Text>
              </Box>
            );
          })}
        </Box>

        {!isScanning && (
          <Box marginTop={1}>
            <Text dimColor>Press Enter to save, or Q to exit</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (phase === "naming") {
    return (
      <Box flexDirection="column" gap={1}>
        {savedSnapshot && <ProjectView snapshot={savedSnapshot} showHeader={true} />}

        <Box flexDirection="column" gap={0} marginTop={1}>
          <Text color="green">  ✓ Scan complete!</Text>
          <Text dimColor>  Name this project:</Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>  ┌────────────────────────────────────────┐</Text>
          <Box flexDirection="row" paddingLeft={3}>
            <Text>› </Text>
            <TextInput
              value={projectName}
              onChange={setProjectName}
              onSubmit={() => {
                if (savedSnapshot) {
                  const updated = { ...savedSnapshot, name: projectName };
                  writeProject(updated);
                  setPhase("saved");
                }
              }}
            />
          </Box>
          <Text dimColor>  └────────────────────────────────────────┘</Text>
          <Text dimColor>    {cwd.replace(process.env.HOME || "/home", "~")}</Text>
        </Box>
      </Box>
    );
  }

  if (phase === "saved") {
    return (
      <Box flexDirection="column" gap={1}>
        {savedSnapshot && <ProjectView snapshot={savedSnapshot} showHeader={true} />}

        <Box flexDirection="column" gap={0} marginTop={1}>
          <Text color="green">  ✓ Saved as "{projectName}"</Text>
          <Text dimColor>  Run `lenver` to see all projects</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Text>Scan cancelled.</Text>
    </Box>
  );
}
