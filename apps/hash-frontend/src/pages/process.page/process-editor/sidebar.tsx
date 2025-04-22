import { Box, Stack } from "@mui/material";
import type { DragEvent } from "react";
import { useCallback } from "react";

import { placeStyling, transitionStyling } from "./styling";

export const Sidebar = () => {
  const onDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, nodeType: "place" | "transition") => {
      event.dataTransfer.setData("application/reactflow", nodeType);

      // eslint-disable-next-line no-param-reassign
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  return (
    <Stack
      alignItems="center"
      component="aside"
      gap={2}
      sx={{
        background: ({ palette }) => palette.gray[5],
        p: 2,
        borderRight: ({ palette }) => `1px solid ${palette.gray[30]}`,
      }}
    >
      <Box
        sx={[
          placeStyling,
          {
            cursor: "grab",
            width: 80,
            height: 80,
            fontSize: 14,
          },
        ]}
        draggable
        onDragStart={(event) => onDragStart(event, "place")}
      >
        Place
      </Box>
      <Box
        sx={[
          transitionStyling,
          {
            cursor: "grab",
            width: 100,
            height: 50,
            fontSize: 14,
          },
        ]}
        draggable
        onDragStart={(event) => onDragStart(event, "transition")}
      >
        Transition
      </Box>
    </Stack>
  );
};
