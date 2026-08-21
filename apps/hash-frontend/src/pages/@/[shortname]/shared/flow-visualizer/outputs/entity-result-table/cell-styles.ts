import { defaultCellSx } from "../../../../../../shared/virtualized-table";

import type { SxProps, Theme } from "@mui/material";

export const typographySx = {
  color: ({ palette }) => palette.common.black,
  fontSize: 12,
  fontWeight: 500,
} as const satisfies SxProps<Theme>;

export const cellSx = {
  ...defaultCellSx,
  ...typographySx,
  background: "white",
  "&:not(:last-child)": {
    borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
  },
} as const satisfies SxProps<Theme>;
