import { CustomCell } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";

import { getYCenter } from "../utils";
import { drawChip } from "./draw-chip";

/**
 * @param args draw args of cell
 * @param text text content of chip
 * @param left left position of chip
 * @param textColor text color
 * @param bgColor background color
 * @returns width of the drawn chip
 */
export const drawChipWithText = ({
  args,
  text,
  left,
  textColor,
  bgColor,
  borderColor,
}: {
  args: DrawArgs<CustomCell>;
  text: string;
  left: number;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
}) => {
  const { ctx, theme } = args;
  const yCenter = getYCenter(args);

  const paddingX = 12;
  const textLeft = left + paddingX;

  ctx.font = args.theme.baseFontStyle;
  const textWidth = ctx.measureText(text).width;
  const chipWidth = textWidth + 2 * paddingX;

  const textColorInner = textColor ?? theme.textBubble;

  drawChip(
    args,
    left,
    chipWidth,
    bgColor ?? theme.bgBubble,
    borderColor ?? "white",
  );

  ctx.fillStyle = textColorInner;
  ctx.fillText(text, textLeft, yCenter);

  return chipWidth;
};
