import { DataEditorRef } from "@glideapps/glide-data-grid";
import { Popover } from "@hashintel/hash-design-system";
import { PopoverPosition, Typography } from "@mui/material";
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

      const bounds = gridRef.current?.getBounds(newTooltip.col, newTooltip.row);

      if (!bounds) {
        return;
      }

      popupState.open();

      const left = bounds.x + newTooltip.iconX;
      const top = bounds.y;

      setTooltipPos((prev) => {
        if (prev?.left === left && prev?.top === top) {
          return prev;
        }

        return { left, top };
      });
    },
    [popupState, gridTooltip, gridRef],
  );

  const hideTooltip = useCallback<TooltipCellProps["hideTooltip"]>(
    (col, row) => {
      if (gridTooltip?.col === col && gridTooltip?.row === row) {
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
        /**
         * disabling scroll lock is intended here, even without the "popovers resetting the scroll position" issue
         * because we don't want user to disable scroll lock when they hover on grid tooltips while scrolling
         * @todo but in the long run, we should fix our buggy custom `useScrollLock` implementation
         * it causes the page scroll to reset
         * @see https://github.com/blockprotocol/blockprotocol/pull/588 the PR solved the same issue on BP repo
         */
        disableScrollLock
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
