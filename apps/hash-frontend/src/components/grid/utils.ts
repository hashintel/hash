import type {
  CustomCell,
  DrawArgs,
  getMiddleCenterBias,
  GridCellKind,
  Theme,
} from "@glideapps/glide-data-grid";

/**
 * @returns Vertical center of a grid cell.
 */
export const getYCenter = (
  args: Pick<DrawArgs<CustomCell>, "rect" | "ctx"> & { theme: Theme },
) => {
  const { rect, ctx, theme } = args;
  const { y, height } = rect;

  return y + height / 2 + getMiddleCenterBias(ctx, theme.fontFamily);
};

/**
 * @param atFirstColumn - First columns has extra padding for the chevron icon on the left side.
 * @returns Cell horizontal padding.
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
