import type { SxProps, Theme } from "@mui/material";

import { defaultCellSx } from "../../../../../../shared/virtualized-table";

export const maxLinksTableHeight = 300;

export const linksTableRowHeight = 43;

export const linksTableCellSx: SxProps<Theme> = {
  ...defaultCellSx,
  borderBottom: "none",
  color: ({ palette }) => palette.gray[80],
  height: linksTableRowHeight,
};

export const linksTableFontSize = 14;
