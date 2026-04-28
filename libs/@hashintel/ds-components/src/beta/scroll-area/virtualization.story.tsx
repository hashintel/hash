"use client";

import { Box, Center } from "@hashintel/ds-helpers/jsx";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

import * as ScrollArea from "./scroll-area";

export const App = () => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: 200,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    gap: 8,
  });

  return (
    <ScrollArea.Root height="72">
      <ScrollArea.Viewport ref={scrollRef}>
        <ScrollArea.Content>
          <Box
            position="relative"
            width="full"
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => (
              <Center
                key={virtualItem.key}
                bg="gray.subtle.bg"
                position="absolute"
                inset="0"
                style={{
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                Item #{virtualItem.index}
              </Center>
            ))}
          </Box>
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar>
        <ScrollArea.Thumb />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
};
