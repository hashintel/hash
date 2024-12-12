import type { DataEditorRef } from "@glideapps/glide-data-grid";
import type { PopoverPosition } from "@mui/material";
import { Popover, Typography } from "@mui/material";
import { isEqual } from "lodash";
import { bindPopover, usePopupState } from "material-ui-popup-state/hooks";
import { RefObject, useEffect } from "react";
import { useCallback, useState } from "react";
import { useWindowEventListener } from "rooks";

import type {
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
    setGridTooltip(null);
  });

  const [gridTooltip, setGridTooltip] = useState<GridTooltip | null>(null);
  const [tooltipPos, setTooltipPos] = useState<PopoverPosition>();

  useEffect(() => {
    const eventListener = (event: MouseEvent) => {
      if (!gridTooltip) {
        return;
      }

      // close the tooltip if we've moved outside of it
      const bounds = gridRef.current?.getBounds(
        gridTooltip.colIndex,
        gridTooltip.rowIndex,
      );

      if (
        !bounds ||
        event.clientX < bounds.x ||
        event.clientX > bounds.x + bounds.width ||
        event.clientY < bounds.y ||
        event.clientY > bounds.y + bounds.height
      ) {
        popupState.close();
        setGridTooltip(null);
      }
    };

    document.addEventListener("mousemove", eventListener);

    return () => {
      document.removeEventListener("mousemove", eventListener);
    };
  }, [gridTooltip, gridRef, popupState]);

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
        setGridTooltip(null);
      }
    },
    [popupState, gridTooltip],
  );

  return {
    showTooltip,
    hideTooltip,
    tooltipElement: !gridTooltip ? null : (
      <Popover
        {...bindPopover(popupState)}
        anchorReference="anchorPosition"
        anchorPosition={tooltipPos}
        transformOrigin={{ horizontal: "center", vertical: "bottom" }}
        PaperProps={{
          sx: {
            py: 0.75,
            px: 1.5,
            backgroundColor: ({ palette }) => palette.gray[90],
          },
        }}
      >
        <Typography
          sx={{ fontSize: 13, fontWeight: 500, lineHeight: "18px" }}
          textAlign="center"
          color="white"
        >
          {gridTooltip?.text}
        </Typography>
      </Popover>
    ),
  };
};
