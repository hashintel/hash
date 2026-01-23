import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import type { GridPosition } from "@local/hash-isomorphic-utils/dashboard-types";
import { Box, Typography } from "@mui/material";
import type { MouseEvent } from "react";
import { useCallback, useMemo } from "react";
import { GridLayout, type Layout, useContainerWidth } from "react-grid-layout";

import type { DashboardData, DashboardItemData } from "../shared/types";
import { DashboardItem } from "./dashboard-item";

const GRID_COLS = 12;
const ROW_HEIGHT = 100;
const GRID_GAP = 16;
const MIN_CANVAS_HEIGHT = 600;

type DashboardGridProps = {
  dashboard: DashboardData;
  onLayoutChange?: (layout: GridPosition[]) => void;
  onItemConfigureClick?: (item: DashboardItemData) => void;
  onItemRefreshClick?: (item: DashboardItemData) => void;
  onCanvasClick?: () => void;
  isEditing?: boolean;
  canEdit?: boolean;
};

export const DashboardGrid = ({
  dashboard,
  onLayoutChange,
  onItemConfigureClick,
  onItemRefreshClick,
  onCanvasClick,
  isEditing = false,
  canEdit = false,
}: DashboardGridProps) => {
  const { width, containerRef, mounted } = useContainerWidth();

  const layout: Layout = useMemo(() => {
    return dashboard.items.map((item) => ({
      ...item.gridPosition,
      i: item.gridPosition.i || item.entityId,
    }));
  }, [dashboard.items]);

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      const gridPositions: GridPosition[] = newLayout.map((layoutItem) => ({
        i: layoutItem.i,
        x: layoutItem.x,
        y: layoutItem.y,
        w: layoutItem.w,
        h: layoutItem.h,
      }));
      onLayoutChange?.(gridPositions);
    },
    [onLayoutChange],
  );

  const handleCanvasClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      // Only trigger if clicking directly on the canvas (not on an item)
      if (
        isEditing &&
        canEdit &&
        event.target === event.currentTarget &&
        onCanvasClick
      ) {
        onCanvasClick();
      }
    },
    [isEditing, canEdit, onCanvasClick],
  );

  // Calculate the cell width for grid background
  const cellWidth = mounted && width > 0 ? (width - GRID_GAP) / GRID_COLS : 0;

  // Calculate minimum height based on content
  const contentHeight = useMemo(() => {
    if (dashboard.items.length === 0) {
      return MIN_CANVAS_HEIGHT;
    }
    const maxY = Math.max(
      ...dashboard.items.map(
        (item) => (item.gridPosition.y + item.gridPosition.h) * ROW_HEIGHT,
      ),
    );
    return Math.max(maxY + ROW_HEIGHT * 2, MIN_CANVAS_HEIGHT);
  }, [dashboard.items]);

  const showClickPrompt = isEditing && canEdit && dashboard.items.length === 0;

  return (
    <Box
      ref={containerRef}
      onClick={handleCanvasClick}
      sx={({ palette }) => ({
        minHeight: contentHeight,
        position: "relative",
        borderRadius: 1,
        cursor: isEditing && canEdit ? "cell" : "default",
        // Grid background pattern
        backgroundImage:
          cellWidth > 0
            ? `
            linear-gradient(to right, ${palette.gray[20]} 1px, transparent 1px),
            linear-gradient(to bottom, ${palette.gray[20]} 1px, transparent 1px)
          `
            : "none",
        backgroundSize: `${cellWidth}px ${ROW_HEIGHT}px`,
        backgroundColor: palette.gray[10],
        border: `1px dashed ${palette.gray[30]}`,
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
          className="dashboard-grid"
          layout={layout}
          width={width}
          gridConfig={{
            cols: GRID_COLS,
            rowHeight: ROW_HEIGHT,
            margin: [GRID_GAP, GRID_GAP] as const,
            containerPadding: [0, 0] as const,
          }}
          dragConfig={{
            enabled: isEditing,
            handle: ".drag-handle",
          }}
          resizeConfig={{
            enabled: isEditing,
          }}
          onLayoutChange={handleLayoutChange}
        >
          {dashboard.items.map((item) => (
            <div key={item.gridPosition.i || item.entityId}>
              <DashboardItem
                item={item}
                onConfigureClick={() => onItemConfigureClick?.(item)}
                onRefreshClick={() => onItemRefreshClick?.(item)}
              />
            </div>
          ))}
        </GridLayout>
      )}
    </Box>
  );
};
