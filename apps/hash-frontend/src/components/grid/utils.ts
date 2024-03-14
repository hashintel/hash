import type { CustomCell, DrawArgs, Theme } from "@glideapps/glide-data-grid";
import { getMiddleCenterBias, GridCellKind } from "@glideapps/glide-data-grid";

/**
 * @returns vertical center of a grid cell
 */
export const getYCenter = (
  args: Pick<DrawArgs<CustomCell>, "rect" | "ctx"> & { theme: Theme },
) => {
  const { rect, ctx, theme } = args;
  const { y, height } = rect;

  return y + height / 2 + getMiddleCenterBias(ctx, theme.fontFamily);
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
