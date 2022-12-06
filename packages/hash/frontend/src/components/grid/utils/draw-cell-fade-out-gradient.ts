import { CustomCell } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";

export const drawCellFadeOutGradient = (
  args: DrawArgs<CustomCell>,
  extraWidth: number = 0,
) => {
  const { ctx, rect, theme } = args;

  const rectLeft = rect.x + rect.width - extraWidth;

  if (extraWidth) {
    ctx.fillStyle = theme.bgCell;
    ctx.fillRect(rectLeft, rect.y, extraWidth, rect.height);
  }

  const grdWidth = 50;
  const grdLeft = rectLeft - grdWidth;
  const grd = ctx.createLinearGradient(rectLeft - grdWidth, 0, rectLeft, 0);
  grd.addColorStop(0, "#ffffff00");
  grd.addColorStop(1, theme.bgCell);
  ctx.fillStyle = grd;

  ctx.fillRect(grdLeft, rect.y, grdWidth, rect.height);
};
