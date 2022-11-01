import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import { getYCenter } from "../../utils";
import { CustomGridIcon } from "../custom-grid-icons";
import { drawCellFadeOutGradient } from "../draw-cell-fade-out-gradient";
import { TooltipCell } from "./types";

export class GridTooltipManager {
  private iconSize = 20;

  private iconGap = 10;

  // margin between last icon & cell border
  private cellMargin = 24;

  constructor(private args: DrawArgs<TooltipCell>) {}

  draw() {
    this.drawTooltipIcons();
  }

  /**
   * @todo this logic should be reusable for all custom cells
   * we'll use the gradient solution below as
   * replacement of ellipsis (...) on our custom cells
   * even if a cell has tooltips, or not
   */
  private drawBackground() {
    const { iconSize, iconGap, args, cellMargin } = this;
    const { ctx, cell, rect } = args;
    const { tooltips } = cell.data;

    // paint the whole bg first
    const iconsWidth = (iconSize + iconGap) * tooltips.length;
    const totalWidth = iconsWidth + cellMargin;
    const rectRight = rect.x + rect.width;
    const rectLeft = rectRight - totalWidth;

    ctx.fillStyle = "white";
    ctx.fillRect(rectLeft, rect.y, totalWidth, rect.height);

    drawCellFadeOutGradient(args, totalWidth);
  }

  private drawTooltipIcons() {
    const { iconSize, iconGap, args, cellMargin } = this;
    const { ctx, cell, rect, col, row, hoverX = -100, theme } = args;
    const { hideTooltip, showTooltip, tooltips } = cell.data;

    if (!tooltips?.length) {
      drawCellFadeOutGradient(args);
      return;
    }

    this.drawBackground();

    if (!hideTooltip || !showTooltip) {
      throw new Error(
        `Please pass 'hideTooltip' and 'showTooltip' to cell data, provided by 'useGridTooltip'`,
      );
    }

    let tooltipCount = 0;

    for (let i = 0; i < tooltips.length; i++) {
      const tooltip = tooltips[i] ?? {
        text: "",
        icon: CustomGridIcon.ASTERISK_CIRCLE,
      };

      /**
       * using reversedIndex while calculating tooltipX, because we'll draw
       * tooltips icons left to right (in reversed order)
       */
      const reversedIndex = tooltips.length - i - 1;

      const tooltipX =
        rect.x +
        rect.width -
        iconSize -
        cellMargin -
        reversedIndex * (iconGap + iconSize);

      const yCenter = getYCenter(args);

      args.spriteManager.drawSprite(
        tooltip.icon,
        "normal",
        ctx,
        tooltipX,
        yCenter - iconSize / 2,
        iconSize,
        theme,
        1,
      );

      const actualTooltipX = tooltipX - rect.x;

      if (hoverX > actualTooltipX && hoverX < actualTooltipX + iconSize) {
        tooltipCount++;

        showTooltip({
          text: tooltip.text,
          iconX: actualTooltipX + iconSize / 2,
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
