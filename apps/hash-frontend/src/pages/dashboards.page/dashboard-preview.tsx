import { Box, Typography } from "@mui/material";

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

const ChartGlyph = ({ chartType }: { chartType: ChartType | null }) => {
  switch (chartType) {
    case "bar":
      return (
        <svg aria-hidden viewBox="0 0 48 32">
          <rect x="5" y="17" width="8" height="11" rx="1" />
          <rect x="20" y="8" width="8" height="20" rx="1" />
          <rect x="35" y="13" width="8" height="15" rx="1" />
        </svg>
      );
    case "line":
      return (
        <svg aria-hidden viewBox="0 0 48 32">
          <path
            d="M4 25 14 17l9 4 9-13 12 7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        </svg>
      );
    case "pie":
      return (
        <svg aria-hidden viewBox="0 0 48 32">
          <path d="M24 3a13 13 0 1 0 13 13H24Z" opacity="0.45" />
          <path d="M27 3v10h10A13 13 0 0 0 27 3" />
        </svg>
      );
    case "scatter":
      return (
        <svg aria-hidden viewBox="0 0 48 32">
          <circle cx="9" cy="23" r="3" />
          <circle cx="18" cy="15" r="2.5" opacity="0.7" />
          <circle cx="27" cy="20" r="3.5" />
          <circle cx="36" cy="9" r="3" opacity="0.65" />
          <circle cx="42" cy="16" r="2" />
        </svg>
      );
    case "heatmap":
      return (
        <svg aria-hidden viewBox="0 0 48 32">
          {[0, 1, 2].flatMap((rowIndex) =>
            [0, 1, 2, 3].map((columnIndex) => (
              <rect
                key={`${rowIndex}-${columnIndex}`}
                x={5 + columnIndex * 10}
                y={3 + rowIndex * 9}
                width="8"
                height="7"
                rx="1"
                opacity={0.3 + ((rowIndex + columnIndex * 2) % 4) * 0.2}
              />
            )),
          )}
        </svg>
      );
    case "map":
      return (
        <svg aria-hidden viewBox="0 0 48 32">
          <ellipse cx="24" cy="16" rx="18" ry="12" opacity="0.28" />
          <path
            d="M8 14c5-2 8 1 12-2 4-4 7-5 12-3 3 2 5 5 8 6M12 22c5-3 9-2 13 1 4 2 8 1 11-2"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      );
    default:
      return (
        <svg aria-hidden viewBox="0 0 48 32">
          <rect x="5" y="7" width="38" height="3" rx="1.5" opacity="0.35" />
          <rect x="5" y="15" width="27" height="3" rx="1.5" opacity="0.6" />
          <rect x="5" y="23" width="33" height="3" rx="1.5" opacity="0.45" />
        </svg>
      );
  }
};

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
