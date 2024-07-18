import type { SxProps, Theme } from "@mui/material";

export const iconSx: SxProps<Theme> = {
  fill: ({ palette }) => palette.gray[50],
  "@media (prefers-color-scheme: dark)": {
    fill: ({ palette }) => palette.gray[30],
  },
  fontSize: 12,
};
