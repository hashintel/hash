import type { CustomCell, DrawArgs } from "@glideapps/glide-data-grid";

import { getYCenter } from "../utils";
import { drawRoundRect } from "./draw-round-rect";

export const drawChip = (
  args: DrawArgs<CustomCell>,
  left: number,
  chipWidth: number,
  bgColor?: string,
  borderColor?: string,
) => {
  const { ctx, theme } = args;
  const yCenter = getYCenter(args);

  const height = 26;
  const chipTop = yCenter - height / 2;

  ctx.fillStyle = bgColor ?? theme.bgBubble;
  ctx.beginPath();
  drawRoundRect(ctx, left, chipTop, chipWidth, height, height / 2);
  ctx.fill();

  if (borderColor) {
    ctx.beginPath();
    drawRoundRect(ctx, left, chipTop, chipWidth, height, height / 2);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
};
