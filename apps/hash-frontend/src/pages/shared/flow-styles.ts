import { defaultCellSx } from "./virtualized-table";

export const flowTableRowHeight = 58;

export const flowTableCellSx = {
  ...defaultCellSx,
  borderRight: "none",
  height: flowTableRowHeight,
  "*": {
    whiteSpace: "nowrap",
    overflowX: "hidden",
    textOverflow: "ellipsis",
  },
};
