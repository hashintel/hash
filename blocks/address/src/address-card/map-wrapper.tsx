import { Box } from "@mui/material";
import type { ReactNode } from "react";

export const MapWrapper = ({
  children,
  isMobile,
}: {
  children: ReactNode;
  isMobile?: boolean;
}) => (
  <Box
    sx={({ palette }) => ({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      background: palette.gray[10],
      borderLeft: `1px solid ${palette.gray[20]}`,
      width: 1,
      minHeight: 300,

      ...(isMobile
        ? {
            width: 1,
            height: 300,
          }
        : {}),
    })}
  >
    {children}
  </Box>
);
