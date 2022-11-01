import { CustomCell } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";

/**
 * @returns vertical center of a glide-grid cell
 */
export const getYCenter = (args: DrawArgs<CustomCell>) => {
  const { y, height } = args.rect;
  return y + height / 2 + 1;
};

/**
 * @param extraPadding does cell have extra padding (e.g. for chevron icon on left for expanding)
 * @returns column horizontal padding
 */
export const getColumnPadding = (extraPadding?: boolean) =>
  extraPadding ? 36 : 22;
