import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

interface AnimatedItem {
  id: string;
  marker: "×" | "✓" | "~" | "+" | "-";
  text: string;
  count?: string;
  detail?: string;
  color: "red" | "green" | "yellow" | "gray";
}

interface AnimatedListProps {
  items: AnimatedItem[];
  staggerMs?: number;
}

export function AnimatedList({ items, staggerMs = 40 }: AnimatedListProps) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= items.length) return;
    const timer = setTimeout(() => {
      setVisibleCount((c) => c + 1);
    }, staggerMs);
    return () => clearTimeout(timer);
  }, [visibleCount, items.length, staggerMs]);

  return (
    <Box flexDirection="column">
      {items.slice(0, visibleCount).map((item, index) => (
        <Box key={item.id} flexDirection="row">
          <Text color={item.color}>
            {item.marker} {item.text}
          </Text>
          {item.count && <Text color={item.color}> ({item.count})</Text>}
          {item.detail && <Text dimColor>  {item.detail}</Text>}
        </Box>
      ))}
    </Box>
  );
}

export type { AnimatedItem };
