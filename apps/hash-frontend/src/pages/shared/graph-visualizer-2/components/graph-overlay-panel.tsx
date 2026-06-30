import { Box } from "@mui/material";

import type { ReactNode } from "react";

interface GraphOverlayPanelProps {
  readonly children: ReactNode;
  readonly placement?: "top-left" | "top-right" | "bottom-left";
  readonly interactive?: boolean;
}

const placementSx = {
  "top-left": { top: 8, left: 8 },
  "top-right": { top: 8, right: 13 },
  "bottom-left": { bottom: 8, left: 8 },
} as const;

export const GraphOverlayPanel = ({
  children,
  placement = "top-left",
  interactive = true,
}: GraphOverlayPanelProps) => (
  <Box
    sx={({ palette, boxShadows }) => ({
      position: "absolute",
      zIndex: 7,
      maxWidth: 320,
      p: 1.25,
      borderRadius: 2,
      border: `1px solid ${palette.gray[30]}`,
      bgcolor: palette.white,
      boxShadow: boxShadows.sm,
      pointerEvents: interactive ? "auto" : "none",
      ...placementSx[placement],
    })}
  >
    {children}
  </Box>
);
