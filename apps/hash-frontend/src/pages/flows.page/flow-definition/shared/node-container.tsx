import { Box } from "@mui/material";
import type { PropsWithChildren } from "react";

export const NodeContainer = ({
  children,
  selected,
}: PropsWithChildren<{ selected: boolean }>) => {
  return (
    <Box
      sx={{
        border: `1px solid ${selected ? "red" : "rgba(0, 0, 0, 0.2)"}`,
        height: 100,
        width: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </Box>
  );
};
