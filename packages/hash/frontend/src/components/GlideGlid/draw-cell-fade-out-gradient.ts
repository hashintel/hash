import { CustomCell } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";

export const drawCellFadeOutGradient = (
  args: DrawArgs<CustomCell>,
  marginRight: number = 0,
) => {
  const { ctx, rect } = args;

  const rectRight = rect.x + rect.width - marginRight;
  const rectLeft = rectRight;

  const grdWidth = 50;
  const grdLeft = rectLeft - grdWidth;
  const grd = ctx.createLinearGradient(rectLeft - grdWidth, 0, rectLeft, 0);
  grd.addColorStop(0, "#ffffff00");
  grd.addColorStop(1, "white");
  ctx.fillStyle = grd;

  ctx.fillRect(grdLeft, rect.y, grdWidth, rect.height);
};
