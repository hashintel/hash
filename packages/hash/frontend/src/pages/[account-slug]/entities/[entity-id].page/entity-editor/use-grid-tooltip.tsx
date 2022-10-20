import { DataEditorRef } from "@glideapps/glide-data-grid";
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
    tooltip: (
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
  };
};

/**
 * @todo find a way to make customCell.draw part of the tooltips reusable, right now it's duplicated at `test-cell` and `test-cell-two`
 */
