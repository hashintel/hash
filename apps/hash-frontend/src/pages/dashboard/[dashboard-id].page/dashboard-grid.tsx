import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import type { GridPosition } from "@local/hash-isomorphic-utils/dashboard-types";
import { Box, Typography } from "@mui/material";
import { useCallback, useMemo } from "react";
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
  onAddItemClick: () => void;
  onLayoutChange: (layout: GridPosition[]) => void;
  onItemConfigureClick: (item: DashboardItemData) => void;
  onItemRefreshClick: (item: DashboardItemData) => void;
  onItemDeleteClick: (item: DashboardItemData) => void;
  isEditing: boolean;
  canEdit: boolean;
};

export const DashboardGrid = ({
  dashboard,
  onAddItemClick,
  onLayoutChange,
  onItemConfigureClick,
  onItemRefreshClick,
  onItemDeleteClick,
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
            rowHeight: 30,
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
          {dashboard.items.map((item) => (
            <div key={item.gridPosition.i || item.entityId}>
              <DashboardItem
                item={item}
                isEditing={isEditing}
                onConfigureClick={() => onItemConfigureClick(item)}
                onRefreshClick={() => onItemRefreshClick(item)}
                onDeleteClick={() => onItemDeleteClick(item)}
              />
            </div>
          ))}
        </GridLayout>
      )}
    </Box>
  );
};
