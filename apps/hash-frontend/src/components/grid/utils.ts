import {
  CustomCell,
  getMiddleCenterBias,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";

export const GRID_CLICK_IGNORE_CLASS = "click-outside-ignore";

/**
 * @returns vertical center of a grid cell
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

export type BlankCell = CustomCell<{ kind: "blank-cell" }>;

export const blankCell: BlankCell = {
  kind: GridCellKind.Custom,
  allowOverlay: false,
  copyData: "",
  data: { kind: "blank-cell" },
};
