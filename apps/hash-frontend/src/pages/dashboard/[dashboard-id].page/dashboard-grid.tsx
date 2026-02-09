import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import type { EntityId } from "@blockprotocol/type-system";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import type { GridPosition } from "@local/hash-isomorphic-utils/dashboard-types";
import { Box, Typography } from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import {
  GridLayout,
  type Layout,
  useContainerWidth,
  verticalCompactor,
} from "react-grid-layout";

import type { DashboardData, DashboardItemData } from "../shared/types";
import { DashboardItem } from "./dashboard-grid/dashboard-item";

type DashboardGridProps = {
  dashboard: DashboardData;
  /** Current script params per item (e.g. date range). Keyed by item id (gridPosition.i or entityId). */
  scriptParamsByItemId?: Record<string, Record<string, string>>;
  onScriptParamsChange?: (
    itemId: string,
    params: Record<string, string>,
  ) => void;
  onAddItemClick: () => void;
  onLayoutChange: (layout: GridPosition[]) => void;
  onItemConfigureClick: (item: DashboardItemData) => void;
  onItemRefreshClick: (item: DashboardItemData) => void;
  onItemDeleteClick: (item: DashboardItemData) => void;
  onEntityClick?: (entityId: EntityId) => void;
  /** Dashboard-wide hovered entity; used to highlight matching rows/markers across items. */
  hoveredEntityId?: EntityId | null;
  onHoveredEntityChange?: (entityId: EntityId | null) => void;
  isEditing: boolean;
  canEdit: boolean;
  isDataLoading?: boolean;
};

// Height in grid rows for a minimized item (header only, rowHeight is 36px)
const MINIMIZED_HEIGHT = 1;

export const DashboardGrid = ({
  dashboard,
  scriptParamsByItemId = {},
  onScriptParamsChange,
  onAddItemClick,
  onLayoutChange,
  onItemConfigureClick,
  onItemRefreshClick,
  onItemDeleteClick,
  onEntityClick,
  hoveredEntityId,
  onHoveredEntityChange,
  isEditing = false,
  canEdit = false,
  isDataLoading = false,
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

  const showClickPrompt = isEditing && canEdit && dashboard.items.length === 0;

  return (
    <Box
      onClick={showClickPrompt ? onAddItemClick : undefined}
      ref={containerRef}
      sx={({ palette }) => ({
        cursor: showClickPrompt ? "pointer" : "default",
        position: "relative",
        borderRadius: 1,
        backgroundColor: palette.gray[10],
        border: `1px dashed ${palette.gray[30]}`,
        minHeight: dashboard.items.length === 0 ? 600 : "auto",
        transition: "background-color 0.2s ease",
        "&:hover": isEditing &&
          canEdit && {
            backgroundColor: palette.gray[15],
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
          }}
        >
          <FontAwesomeIcon
            icon={faPlusCircle}
            sx={({ palette }) => ({
              fontSize: 48,
              color: palette.gray[40],
              mb: 2,
            })}
          />
          <Typography
            variant="regularTextParagraphs"
            sx={({ palette }) => ({
              color: palette.gray[60],
              display: "block",
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
                  scriptParams={
                    scriptParamsByItemId[itemId] ?? item.scriptParams
                  }
                  onScriptParamsChange={onScriptParamsChange}
                  isEditing={isEditing}
                  isMinimized={isMinimized}
                  isDataLoading={isDataLoading}
                  onMinimizeToggle={() =>
                    toggleMinimized(itemId, item.gridPosition.h)
                  }
                  onConfigureClick={() => onItemConfigureClick(item)}
                  onRefreshClick={() => onItemRefreshClick(item)}
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
