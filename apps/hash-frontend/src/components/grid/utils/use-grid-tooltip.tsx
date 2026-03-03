import type { DataEditorRef } from "@glideapps/glide-data-grid";
import { useWindowEvent } from "@mantine/hooks";
import type { PopoverPosition } from "@mui/material";
import { Box, Popper, Typography } from "@mui/material";
import type { VirtualElement } from "@popperjs/core";
import { isEqual } from "lodash";
import { usePopupState } from "material-ui-popup-state/hooks";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  GridTooltip,
  TooltipCellProps,
  UseGridTooltipResponse,
} from "./use-grid-tooltip/types";

export const useGridTooltip = (
  gridRef: RefObject<DataEditorRef | null>,
): UseGridTooltipResponse => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "grid-tooltip",
  });

  const [gridTooltip, setGridTooltip] = useState<GridTooltip | null>(null);
  const [tooltipPos, setTooltipPos] = useState<PopoverPosition>();

  const latestGridRef = useRef(gridRef.current);

  useEffect(() => {
    latestGridRef.current = gridRef.current;
  });

  const tooltipRef = useRef<HTMLDivElement>(null);

  // prevent tooltip from staying at the same position when user scrolls vertically
  useWindowEvent(
    "scroll",
    () => {
      popupState.close();
      setGridTooltip(null);
    },
    { capture: true },
  );

  useEffect(() => {
    const eventListener = (event: MouseEvent) => {
      if (tooltipRef.current?.contains(event.target as Node)) {
        return;
      }

      if (!gridTooltip) {
        return;
      }

      const ref = latestGridRef.current;

      const bounds = ref?.getBounds(gridTooltip.colIndex, gridTooltip.rowIndex);

      if (!bounds) {
        setGridTooltip(null);
        return;
      }

      const { interactablePosRelativeToCell, interactableSize } = gridTooltip;

      const interactableStartX =
        bounds.x +
        ("right" in interactablePosRelativeToCell
          ? bounds.width -
            interactableSize.width -
            interactablePosRelativeToCell.right
          : interactablePosRelativeToCell.left);

      const interactableStartY = bounds.y + interactablePosRelativeToCell.top;

      if (
        event.clientX < interactableStartX ||
        event.clientX > interactableStartX + interactableSize.width ||
        event.clientY < interactableStartY ||
        event.clientY > interactableStartY + interactableSize.height
      ) {
        setGridTooltip(null);
      }
    };

    document.addEventListener("mousemove", eventListener);

    return () => {
      document.removeEventListener("mousemove", eventListener);
    };
  }, [gridTooltip]);

  const showTooltip = useCallback<TooltipCellProps["showTooltip"]>(
    (newTooltip) => {
      const isEditorOpen =
        !!document.querySelector(`div[id="portal"]`)?.children.length;

      if (isEditorOpen) {
        return;
      }

      const ref = latestGridRef.current;

      const bounds = ref?.getBounds(newTooltip.colIndex, newTooltip.rowIndex);

      if (!bounds) {
        return;
      }

      if (!isEqual(gridTooltip, newTooltip)) {
        setGridTooltip(newTooltip);
      }

      const left =
        bounds.x +
        ("right" in newTooltip.interactablePosRelativeToCell
          ? bounds.width -
            newTooltip.interactableSize.width -
            newTooltip.interactablePosRelativeToCell.right
          : newTooltip.interactablePosRelativeToCell.left);

      const top = bounds.y;

      setTooltipPos((prev) => {
        if (prev?.left === left && prev.top === top) {
          return prev;
        }

        return { left, top };
      });
    },
    [gridTooltip],
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

  const bounds = gridTooltip
    ? gridRef.current?.getBounds(gridTooltip.colIndex, gridTooltip.rowIndex)
    : null;

  const virtualElement: VirtualElement | null = useMemo(
    () =>
      bounds && tooltipPos
        ? {
            getBoundingClientRect: () => ({
              width: bounds.width,
              height: bounds.height,
              top: tooltipPos.top,
              left: tooltipPos.left,
              bottom: tooltipPos.top + bounds.height,
              right: tooltipPos.left + bounds.width,
              x: tooltipPos.left,
              y: tooltipPos.top,
              toJSON: () => "",
            }),
          }
        : null,
    [bounds, tooltipPos],
  );

  return {
    showTooltip,
    hideTooltip,
    tooltipElement: !gridTooltip ? null : (
      <Popper
        anchorEl={virtualElement}
        open={!!gridTooltip}
        placement="top-start"
        sx={{ zIndex: 100_000, borderRadius: 2 }}
      >
        {typeof gridTooltip.content === "string" ? (
          <Box
            ref={tooltipRef}
            sx={{
              py: 0.75,
              px: 1.5,
              backgroundColor: ({ palette }) => palette.gray[90],
            }}
          >
            <Typography
              sx={{ fontSize: 13, fontWeight: 500, lineHeight: "18px" }}
              textAlign="center"
              color="white"
            >
              {gridTooltip.content}
            </Typography>
          </Box>
        ) : (
          <Box
            ref={tooltipRef}
            sx={{
              maxWidth: bounds?.width,
              borderRadius: 2,
              background: ({ palette }) => palette.common.white,
            }}
          >
            {gridTooltip.content}
          </Box>
        )}
      </Popper>
    ),
  };
};
