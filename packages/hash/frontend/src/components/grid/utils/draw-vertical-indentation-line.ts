import { CustomCell } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";

import { getYCenter } from "../utils";

export type VerticalIndentationLineDir = "up" | "down" | "full";

/**
 * A helper function that draws vertical indentation lines
 */
export const drawVerticalIndentationLine = (
  args: DrawArgs<CustomCell>,
  left: number,
  dir: VerticalIndentationLineDir,
) => {
  const { rect, ctx } = args;

  const yTop = rect.y;
  const yBottom = rect.y + rect.height;
  const yCenter = getYCenter(args);

  const top = dir === "down" ? yCenter - 0.5 : yTop;
  const bottom = dir === "up" ? yCenter + 0.5 : yBottom;

  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.stroke();
};
