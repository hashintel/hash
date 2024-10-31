import type { CustomCell, DrawArgs } from "@glideapps/glide-data-grid";
import { customColors } from "@hashintel/design-system/theme";

import { getYCenter } from "../utils";

interface DrawUrlParams {
  args: DrawArgs<CustomCell>;
  url: string;
  left: number;
}

export const drawUrlAsLink = ({ args, url, left }: DrawUrlParams) => {
  const { ctx, overrideCursor, theme } = args;
  const yCenter = getYCenter(args);

  overrideCursor?.("pointer");

  const textLeft = left;

  const color = customColors.blue[70];

  ctx.font = theme.baseFontStyle;
  ctx.fillStyle = color;
  ctx.fillText(url, textLeft, yCenter);
  const { width: textWidth } = ctx.measureText(url);

  /**
   * This is the size set in baseFontStyle
   */
  const fontSize = 14;

  const underlineOffset = 2;
  const underlineY = yCenter + fontSize / 2 + underlineOffset;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.moveTo(textLeft, underlineY);
  ctx.lineTo(textLeft + textWidth, underlineY);
  ctx.stroke();

  const iconLeft = textLeft + textWidth + 5;
  const iconSize = 13;

  const fgIconHeader = color;
  args.spriteManager.drawSprite(
    "arrowUpRightRegular",
    "normal",
    ctx,
    iconLeft,
    yCenter - (iconSize - 5),
    iconSize,
    { ...theme, fgIconHeader },
  );
};
