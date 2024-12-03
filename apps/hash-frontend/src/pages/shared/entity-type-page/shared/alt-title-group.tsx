import { Box, Stack, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";

export const AltTitleGroup = ({
  children,
  direction,
  label,
}: PropsWithChildren<{ direction: "row" | "column"; label: string }>) => {
  return (
    <Stack
      alignItems={direction === "row" ? "center" : "flex-start"}
      direction={direction}
      spacing={direction === "row" ? 1 : 0}
      sx={{ minWidth: 150 }}
    >
      <Typography
        sx={{
          fontSize: 14,
          color: ({ palette }) => palette.gray[70],
          fontStyle: "italic",
        }}
      >
        {label}
      </Typography>
      <Box>{children}</Box>
    </Stack>
  );
};
