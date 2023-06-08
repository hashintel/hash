import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";

import { getCellHorizontalPadding, getYCenter } from "../../utils";
import { drawCellFadeOutGradient } from "../draw-cell-fade-out-gradient";
import { InteractableManager } from "../interactable-manager";
import { Interactable } from "../interactable-manager/types";
import { TooltipCell } from "./types";

const iconSize = 20;
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

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
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
      id: `tooltip-${i}`,
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
          colIndex: col,
          rowIndex: row,
        }),
      onMouseLeave: () => hideTooltip(col, row),
    });

    interactables.push(interactable);
  }

  return interactables;
};
