import { CustomCell } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";

const addAlpha = (color: string, opacity: number) => {
  if (opacity < 0 || opacity > 1) {
    throw new Error("opacity should be between 0 - 1");
  }

  // scale up opacity to 0-255 range
  const _opacity = Math.round(Math.min(Math.max(opacity, 0), 1) * 255);
  return color + _opacity.toString(16).toUpperCase().padStart(2, "0");
};

export const drawCellFadeOutGradient = (
  args: DrawArgs<CustomCell>,
  extraWidth = 0,
  bgOpacity = 1,
) => {
  const { ctx, rect, theme } = args;

  const bgColor = addAlpha(theme.bgCell, bgOpacity);

  const rectLeft = rect.x + rect.width - extraWidth;

  if (extraWidth) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(rectLeft, rect.y, extraWidth, rect.height);
  }

  const grdWidth = 50;
  const grdLeft = rectLeft - grdWidth;
  const grd = ctx.createLinearGradient(rectLeft - grdWidth, 0, rectLeft, 0);
  grd.addColorStop(0, "#ffffff00");
  grd.addColorStop(1, bgColor);
  ctx.fillStyle = grd;

  ctx.fillRect(grdLeft, rect.y, grdWidth, rect.height);
};
