import { Box, CircularProgress, Typography } from "@mui/material";

import { Button } from "@hashintel/ds-components";

import { ChartRenderer } from "./dashboard-item-content/chart-renderer";
import { WorldMapRenderer } from "./dashboard-item-content/world-map-renderer";

import type { DashboardItemData } from "../../../shared/types";
import type { FlightPosition } from "./dashboard-item-content/world-map-renderer";
import type { EntityId } from "@blockprotocol/type-system";

type DashboardItemContentProps = {
  item: DashboardItemData;
  /** Server-computed chart data (fetched via the analysis gateway) */
  chartData: unknown[] | null;
  /** Whether chart data is being fetched/computed */
  dataLoading: boolean;
  /** Error from fetching/computing chart data */
  dataError: string | null;
  generationLabel?: string;
  onRetryDataClick?: () => void;
  onConfigureClick?: () => void;
  onEntityClick?: (entityId: EntityId) => void;
  hoveredEntityId?: EntityId | null;
  onHoveredEntityChange?: (entityId: EntityId | null) => void;
};

const CenteredMessage = ({ children }: { children: React.ReactNode }) => (
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
    {children}
  </Box>
);

/**
 * Point-based geo data (individual positions with coordinates) renders on the
 * interactive world map; other `map`-type data falls back to the ECharts
 * choropleth via {@link ChartRenderer}.
 */
const isPositionData = (chartData: unknown[]): chartData is FlightPosition[] =>
  chartData.length > 0 &&
  chartData.every(
    (dataItem) =>
      typeof dataItem === "object" &&
      dataItem !== null &&
      typeof (dataItem as { latitude?: unknown }).latitude === "number" &&
      typeof (dataItem as { longitude?: unknown }).longitude === "number",
  );

export const DashboardItemContent = ({
  item,
  chartData,
  dataLoading,
  dataError,
  generationLabel,
  onRetryDataClick,
  onConfigureClick,
  onEntityClick,
  hoveredEntityId,
  onHoveredEntityChange,
}: DashboardItemContentProps) => {
  const { chartType, chartConfig, configurationStatus, errorMessage } = item;

  switch (configurationStatus) {
    case "pending":
      return (
        <CenteredMessage>
          <Typography
            variant="smallTextParagraphs"
            sx={{ color: ({ palette }) => palette.gray[60] }}
          >
            Configure this item to display a chart
          </Typography>
          <Button
            variant="solid"
            tone="neutral"
            size="sm"
            onClick={onConfigureClick}
          >
            Configure chart
          </Button>
        </CenteredMessage>
      );

    case "configuring":
      return (
        <CenteredMessage>
          <CircularProgress />
          <Typography
            variant="smallTextParagraphs"
            sx={{ color: ({ palette }) => palette.gray[70] }}
          >
            {generationLabel ?? "Generating new item…"}
          </Typography>
        </CenteredMessage>
      );

    case "error":
      return (
        <CenteredMessage>
          <Typography
            variant="smallTextParagraphs"
            sx={{
              color: ({ palette }) => palette.red[70],
              textAlign: "center",
            }}
          >
            {errorMessage ?? "Failed to configure chart"}
          </Typography>
          <Button
            variant="subtle"
            tone="neutral"
            size="sm"
            iconName="rotate"
            onClick={onConfigureClick}
          >
            Reconfigure
          </Button>
        </CenteredMessage>
      );

    case "ready": {
      if (dataLoading && !chartData) {
        return (
          <CenteredMessage>
            <CircularProgress size={32} />
            <Typography
              variant="smallTextParagraphs"
              sx={{ color: ({ palette }) => palette.gray[60] }}
            >
              Preparing chart data…
            </Typography>
          </CenteredMessage>
        );
      }

      if (dataError) {
        return (
          <CenteredMessage>
            <Typography
              variant="smallTextParagraphs"
              sx={{
                color: ({ palette }) => palette.red[70],
                textAlign: "center",
              }}
            >
              {dataError}
            </Typography>
            {onRetryDataClick && (
              <Button
                variant="subtle"
                tone="neutral"
                size="sm"
                iconName="rotate"
                onClick={onRetryDataClick}
              >
                Retry
              </Button>
            )}
          </CenteredMessage>
        );
      }

      if (!chartType || !chartData) {
        return (
          <CenteredMessage>
            <Typography
              variant="smallTextParagraphs"
              sx={{
                color: ({ palette }) => palette.gray[70],
                textAlign: "center",
              }}
            >
              Missing chart configuration
            </Typography>
          </CenteredMessage>
        );
      }

      if (chartType === "map" && isPositionData(chartData)) {
        return (
          <WorldMapRenderer
            flights={chartData}
            onFlightClick={onEntityClick}
            hoveredEntityId={hoveredEntityId}
            onHoveredEntityChange={onHoveredEntityChange}
          />
        );
      }

      if (!chartConfig) {
        return (
          <CenteredMessage>
            <Typography
              variant="smallTextParagraphs"
              sx={{
                color: ({ palette }) => palette.gray[70],
                textAlign: "center",
              }}
            >
              Missing chart configuration
            </Typography>
          </CenteredMessage>
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
    }

    default:
      return null;
  }
};
