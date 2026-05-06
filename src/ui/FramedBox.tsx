import React from "react";
import { Box, Text } from "ink";

interface FramedBoxProps {
  children: React.ReactNode;
  width?: number;
}

export function FramedBox({ children, width = 50 }: FramedBoxProps) {
  const borderLine = "─".repeat(width);

  return (
    <Box flexDirection="column">
      <Text dimColor>  ┌{borderLine}┐</Text>
      <Box flexDirection="column" paddingLeft={3}>
        {children}
      </Box>
      <Text dimColor>  └{borderLine}┘</Text>
    </Box>
  );
}
