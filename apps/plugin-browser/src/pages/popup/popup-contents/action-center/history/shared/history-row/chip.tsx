import type { SxProps, Theme } from "@mui/material";
import { Stack } from "@mui/material";
import type { PropsWithChildren } from "react";

export const chipSx: SxProps<Theme> = ({ palette }) => ({
  borderRadius: 4,
  border: `1px solid ${palette.gray[30]}`,
  display: "inline-flex",
  py: 0.7,
  px: 1.5,
  "@media (prefers-color-scheme: dark)": {
    borderColor: palette.gray[90],
  },
});

export const Chip = ({
  children,
  sx,
}: PropsWithChildren<{ sx?: SxProps<Theme> }>) => (
  <Stack
    direction="row"
    alignItems="center"
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- @todo why is this any
    sx={[chipSx, ...(Array.isArray(sx) ? sx : [sx])]}
  >
    {children}
  </Stack>
);
