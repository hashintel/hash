import {
  CustomCell,
  GridCell,
  GridCellKind,
  getMiddleCenterBias,
} from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";

/**
 * @returns vertical center of a glide-grid cell
 */
export const getYCenter = (
  args: Pick<DrawArgs<CustomCell>, "rect" | "ctx" | "theme">,
) => {
  const { rect, ctx, theme } = args;
  const { y, height } = rect;

  return y + height / 2 + getMiddleCenterBias(ctx, theme);
};

/**
 * @param atFirstColumn first columns has extra padding for the chevron icon on the left side
 * @returns cell horizontal padding
 */
export const getCellHorizontalPadding = (atFirstColumn?: boolean) =>
  atFirstColumn ? 36 : 22;

export const blankCell: GridCell = {
  kind: GridCellKind.Custom,
  allowOverlay: false,
  copyData: "",
  data: {},
};
