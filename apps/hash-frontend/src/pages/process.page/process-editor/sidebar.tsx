import { Box, Stack } from "@mui/material";
import type { DragEvent } from "react";
import { useCallback } from "react";

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
      component="aside"
      gap={2}
      sx={{
        p: 2,
        width: 140,
        borderRight: "1px solid #ccc",
      }}
    >
      <Box
        sx={({ palette }) => ({
          background: palette.gray[30],
          borderRadius: "50%", // Circle preview for places
          p: 1,
          textAlign: "center",
          cursor: "grab",
          width: 100,
          height: 100,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: "1rem",
        })}
        draggable
        onDragStart={(event) => onDragStart(event, "place")}
      >
        Place
      </Box>
      <Box
        sx={({ palette }) => ({
          background: palette.gray[30],
          borderRadius: 0, // Rectangle preview for transitions
          p: 1,
          textAlign: "center",
          cursor: "grab",
          width: 100,
          height: 50,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: "1rem",
        })}
        draggable
        onDragStart={(event) => onDragStart(event, "transition")}
      >
        Transition
      </Box>
    </Stack>
  );
};
