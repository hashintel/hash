import type { EntityId } from "@blockprotocol/type-system";
import { IconButton } from "@hashintel/design-system";
import {
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useMemo, useRef } from "react";

import type { DashboardItemData } from "../../../shared/types";
import { runDataScript } from "../../run-data-script";
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
  /** Effective script params (from parent state or item default). Used when item has dataScript. */
  scriptParams?: Record<string, string>;
  isDataLoading?: boolean;
  onConfigureClick?: () => void;
  onEntityClick?: (entityId: EntityId) => void;
  hoveredEntityId?: EntityId | null;
  onHoveredEntityChange?: (entityId: EntityId | null) => void;
};

/**
 * Renders custom (non-ECharts) visualizations based on chart type.
 */
const CustomRenderer = ({
  chartType,
  chartData,
  onEntityClick,
  hoveredEntityId,
  onHoveredEntityChange,
}: {
  chartType: CustomChartType;
  chartData: unknown[];
  onEntityClick?: (entityId: EntityId) => void;
  hoveredEntityId?: EntityId | null;
  onHoveredEntityChange?: (entityId: EntityId | null) => void;
}) => {
  switch (chartType) {
    case "flight-board":
      return (
        <FlightBoard
          flights={chartData as FlightBoardFlight[]}
          mode="arrivals"
          onFlightClick={onEntityClick}
          hoveredEntityId={hoveredEntityId}
          onHoveredEntityChange={onHoveredEntityChange}
        />
      );
    case "world-map":
      return (
        <WorldMapRenderer
          flights={chartData as FlightPosition[]}
          onFlightClick={onEntityClick}
          hoveredEntityId={hoveredEntityId}
          onHoveredEntityChange={onHoveredEntityChange}
        />
      );
    default:
      return null;
  }
};

export const DashboardItemContent = ({
  item,
  scriptParams: scriptParamsProp,
  isDataLoading = false,
  onConfigureClick,
  onEntityClick,
  hoveredEntityId,
  onHoveredEntityChange,
}: DashboardItemContentProps) => {
  const {
    chartType,
    chartData: itemChartData,
    chartConfig,
    configurationStatus,
    errorMessage,
    rawData,
    dataScript,
    scriptParams: itemScriptParams,
  } = item;

  const rawEffectiveScriptParams =
    scriptParamsProp ?? itemScriptParams ?? undefined;

  // Stabilise the empty-params case so the useMemo doesn't bust on every render.
  const prevParamsRef = useRef(rawEffectiveScriptParams);
  const effectiveScriptParams = useMemo(() => {
    const next = rawEffectiveScriptParams ?? {};
    const prev = prevParamsRef.current ?? {};
    // Shallow-compare: if all keys/values match, keep the previous reference.
    const keys = Object.keys(next);
    if (
      keys.length === Object.keys(prev).length &&
      keys.every((key) => prev[key] === next[key])
    ) {
      return prevParamsRef.current ?? {};
    }
    prevParamsRef.current = next;
    return next;
  }, [rawEffectiveScriptParams]);

  const { chartData: scriptChartData, scriptError } = useMemo(() => {
    if (!dataScript?.script || rawData === undefined) {
      return {
        chartData: null as unknown[] | null,
        scriptError: null as string | null,
      };
    }
    try {
      const result = runDataScript(rawData, dataScript, effectiveScriptParams);
      return { chartData: result, scriptError: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { chartData: null, scriptError: message };
    }
  }, [rawData, dataScript, effectiveScriptParams]);

  const chartData =
    dataScript && rawData !== undefined ? scriptChartData : itemChartData;

  // Show loading spinner when data is loading
  if (isDataLoading) {
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
        <CircularProgress size={32} />
        <Typography
          variant="smallTextParagraphs"
          sx={{ color: ({ palette }) => palette.gray[60] }}
        >
          Loading data...
        </Typography>
      </Box>
    );
  }

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
      if (scriptError) {
        return (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 1,
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
              Script error: {scriptError}
            </Typography>
            {onConfigureClick && (
              <IconButton onClick={onConfigureClick} size="small">
                <SettingsIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        );
      }

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
            hoveredEntityId={hoveredEntityId}
            onHoveredEntityChange={onHoveredEntityChange}
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
