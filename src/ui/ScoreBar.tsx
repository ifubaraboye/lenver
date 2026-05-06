import React from "react";
import { Text } from "ink";

interface ScoreBarProps {
  percent: number;
  width?: number;
}

export function ScoreBar({ percent, width = 50 }: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;

  const color = clamped >= 75 ? "green" : clamped >= 50 ? "yellow" : "red";

  return (
    <Text>
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text dimColor>{"░".repeat(empty)}</Text>
    </Text>
  );
}
