import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import { CustomGridIcon } from "../custom-grid-icons";
import { TooltipCell } from "./types";

export class GridTooltipManager {
  // tooltip size
  private size = 20;

  // gap between tooltips
  private gap = 10;

  // margin between last icon & cell border
  private cellMargin = 24;

  // background to prevent content being visible under tooltip icons
  private bgColor = "white";

  constructor(private args: DrawArgs<TooltipCell>) {}

  draw() {
    this.drawBackground();
    this.drawTooltips();
  }

  /**
   * @todo this logic should be reusable for all custom cells
   * we'll use the gradient solution below as
   * replacement of ellipsis (...) on our custom cells
   * even if a cell has tooltips, or not
   */
  private drawBackground() {
    const { size, gap, args, cellMargin, bgColor } = this;
    const { ctx, cell, rect } = args;
    const { tooltips } = cell.data;

    // paint the whole bg first
    const iconsWidth = (size + gap) * tooltips.length;
    const totalWidth = iconsWidth + cellMargin;
    const rectRight = rect.x + rect.width;
    const rectLeft = rectRight - totalWidth;

    ctx.fillStyle = bgColor;
    ctx.fillRect(rectLeft, rect.y, totalWidth, rect.height);

    // paint gradient from padding to rect left
    const grdWidth = 50;
    const grdLeft = rectLeft - grdWidth;
    const grd = ctx.createLinearGradient(rectLeft - grdWidth, 0, rectLeft, 0);
    grd.addColorStop(0, "#ffffff00");
    grd.addColorStop(1, bgColor);
    ctx.fillStyle = grd;

    ctx.fillRect(grdLeft, rect.y, grdWidth, rect.height);
  }

  private drawTooltips() {
    const { size, gap, args, cellMargin } = this;
    const { ctx, cell, rect, col, row, hoverX = -100, theme } = args;
    const { hideTooltip, showTooltip, tooltips } = cell.data;

    if (!tooltips?.length) {
      return;
    }

    if (!hideTooltip || !showTooltip) {
      throw new Error(
        `Please pass 'hideTooltip' and 'showTooltip' to cell data, provided by 'useGridTooltip'`,
      );
    }

    let tooltipCount = 0;

    for (let i = 0; i < tooltips.length; i++) {
      const tooltip = tooltips[i] ?? {
        text: "",
        icon: CustomGridIcon.ASTERISK,
      };

      /**
       * using reversedIndex while calculating tooltipX, because we'll draw
       * tooltips icons left to right (in reversed order)
       */
      const reversedIndex = tooltips.length - i - 1;

      const tooltipX =
        rect.x + rect.width - size - cellMargin - reversedIndex * (gap + size);

      const yCenter = rect.y + rect.height / 2;

      args.spriteManager.drawSprite(
        tooltip.icon,
        "normal",
        ctx,
        tooltipX,
        yCenter - size / 2,
        size,
        theme,
        1,
      );

      const actualTooltipX = tooltipX - rect.x;

      if (hoverX > actualTooltipX && hoverX < actualTooltipX + size) {
        tooltipCount++;

        showTooltip({
          text: tooltip.text,
          iconX: actualTooltipX + size / 2,
          col,
          row,
        });
      }
    }

    if (tooltipCount === 0) {
      hideTooltip(col, row);
    }
  }
}
