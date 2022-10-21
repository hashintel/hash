import {
  CustomCell,
  DataEditorRef,
  CustomRenderer,
} from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import { Popover } from "@hashintel/hash-design-system";
import { PopoverPosition, Typography } from "@mui/material";
import _ from "lodash";
import { bindPopover, usePopupState } from "material-ui-popup-state/hooks";
import { RefObject, useCallback, useState } from "react";

export interface TooltipCellProps {
  tooltips: string[];
  showTooltip: (tooltip: GridTooltip) => void;
  hideTooltip: (col: number, row: number) => void;
}

export type GridTooltip = {
  col: number;
  row: number;
  text: string;
  iconX: number;
};

type TooltipCell = CustomCell<TooltipCellProps>;

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

export const useGridTooltip = (gridRef: RefObject<DataEditorRef>) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "grid-tooltip",
  });

  const [tooltip, setTooltip] = useState<GridTooltip | null>(null);
  const [tooltipPos, setTooltipPos] = useState<PopoverPosition>();

  const showTooltip = useCallback<TooltipCellProps["showTooltip"]>(
    (newTooltip) => {
      if (!_.isEqual(tooltip, newTooltip)) {
        setTooltip(newTooltip);
      }

      const bounds = gridRef.current?.getBounds(newTooltip.col, newTooltip.row);

      if (!bounds) {
        return;
      }

      popupState.setOpen(true);

      const left = bounds.x + newTooltip.iconX;
      const top = bounds.y;

      setTooltipPos((prev) => {
        if (prev?.left === left && prev?.top === top) {
          return prev;
        }

        return { left, top };
      });
    },
    [popupState, tooltip, gridRef],
  );

  const hideTooltip = useCallback<TooltipCellProps["hideTooltip"]>(
    (_col, _row) => {
      if (tooltip?.col === _col && tooltip?.row === _row) {
        popupState.setOpen(false);
      }
    },
    [popupState, tooltip],
  );

  return {
    showTooltip,
    hideTooltip,
    tooltipElement: (
      <Popover
        {...bindPopover(popupState)}
        anchorReference="anchorPosition"
        anchorPosition={tooltipPos}
        transformOrigin={{ horizontal: "center", vertical: "bottom" }}
        PaperProps={{
          sx: {
            py: 0.75,
            px: 1.5,
            backgroundColor: "gray.90",
          },
        }}
      >
        <Typography textAlign="center" color="white">
          {tooltip?.text}
        </Typography>
      </Popover>
    ),
    withTooltips: <T extends TooltipCell>(
      customRenderer: CustomRenderer<T>,
    ): CustomRenderer<T> => {
      return {
        ...customRenderer,
        draw: (...params) => {
          customRenderer.draw(...params);

          const drawArgs = params[0];
          const tooltipManager = new GridTooltipManager(drawArgs);
          tooltipManager.draw();
        },
      };
    },
  };
};
