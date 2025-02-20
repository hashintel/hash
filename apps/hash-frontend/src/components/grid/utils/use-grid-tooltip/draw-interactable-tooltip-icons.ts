import type { DrawArgs } from "@glideapps/glide-data-grid";

import { getCellHorizontalPadding, getYCenter } from "../../utils";
import { drawCellFadeOutGradient } from "../draw-cell-fade-out-gradient";
import { InteractableManager } from "../interactable-manager";
import type { Interactable } from "../interactable-manager/types";
import type { TooltipCell } from "./types";

const iconSize = 16;
const iconGap = 10;
const cellMargin = getCellHorizontalPadding();

export const drawInteractableTooltipIcons = (
  args: DrawArgs<TooltipCell>,
): Interactable[] => {
  const { ctx, cell, rect, col, row, theme } = args;
  const { hideTooltip, showTooltip, tooltips } = cell.data;

  if (!tooltips.length) {
    drawCellFadeOutGradient(args);
    return [];
  }

  const iconsWidth = (iconSize + iconGap) * tooltips.length;
  const bgWidth = iconsWidth + cellMargin;
  drawCellFadeOutGradient(args, bgWidth);

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

    const rightOffset = cellMargin - reversedIndex * (iconGap + iconSize);

    const tooltipX = rect.x + rect.width - iconSize - rightOffset;

    const yCenter = getYCenter(args);

    args.spriteManager.drawSprite(
      tooltip.icon,
      "normal",
      ctx,
      tooltipX,
      yCenter - iconSize / 2,
      iconSize,
      { ...theme, fgIconHeader: tooltip.color ?? theme.fgIconHeader },
      1,
    );

    const interactable = InteractableManager.createCellInteractable(args, {
      id: `tooltip-${i}`,
      posRelativeToVisibleGridArea: {
        left: tooltipX,
        right: tooltipX + iconSize,
        top: yCenter - iconSize / 2,
        bottom: yCenter + iconSize / 2,
      },
      onMouseEnter: () =>
        showTooltip({
          content: tooltip.text,
          horizontalAlign: "center",
          interactablePosRelativeToCell: {
            right: rightOffset,
            top: yCenter - rect.y - iconSize / 2,
          },
          interactableSize: {
            width: iconSize,
            height: iconSize,
          },
          colIndex: col,
          rowIndex: row,
        }),
      onMouseLeave: () => hideTooltip(col, row),
    });

    interactables.push(interactable);
  }

  return interactables;
};
