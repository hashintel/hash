import { DataEditorRef } from "@glideapps/glide-data-grid";
import { Popover, PopoverPosition, Typography } from "@mui/material";
import { isEqual } from "lodash";
import { bindPopover, usePopupState } from "material-ui-popup-state/hooks";
import { RefObject, useCallback, useState } from "react";
import { useWindowEventListener } from "rooks";

import {
  GridTooltip,
  TooltipCellProps,
  UseGridTooltipResponse,
} from "./use-grid-tooltip/types";

export const useGridTooltip = (
  gridRef: RefObject<DataEditorRef>,
): UseGridTooltipResponse => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "grid-tooltip",
  });

  // prevent tooltip from staying at the same position when user scrolls vertically
  useWindowEventListener("scroll", () => {
    popupState.close();
  });

  const [gridTooltip, setGridTooltip] = useState<GridTooltip | null>(null);
  const [tooltipPos, setTooltipPos] = useState<PopoverPosition>();

  const showTooltip = useCallback<TooltipCellProps["showTooltip"]>(
    (newTooltip) => {
      const isEditorOpen =
        !!document.querySelector(`div[id="portal"]`)?.children.length;

      if (isEditorOpen) {
        return;
      }

      if (!isEqual(gridTooltip, newTooltip)) {
        setGridTooltip(newTooltip);
      }

      const bounds = gridRef.current?.getBounds(
        newTooltip.colIndex,
        newTooltip.rowIndex,
      );

      if (!bounds) {
        return;
      }

      popupState.open();

      const left = bounds.x + newTooltip.iconX;
      const top = bounds.y;

      setTooltipPos((prev) => {
        if (prev?.left === left && prev.top === top) {
          return prev;
        }

        return { left, top };
      });
    },
    [popupState, gridTooltip, gridRef],
  );

  const hideTooltip = useCallback<TooltipCellProps["hideTooltip"]>(
    (colIndex, rowIndex) => {
      if (
        gridTooltip?.colIndex === colIndex &&
        gridTooltip.rowIndex === rowIndex
      ) {
        popupState.close();
      }
    },
    [popupState, gridTooltip],
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
          {gridTooltip?.text}
        </Typography>
      </Popover>
    ),
  };
};
