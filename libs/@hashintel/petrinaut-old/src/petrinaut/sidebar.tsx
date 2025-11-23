import { Box, Button, Stack } from "@mui/material";
import type { DragEvent } from "react";
import { useCallback } from "react";

import { useEditorContext } from "./editor-context";
import { placeStyling, transitionStyling } from "./styling";
import { useLayoutGraph } from "./use-layout-graph";

export const Sidebar = () => {
  const onDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, nodeType: "place" | "transition") => {
      event.dataTransfer.setData("application/reactflow", nodeType);

      // eslint-disable-next-line no-param-reassign
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const { petriNetDefinition } = useEditorContext();

  const layoutGraph = useLayoutGraph();

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
      <Stack alignItems="center" gap={2}>
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
      <Box
        sx={{
          background: ({ palette }) => palette.gray[30],
          height: "1px",
          width: "100%",
          my: 2,
        }}
      />
      <Stack alignItems="center" gap={2}>
        <Button
          onClick={() =>
            layoutGraph({
              nodes: petriNetDefinition.nodes,
              arcs: petriNetDefinition.arcs,
              animationDuration: 200,
            })
          }
          size="xs"
          variant="tertiary"
          sx={{ display: "block", fontWeight: 400 }}
        >
          Layout
        </Button>
      </Stack>
    </Stack>
  );
};
