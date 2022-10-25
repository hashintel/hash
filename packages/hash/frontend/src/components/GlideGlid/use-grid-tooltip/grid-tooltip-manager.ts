import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import { CustomGridIcon } from "../custom-grid-icons";
import { drawCellFadeOutGradient } from "../draw-cell-fade-out-gradient";
import { TooltipCell } from "./types";

export class GridTooltipManager {
  // tooltip size
  private size = 20;

  // gap between tooltips
  private gap = 10;

  // margin between last icon & cell border
  private cellMargin = 24;

  constructor(private args: DrawArgs<TooltipCell>) {}

  draw() {
    this.drawTooltips();
  }

  /**
   * @todo this logic should be reusable for all custom cells
   * we'll use the gradient solution below as
   * replacement of ellipsis (...) on our custom cells
   * even if a cell has tooltips, or not
   */
  private drawBackground() {
    const { size, gap, args, cellMargin } = this;
    const { ctx, cell, rect } = args;
    const {
      data: { tooltips },
    } = cell;

    // paint the whole bg first
    const iconsWidth = (size + gap) * tooltips.length;
    const totalWidth = iconsWidth + cellMargin;
    const rectRight = rect.x + rect.width;
    const rectLeft = rectRight - totalWidth;

    ctx.fillStyle = "white";
    ctx.fillRect(rectLeft, rect.y, totalWidth, rect.height);

    drawCellFadeOutGradient(args, totalWidth);
  }

  private drawTooltips() {
    const { size, gap, args, cellMargin } = this;
    const { ctx, cell, rect, col, row, hoverX = -100, theme } = args;
    const {
      data: { hideTooltip, showTooltip, tooltips },
    } = cell;

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
        icon: CustomGridIcon.ASTERIKS_CIRCLE,
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
