import { defaultCellSx } from "../../../../virtualized-table";

import type { SxProps, Theme } from "@mui/material";

export const maxLinksTableHeight = 300;

export const linksTableRowHeight = 43;

export const linksTableCellSx: SxProps<Theme> = {
  ...defaultCellSx,
  borderBottom: "none",
  color: ({ palette }) => palette.gray[80],
  height: linksTableRowHeight,
  overflowX: "hidden",
};

export const linksTableFontSize = 14;
