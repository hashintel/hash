import { getMiddleCenterBias, GridCellKind } from "@glideapps/glide-data-grid";

import type {
  CustomCell,
  DrawArgs,
  GridCell,
  Theme,
} from "@glideapps/glide-data-grid";

/** The font a grid draws its column headers in. */
export const gridHeaderBaseFont = "600 14px Inter";

/**
 * @returns vertical center of a grid cell, relative to the visible grid area
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
  atFirstColumn ? 42 : 22;

export type BlankCell = CustomCell<{ kind: "blank-cell" }>;

export const blankCell: BlankCell = {
  kind: GridCellKind.Custom,
  allowOverlay: false,
  copyData: "",
  data: { kind: "blank-cell" },
};

/** Mirrors the cell text glide's built-in search tests, per cell kind. */
export const getCellSearchableText = (cell: GridCell): string | undefined => {
  switch (cell.kind) {
    case GridCellKind.Text:
    case GridCellKind.Number:
      return cell.displayData;
    case GridCellKind.Uri:
    case GridCellKind.Markdown:
      return cell.data;
    case GridCellKind.Boolean:
      return typeof cell.data === "boolean" ? cell.data.toString() : undefined;
    case GridCellKind.Image:
    case GridCellKind.Bubble:
      return cell.data.join("\n");
    case GridCellKind.Custom:
      return cell.copyData;
    default:
      return undefined;
  }
};
