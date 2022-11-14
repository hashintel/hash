import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import { getCellHorizontalPadding, getYCenter } from "../../utils";
import { drawCellFadeOutGradient } from "../draw-cell-fade-out-gradient";
import { InteractableManager } from "../interactable-manager";
import { Interactable } from "../interactable-manager/types";
import { TooltipCell } from "./types";

export class GridTooltipManager {
  private iconSize = 20;

  private iconGap = 10;

  private cellMargin = getCellHorizontalPadding();

  constructor(private args: DrawArgs<TooltipCell>) {}

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

  drawAndCreateInteractables(): Interactable[] {
    const { iconSize, iconGap, args, cellMargin } = this;
    const { ctx, cell, rect, col, row, theme } = args;
    const { hideTooltip, showTooltip, tooltips } = cell.data;

    if (!tooltips?.length) {
      drawCellFadeOutGradient(args);
      return [];
    }

    this.drawBackground();

    if (!hideTooltip || !showTooltip) {
      throw new Error(
        `Please pass 'hideTooltip' and 'showTooltip' to cell data, provided by 'useGridTooltip'`,
      );
    }

    const interactables: Interactable[] = [];

    for (let i = 0; i < tooltips.length; i++) {
      const tooltip = tooltips[i] ?? {
        text: "",
        icon: "bpAsteriskCircle",
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

      const interactable = InteractableManager.create(args, {
        id: i,
        pos: {
          left: tooltipX,
          right: tooltipX + iconSize,
          top: yCenter - iconSize / 2,
          bottom: yCenter + iconSize / 2,
        },
        onMouseEnter: () =>
          showTooltip({
            text: tooltip.text,
            iconX: actualTooltipX + iconSize / 2,
            col,
            row,
          }),
        onMouseLeave: () => hideTooltip(col, row),
      });

      interactables.push(interactable);
    }

    return interactables;
  }
}
