import { Box, Typography } from "@mui/material";

import { StaticHashIcon } from "@hashintel/ds-icons/static";

import type { EntityId } from "@blockprotocol/type-system";
import type {
  ChartType,
  GridPosition,
} from "@local/hash-isomorphic-utils/dashboard-types";

export type DashboardPreviewItem = {
  entityId: EntityId;
  chartType: ChartType | null;
  gridPosition: GridPosition;
};

const MAX_VISIBLE_ITEMS = 12;
const DASHBOARD_COLUMN_COUNT = 12;

const ChartGlyph = ({ chartType }: { chartType: ChartType | null }) => (
  <StaticHashIcon
    width={48}
    height={32}
    name={
      chartType === "bar"
        ? "chartBarSimple"
        : chartType === "line"
          ? "chartLine"
          : chartType === "pie"
            ? "pieChart"
            : chartType === "scatter"
              ? "chartScatter"
              : chartType === "heatmap"
                ? "chartHeatmap"
                : chartType === "map"
                  ? "globe"
                  : "list"
    }
  />
);

export const DashboardPreview = ({
  items,
}: {
  items: DashboardPreviewItem[];
}) => {
  const visibleItems = [...items]
    .sort((leftItem, rightItem) => {
      const leftY = Number.isFinite(leftItem.gridPosition.y)
        ? leftItem.gridPosition.y
        : Number.MAX_SAFE_INTEGER;
      const rightY = Number.isFinite(rightItem.gridPosition.y)
        ? rightItem.gridPosition.y
        : Number.MAX_SAFE_INTEGER;
      return (
        leftY - rightY || leftItem.gridPosition.x - rightItem.gridPosition.x
      );
    })
    .slice(0, MAX_VISIBLE_ITEMS);

  return (
    <Box
      sx={({ palette }) => ({
        position: "relative",
        height: 128,
        display: "grid",
        gridTemplateColumns: `repeat(${DASHBOARD_COLUMN_COUNT}, minmax(0, 1fr))`,
        gridAutoRows: "minmax(0, 1fr)",
        gridAutoFlow: "row dense",
        gap: 0.5,
        p: 0.5,
        mx: 1,
        mt: 1,
        overflow: "hidden",
        border: `1px solid ${palette.gray[30]}`,
        borderRadius: 1.5,
        backgroundColor: palette.gray[10],
        backgroundImage: `linear-gradient(${palette.gray[20]} 1px, transparent 1px),
          linear-gradient(90deg, ${palette.gray[20]} 1px, transparent 1px)`,
        backgroundSize: "8.333% 25%",
      })}
    >
      {visibleItems.length === 0 ? (
        <Box
          sx={{
            position: "absolute",
            inset: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: ({ palette }) => `1px dashed ${palette.gray[40]}`,
            borderRadius: 1,
          }}
        >
          <Typography
            variant="microText"
            sx={{ color: ({ palette }) => palette.gray[60] }}
          >
            Empty dashboard
          </Typography>
        </Box>
      ) : (
        visibleItems.map((item) => (
          <Box
            key={item.entityId}
            sx={{
              minWidth: 0,
              minHeight: 0,
              gridColumn: `span ${Math.min(
                DASHBOARD_COLUMN_COUNT,
                Math.max(1, item.gridPosition.w),
              )}`,
            }}
          >
            <Box
              sx={({ palette }) => ({
                width: "100%",
                height: "100%",
                minHeight: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                color: palette.blue[70],
                border: `1px solid ${palette.gray[30]}`,
                borderRadius: 0.75,
                backgroundColor: palette.common.white,
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                "& svg": {
                  width: "70%",
                  height: "70%",
                  fill: "currentColor",
                },
              })}
            >
              <ChartGlyph chartType={item.chartType} />
            </Box>
          </Box>
        ))
      )}

      {items.length > visibleItems.length && (
        <Box
          sx={({ palette }) => ({
            position: "absolute",
            right: 6,
            bottom: 6,
            px: 0.75,
            py: 0.25,
            color: palette.gray[80],
            border: `1px solid ${palette.gray[30]}`,
            borderRadius: 10,
            backgroundColor: "rgba(255, 255, 255, 0.92)",
            fontSize: 10,
            fontWeight: 600,
            lineHeight: "14px",
          })}
        >
          +{items.length - visibleItems.length}
        </Box>
      )}
    </Box>
  );
};
