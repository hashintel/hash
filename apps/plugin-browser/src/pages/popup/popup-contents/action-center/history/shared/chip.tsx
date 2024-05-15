import type { SxProps, Theme } from "@mui/material";
import { Stack } from "@mui/material";
import type { PropsWithChildren } from "react";

export const chipSx: SxProps<Theme> = {
  borderRadius: 3,
  border: ({ palette }) => `1px solid ${palette.gray[30]}`,
  display: "inline-flex",
  py: 1,
  px: 1.5,
};

export const Chip = ({
  children,
  sx,
}: PropsWithChildren<{ sx?: SxProps<Theme> }>) => (
  <Stack
    direction="row"
    alignItems="center"
    sx={[chipSx, ...(Array.isArray(sx) ? sx : [sx])]}
  >
    {children}
  </Stack>
);
