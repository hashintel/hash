import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import { TooltipCell } from "./types";

export class GridTooltipManager {
  // tooltip size
  private size = 20;
  // gap between tooltips
  private gap = 10;

  constructor(private args: DrawArgs<TooltipCell>) {}

  draw() {
    const { size, gap, args } = this;
    const { ctx, cell, rect, col, row, hoverX = -100 } = args;
    const {
      data: { hideTooltip, showTooltip, tooltips },
    } = cell;

    if (!tooltips?.length) {
      return;
    }

    if (!hideTooltip || !showTooltip) {
      throw new Error(
        `Please pass 'hideTooltip' and 'showTooltip' to cell data, provided by 'useGridTooltip'`,
      );
    }

    let tooltipCount = 0;

    for (let i = 0; i < tooltips?.length; i++) {
      const tooltip = tooltips[i] ?? "";
      const tooltipX = rect.x + rect.width - size - i * (gap + size);
      const yCenter = rect.y + rect.height / 2;

      ctx.strokeRect(tooltipX, yCenter - size / 2, size, size);

      const actualTooltipX = tooltipX - rect.x;

      if (hoverX > actualTooltipX && hoverX < actualTooltipX + size) {
        ctx.fillRect(tooltipX, yCenter - size / 2, size, size);

        tooltipCount++;

        showTooltip({
          text: tooltip,
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
