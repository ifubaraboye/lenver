import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface ConfirmPromptProps {
  message: string;
  onConfirm: (confirmed: boolean) => void;
}

export function ConfirmPrompt({ message, onConfirm }: ConfirmPromptProps) {
  const [answer, setAnswer] = useState<"yes" | "no" | undefined>(undefined);

  useInput((input, key) => {
    if (key.return && answer) {
      onConfirm(answer === "yes");
      return;
    }
    const lower = input.toLowerCase();
    if (lower === "y") {
      setAnswer("yes");
      onConfirm(true);
    } else if (lower === "n" || lower === "q" || key.escape) {
      setAnswer("no");
      onConfirm(false);
    }
  });

  return (
    <Box>
      <Text>{message} [Y/n] </Text>
      {answer === "yes" && <Text color="green">Yes</Text>}
      {answer === "no" && <Text color="red">No</Text>}
    </Box>
  );
}
