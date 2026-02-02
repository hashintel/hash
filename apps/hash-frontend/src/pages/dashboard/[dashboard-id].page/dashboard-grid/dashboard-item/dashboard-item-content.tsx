import type { EntityId } from "@blockprotocol/type-system";
import { IconButton } from "@hashintel/design-system";
import {
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { Box, CircularProgress, Typography } from "@mui/material";

import type { DashboardItemData } from "../../../shared/types";
import { ChartRenderer } from "./dashboard-item-content/chart-renderer";
import type { FlightBoardFlight } from "./dashboard-item-content/flight-board";
import { FlightBoard } from "./dashboard-item-content/flight-board";
import type { FlightPosition } from "./dashboard-item-content/world-map-renderer";
import { WorldMapRenderer } from "./dashboard-item-content/world-map-renderer";

/** Custom chart types that don't use ECharts standard charts */
const CUSTOM_CHART_TYPES = ["flight-board", "world-map"] as const;
type CustomChartType = (typeof CUSTOM_CHART_TYPES)[number];

const isCustomChartType = (
  chartType: string | null,
): chartType is CustomChartType => {
  return CUSTOM_CHART_TYPES.includes(chartType as CustomChartType);
};

type DashboardItemContentProps = {
  item: DashboardItemData;
  onConfigureClick?: () => void;
  onEntityClick?: (entityId: EntityId) => void;
};

/**
 * Renders custom (non-ECharts) visualizations based on chart type.
 */
const CustomRenderer = ({
  chartType,
  chartData,
  onEntityClick,
}: {
  chartType: CustomChartType;
  chartData: unknown[];
  onEntityClick?: (entityId: EntityId) => void;
}) => {
  switch (chartType) {
    case "flight-board":
      return (
        <FlightBoard
          flights={chartData as FlightBoardFlight[]}
          mode="arrivals"
          onFlightClick={onEntityClick}
        />
      );
    case "world-map":
      return (
        <WorldMapRenderer
          flights={chartData as FlightPosition[]}
          onFlightClick={onEntityClick}
        />
      );
    default:
      return null;
  }
};

export const DashboardItemContent = ({
  item,
  onConfigureClick,
  onEntityClick,
}: DashboardItemContentProps) => {
  const {
    chartType,
    chartData,
    chartConfig,
    configurationStatus,
    errorMessage,
  } = item;

  switch (configurationStatus) {
    case "pending":
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 2,
          }}
        >
          <IconButton onClick={onConfigureClick} size="large">
            <SettingsIcon />
          </IconButton>
        </Box>
      );

    case "configuring":
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 2,
          }}
        >
          <CircularProgress />
          <Typography
            variant="smallTextParagraphs"
            sx={{ color: ({ palette }) => palette.gray[70] }}
          >
            AI is configuring your chart...
          </Typography>
        </Box>
      );

    case "error":
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 2,
            p: 2,
          }}
        >
          <Typography
            variant="smallTextParagraphs"
            sx={{
              color: ({ palette }) => palette.red[70],
              textAlign: "center",
            }}
          >
            {errorMessage ?? "Failed to configure chart"}
          </Typography>
          <IconButton onClick={onConfigureClick}>
            <RefreshIcon />
          </IconButton>
        </Box>
      );

    case "ready":
      if (!chartType || !chartData) {
        return (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <Typography
              variant="smallTextParagraphs"
              sx={{
                color: ({ palette }) => palette.gray[70],
                textAlign: "center",
              }}
            >
              Missing chart configuration
            </Typography>
          </Box>
        );
      }

      // Handle custom chart types (non-ECharts)
      if (isCustomChartType(chartType)) {
        return (
          <CustomRenderer
            chartType={chartType}
            chartData={chartData}
            onEntityClick={onEntityClick}
          />
        );
      }

      // ECharts-based charts require chartConfig
      if (!chartConfig) {
        return (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <Typography
              variant="smallTextParagraphs"
              sx={{
                color: ({ palette }) => palette.gray[70],
                textAlign: "center",
              }}
            >
              Missing chart configuration
            </Typography>
          </Box>
        );
      }

      return (
        <ChartRenderer
          chartType={chartType}
          chartData={chartData}
          chartConfig={chartConfig}
          onEntityClick={onEntityClick}
        />
      );

    default:
      return null;
  }
};
