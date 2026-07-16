import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Box, Typography } from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import {
  GridLayout,
  type Layout,
  useContainerWidth,
  verticalCompactor,
} from "react-grid-layout";

import { Icon } from "@hashintel/ds-components";

import {
  DashboardItem,
  DRAG_HANDLE_CLASS,
} from "./dashboard-grid/dashboard-item";

import type { DashboardData, DashboardItemData } from "../shared/types";
import type { EntityId } from "@blockprotocol/type-system";
import type { GridPosition } from "@local/hash-isomorphic-utils/dashboard-types";

type DashboardGridProps = {
  dashboard: DashboardData;
  onAddItemClick: () => void;
  onLayoutChange: (layout: GridPosition[]) => void;
  onItemConfigureClick: (item: DashboardItemData) => void;
  onItemDeleteClick: (item: DashboardItemData) => void;
  onEntityClick?: (entityId: EntityId) => void;
  /** Dashboard-wide hovered entity; used to highlight matching rows/markers across items. */
  hoveredEntityId?: EntityId | null;
  onHoveredEntityChange?: (entityId: EntityId | null) => void;
  isEditing: boolean;
  canEdit: boolean;
};

// Height in grid rows for a minimized item (header only, rowHeight is 36px)
const MINIMIZED_HEIGHT = 1;

/**
 * Layered shadow shown on a card while it is being dragged (from the Figma
 * dragging-state design).
 */
const draggingShadow =
  "0px 1px 1px 0px rgba(0,0,0,0.05), 0px 2px 2px 0px rgba(0,0,0,0.05), 0px 5px 5px 0px rgba(0,0,0,0.05), 0px 10px 10px 0px rgba(0,0,0,0.05), 0px 0px 8px 0px rgba(0,0,0,0.05)";

export const DashboardGrid = ({
  dashboard,
  onAddItemClick,
  onLayoutChange,
  onItemConfigureClick,
  onItemDeleteClick,
  onEntityClick,
  hoveredEntityId,
  onHoveredEntityChange,
  isEditing = false,
  canEdit = false,
}: DashboardGridProps) => {
  const { width, containerRef, mounted } = useContainerWidth();
  const [minimizedItems, setMinimizedItems] = useState<Record<string, number>>(
    {},
  );

  const toggleMinimized = useCallback(
    (itemId: string, originalHeight: number) => {
      setMinimizedItems((prev) => {
        if (itemId in prev) {
          // Item is minimized, restore it
          const { [itemId]: _, ...rest } = prev;
          return rest;
        }
        // Item is expanded, minimize it (store original height for restoration)
        return { ...prev, [itemId]: originalHeight };
      });
    },
    [],
  );

  const layout: Layout = useMemo(() => {
    return dashboard.items.map((item) => {
      const itemId = item.gridPosition.i || item.entityId;
      const isMinimized = itemId in minimizedItems;
      return {
        ...item.gridPosition,
        i: itemId,
        h: isMinimized ? MINIMIZED_HEIGHT : item.gridPosition.h,
      };
    });
  }, [dashboard.items, minimizedItems]);

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      const gridPositions: GridPosition[] = newLayout.map((layoutItem) => ({
        i: layoutItem.i,
        x: layoutItem.x,
        y: layoutItem.y,
        w: layoutItem.w,
        h: layoutItem.h,
      }));
      onLayoutChange(gridPositions);
    },
    [onLayoutChange],
  );

  const isEmpty = dashboard.items.length === 0;
  const showClickPrompt = isEditing && canEdit && isEmpty;

  return (
    <Box
      onClick={showClickPrompt ? onAddItemClick : undefined}
      ref={containerRef}
      sx={({ palette }) => ({
        cursor: showClickPrompt ? "pointer" : "default",
        position: "relative",
        borderRadius: "12px",
        ...(isEmpty && {
          backgroundColor: palette.gray[10],
          border: `1px dashed ${palette.gray[30]}`,
          minHeight: 600,
          transition: "background-color 0.2s ease",
          "&:hover":
            isEditing && canEdit
              ? { backgroundColor: palette.gray[15] }
              : undefined,
        }),
        // Neutral drop placeholder instead of the library's red default
        "& .react-grid-item.react-grid-placeholder": {
          backgroundColor: "rgba(0, 0, 0, 0.06)",
          opacity: 1,
          borderRadius: "12px",
        },
        // Elevated, slightly tilted card while dragging
        "& .react-grid-item.react-draggable-dragging": {
          zIndex: 10,
          "& .dashboard-item-card": {
            boxShadow: draggingShadow,
            rotate: "1.5deg",
          },
        },
        "& .dashboard-item-card": {
          transition: "box-shadow 0.15s ease, rotate 0.15s ease",
        },
        [`& .${DRAG_HANDLE_CLASS}`]: {
          cursor: "grab",
        },
        [`& .react-draggable-dragging .${DRAG_HANDLE_CLASS}`]: {
          cursor: "grabbing",
        },
      })}
    >
      {showClickPrompt && (
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
            zIndex: 1,
            color: ({ palette }) => palette.gray[40],
          }}
        >
          <Icon name="circlePlus" size="lg" />
          <Typography
            variant="regularTextParagraphs"
            sx={({ palette }) => ({
              color: palette.gray[60],
              display: "block",
              mt: 1,
            })}
          >
            Click anywhere to add your first item
          </Typography>
        </Box>
      )}

      {mounted && (
        <GridLayout
          layout={layout}
          width={width}
          compactor={verticalCompactor}
          gridConfig={{
            cols: 12,
            rowHeight: 36,
          }}
          dragConfig={{
            bounded: true,
            enabled: isEditing,
            handle: `.${DRAG_HANDLE_CLASS}`,
          }}
          resizeConfig={{
            enabled: isEditing,
          }}
          onDragStop={handleLayoutChange}
          onResizeStop={handleLayoutChange}
        >
          {dashboard.items.map((item) => {
            const itemId = item.gridPosition.i || item.entityId;
            const isMinimized = itemId in minimizedItems;
            return (
              <div key={itemId}>
                <DashboardItem
                  item={item}
                  isEditing={isEditing}
                  isMinimized={isMinimized}
                  onMinimizeToggle={() =>
                    toggleMinimized(itemId, item.gridPosition.h)
                  }
                  onConfigureClick={() => onItemConfigureClick(item)}
                  onDeleteClick={() => onItemDeleteClick(item)}
                  onEntityClick={onEntityClick}
                  hoveredEntityId={hoveredEntityId}
                  onHoveredEntityChange={onHoveredEntityChange}
                />
              </div>
            );
          })}
        </GridLayout>
      )}
    </Box>
  );
};
