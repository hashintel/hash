import { Stack } from "@mui/material";
import type { ReactNode } from "react";

export const ContentStack = ({
  children,
  isMobile,
}: {
  children: ReactNode;
  isMobile?: boolean;
}) => (
  <Stack
    sx={{
      boxSizing: "border-box",
      display: "flex",
      justifyContent: "space-between",
      paddingY: 3,
      paddingX: 3.75,
      gap: 4,
      width: 300,
      ...(isMobile
        ? {
            width: 1,
          }
        : {}),
    }}
  >
    {children}
  </Stack>
);
