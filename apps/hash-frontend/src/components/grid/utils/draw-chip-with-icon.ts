import { CustomCell } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";

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
export const drawChipWithIcon = ({
  args,
  text,
  icon = "bpAsterisk",
  left,
  textColor,
  bgColor,
  borderColor,
}: {
  args: DrawArgs<CustomCell>;
  text: string;
  icon?: CustomIcon;
  left: number;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
}) => {
  const { ctx, theme } = args;
  const yCenter = getYCenter(args);

  const paddingX = 12;
  const iconSize = 10;
  const gap = 6;

  const iconLeft = left + paddingX;
  const textLeft = iconSize + gap + iconLeft;

  ctx.font = args.theme.baseFontStyle;
  const textWidth = ctx.measureText(text).width;
  const chipWidth = iconSize + gap + textWidth + 2 * paddingX;

  const textColorInner = textColor ?? theme.textBubble;

  drawChip(
    args,
    left,
    chipWidth,
    bgColor ?? theme.bgBubble,
    borderColor ?? "white",
  );

  args.spriteManager.drawSprite(
    icon,
    "normal",
    ctx,
    iconLeft,
    yCenter - iconSize / 2,
    iconSize,
    { ...theme, fgIconHeader: textColorInner },
  );

  ctx.fillStyle = textColorInner;
  ctx.fillText(text, textLeft, yCenter);

  return chipWidth;
};
