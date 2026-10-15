import type { SxProps, Theme } from "@mui/material";

export const defaultCellSx = {
  padding: "5px 14px",
  borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
  textAlign: "left",
  whiteSpace: "nowrap",
} as const satisfies SxProps<Theme>;
