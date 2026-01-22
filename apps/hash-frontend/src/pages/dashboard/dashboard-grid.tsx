import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import type { GridPosition } from "@local/hash-isomorphic-utils/dashboard-types";
import { useCallback, useMemo } from "react";
import { GridLayout, type Layout, useContainerWidth } from "react-grid-layout";

import { DashboardItem } from "./dashboard-item";
import type { DashboardData, DashboardItemData } from "./shared/types";

type DashboardGridProps = {
  dashboard: DashboardData;
  onLayoutChange?: (layout: GridPosition[]) => void;
  onItemConfigureClick?: (item: DashboardItemData) => void;
  onItemRefreshClick?: (item: DashboardItemData) => void;
  isEditing?: boolean;
};

export const DashboardGrid = ({
  dashboard,
  onLayoutChange,
  onItemConfigureClick,
  onItemRefreshClick,
  isEditing = true,
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

  return (
    <div ref={containerRef}>
      {mounted && (
        <GridLayout
          className="dashboard-grid"
          layout={layout}
          width={width}
          gridConfig={{
            cols: 12,
            rowHeight: 100,
            margin: [16, 16] as const,
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
    </div>
  );
};
