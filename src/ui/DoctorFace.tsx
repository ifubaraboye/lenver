import React from "react";
import { Box, Text } from "ink";

type FaceMood = "happy" | "neutral" | "critical";

interface DoctorFaceProps {
  mood: FaceMood;
}

export function DoctorFace({ mood }: DoctorFaceProps) {
  const faces = {
    happy:    { eyes: "  ◠   ◠  ", mouth: "   ▽   ", color: "green"  },
    neutral:  { eyes: "  •   •  ", mouth: "   ─   ", color: "yellow" },
    critical: { eyes: "  ×   ×  ", mouth: "   ▽   ", color: "red"    },
  };

  const face = faces[mood];

  return (
    <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={face.color}
          paddingX={1}
          paddingY={1}
        >
      <Text color={face.color}>{face.eyes}</Text>
      <Text color={face.color}>{face.mouth}</Text>
    </Box>
  );
}

export type { FaceMood };