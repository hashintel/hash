import { defaultCellSx } from "../virtualized-table";

import type { Theme } from "@mui/material";
import type { SystemStyleObject } from "@mui/system";

export const flowTableRowHeight = 58;

export const flowTableCellSx = {
  ...defaultCellSx,
  height: flowTableRowHeight,
  "*": {
    whiteSpace: "nowrap",
    overflowX: "hidden",
    textOverflow: "ellipsis",
  },
};

export const flowTableChipSx: SystemStyleObject<Theme> = {
  background: ({ palette }) => palette.common.white,
  border: ({ palette }) => `1px solid ${palette.gray[30]}`,
  borderRadius: 2,
  display: "inline-flex",
  fontSize: 12,
  fontWeight: 500,
  height: 26,
  lineHeight: 1,
  px: 1.2,
};
