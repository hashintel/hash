import { Box, Typography } from "@mui/material";
import { useCallback, useMemo } from "react";

import { isEntityId } from "@blockprotocol/type-system";
import { EChart } from "@hashintel/design-system";
import { chartConfigDisplayDefaults } from "@local/hash-isomorphic-utils/dashboard-types";

import type { EntityId } from "@blockprotocol/type-system";
import type { Chart, ECOption } from "@hashintel/design-system";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";

const DEFAULT_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#0ea5e9",
  "#14b8a6",
  "#f97316",
];

type ChartRendererProps = {
  chartType: ChartType;
  chartData: unknown[];
  chartConfig: ChartConfig;
  onEntityClick?: (entityId: EntityId) => void;
};

type ChartDataRow = Record<string, unknown>;

const AXIS_LABEL_FONT_SIZE = 10;

/** Cap rotated category labels so very long values truncate with an ellipsis */
const MAX_ROTATED_LABEL_WIDTH = 100;

/** Rough pixel width of a label (average glyph ≈ 0.6em at this size) */
const estimateTextWidth = (text: string): number =>
  Math.ceil(text.length * AXIS_LABEL_FONT_SIZE * 0.6);

const isChartDataRow = (value: unknown): value is ChartDataRow =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Chart labels may be strings or finite numbers. Other values indicate
 * malformed chart data and are rendered as an empty label rather than using
 * JavaScript's unhelpful default object stringification.
 */
const toChartLabel = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }

  return "";
};

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Compact tick labels for value axes ("1.5M" rather than "1500000"), keeping
 * wide numbers from colliding with each other and with the axis caption.
 */
const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Converts our ChartConfig format to ECharts option format
 */
const buildEChartsOption = (
  chartType: ChartType,
  chartData: unknown[],
  chartConfig: ChartConfig,
): ECOption => {
  const {
    categoryKey,
    series: seriesConfig,
    xAxisLabel,
    yAxisLabel,
    showLegend = chartConfigDisplayDefaults.showLegend,
    showGrid = chartConfigDisplayDefaults.showGrid,
    showTooltip = chartConfigDisplayDefaults.showTooltip,
    tooltipLabelKey,
    colors = DEFAULT_COLORS,
  } = chartConfig;

  /**
   * Preserve row indices so ECharts data indices still correspond to the
   * original data when handling clicks. Invalid rows render as empty values.
   */
  const data = chartData.map(
    (chartDataItem): ChartDataRow =>
      isChartDataRow(chartDataItem) ? chartDataItem : {},
  );

  // Extract category values for x-axis
  const categories = data.map((dataRow) => toChartLabel(dataRow[categoryKey]));

  // Check chart type categories
  const isPieChart =
    chartType === "pie" ||
    seriesConfig.some((seriesItem) => seriesItem.type === "pie");
  const isHeatmap =
    chartType === "heatmap" ||
    seriesConfig.some((seriesItem) => seriesItem.type === "heatmap");
  const isMap =
    chartType === "map" ||
    seriesConfig.some((seriesItem) => seriesItem.type === "map");
  const isGeoScatter =
    chartConfig.xAxisLabel === "Longitude" &&
    chartConfig.yAxisLabel === "Latitude";

  // Build series array
  const echartsSeries = seriesConfig.map((seriesItem, index) => {
    const seriesColor = seriesItem.color ?? colors[index % colors.length];

    if (seriesItem.type === "pie") {
      // Pie chart series format
      return {
        type: "pie" as const,
        name: seriesItem.name ?? seriesItem.dataKey,
        radius: seriesItem.radius ?? "50%",
        center: seriesItem.center ?? ["50%", "50%"],
        data: data.map((dataRow, dataIndex) => ({
          name: toChartLabel(dataRow[categoryKey]),
          value: toFiniteNumber(dataRow[seriesItem.dataKey]),
          itemStyle: {
            color: colors[dataIndex % colors.length],
          },
        })),
        label: {
          show: true,
          formatter: "{b}: {c}",
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: "rgba(0, 0, 0, 0.5)",
          },
        },
      };
    }

    if (seriesItem.type === "heatmap") {
      // Heatmap series format - expects data as [x, y, value]
      return {
        type: "heatmap" as const,
        name: seriesItem.name ?? seriesItem.dataKey,
        data: data.map((dataRow) => [
          toChartLabel(dataRow[categoryKey]),
          toChartLabel(dataRow.y ?? dataRow.yKey),
          toFiniteNumber(dataRow[seriesItem.dataKey]),
        ]),
        label: {
          show: true,
        },
      };
    }

    if (seriesItem.type === "map") {
      // Map series format
      return {
        type: "map" as const,
        name: seriesItem.name ?? seriesItem.dataKey,
        map: "world", // Default map, can be customized
        data: data.map((dataRow) => ({
          name: toChartLabel(dataRow[categoryKey]),
          value: toFiniteNumber(dataRow[seriesItem.dataKey]),
        })),
      };
    }

    // Scatter chart with geo coordinates
    if (seriesItem.type === "scatter" && isGeoScatter) {
      return {
        type: "scatter" as const,
        name: seriesItem.name ?? seriesItem.dataKey,
        coordinateSystem: "cartesian2d",
        data: data.map((dataRow) => ({
          value: [
            toFiniteNumber(dataRow[categoryKey]),
            toFiniteNumber(dataRow[seriesItem.dataKey]),
          ],
          name: toChartLabel(dataRow.flight),
          itemStyle: {
            color: seriesColor,
          },
        })),
        symbolSize: 12,
        itemStyle: {
          color: seriesColor,
        },
        emphasis: {
          scale: 1.5,
        },
      };
    }

    // Regular scatter chart
    if (seriesItem.type === "scatter") {
      return {
        type: "scatter" as const,
        name: seriesItem.name ?? seriesItem.dataKey,
        data: data.map((dataRow) => [
          toFiniteNumber(dataRow[categoryKey]),
          toFiniteNumber(dataRow[seriesItem.dataKey]),
        ]),
        symbolSize: 10,
        itemStyle: {
          color: seriesColor,
        },
      };
    }

    // Bar, line series format
    return {
      type: seriesItem.type,
      name: seriesItem.name ?? seriesItem.dataKey,
      data: data.map((dataRow) => toFiniteNumber(dataRow[seriesItem.dataKey])),
      itemStyle: {
        color: seriesColor,
      },
      ...(seriesItem.type === "line" && {
        lineStyle: { color: seriesColor },
        smooth: seriesItem.smooth ?? false,
        ...(seriesItem.areaStyle && { areaStyle: seriesItem.areaStyle }),
      }),
      ...(seriesItem.stack && { stack: seriesItem.stack }),
    };
  });

  const needsCartesianAxes = !isPieChart && !isMap;

  /**
   * Rotated tick labels extend below the axis line, so the axis caption's
   * offset (`nameGap`) must clear them or the two overlap. Estimate the
   * labels' vertical extent and position the caption just beyond it.
   */
  const rotateXAxisLabels = categories.length > 6;

  const longestCategoryLabelWidth = Math.min(
    categories.reduce(
      (max, category) => Math.max(max, estimateTextWidth(category)),
      0,
    ),
    MAX_ROTATED_LABEL_WIDTH,
  );

  // 8px default margin between axis line and labels, then either the
  // projection of the rotated label (45°) or a single line of text.
  const xAxisLabelExtent =
    8 +
    (rotateXAxisLabels
      ? Math.ceil(
          (longestCategoryLabelWidth + AXIS_LABEL_FONT_SIZE) * Math.SQRT1_2,
        )
      : AXIS_LABEL_FONT_SIZE + 4);

  const xAxisNameGap = xAxisLabelExtent + 14;

  // The y-axis caption needs the same treatment: clear the widest tick label.
  const numericSeriesValues = needsCartesianAxes
    ? seriesConfig.flatMap((seriesItem) =>
        data
          .map((dataRow) => dataRow[seriesItem.dataKey])
          .filter(
            (value): value is number =>
              typeof value === "number" && Number.isFinite(value),
          ),
      )
    : [];

  const maxAbsSeriesValue = numericSeriesValues.length
    ? Math.max(...numericSeriesValues.map(Math.abs))
    : 0;

  const yAxisNameGap =
    8 +
    estimateTextWidth(compactNumberFormatter.format(maxAbsSeriesValue)) +
    12;

  const option: ECOption = {
    tooltip: showTooltip
      ? {
          trigger: isPieChart || isHeatmap ? "item" : "axis",
          ...(isGeoScatter && {
            trigger: "item",
            formatter: (params: unknown) => {
              const tooltipParams = params as {
                name?: unknown;
                value?: unknown;
              };

              if (Array.isArray(tooltipParams.value)) {
                const longitude = toFiniteNumber(tooltipParams.value[0]);
                const latitude = toFiniteNumber(tooltipParams.value[1]);

                if (longitude !== null && latitude !== null) {
                  const name = toChartLabel(tooltipParams.name) || "Flight";

                  return `${name}<br/>Lng: ${longitude.toFixed(
                    4,
                  )}<br/>Lat: ${latitude.toFixed(4)}`;
                }
              }

              return "";
            },
          }),
          ...(needsCartesianAxes &&
            !isGeoScatter &&
            tooltipLabelKey && {
              formatter: (params: unknown) => {
                const tooltipParams = params as
                  | { dataIndex?: number }
                  | { dataIndex?: number }[];
                const tooltipItems = Array.isArray(tooltipParams)
                  ? tooltipParams
                  : [tooltipParams];
                if (tooltipItems.length === 0) {
                  return "";
                }
                const dataIndex = tooltipItems[0]?.dataIndex;
                if (
                  dataIndex == null ||
                  dataIndex < 0 ||
                  dataIndex >= data.length
                ) {
                  return "";
                }
                const dataRow = data[dataIndex];
                const label = toChartLabel(
                  dataRow?.[tooltipLabelKey] ?? dataRow?.[categoryKey],
                );
                const lines = [label];
                for (const tooltipItem of tooltipItems) {
                  const tooltipSeriesItem = tooltipItem as {
                    seriesName?: string;
                    value?: unknown;
                  };
                  if (
                    tooltipSeriesItem.seriesName != null &&
                    tooltipSeriesItem.value != null
                  ) {
                    lines.push(
                      `${tooltipSeriesItem.seriesName}: ${toChartLabel(
                        tooltipSeriesItem.value,
                      )}`,
                    );
                  }
                }
                return lines.join("<br/>");
              },
            }),
        }
      : { show: false },
    legend: showLegend
      ? {
          show: true,
          bottom: 0,
        }
      : { show: false },
    grid: needsCartesianAxes
      ? {
          // With containLabel the tick labels sit inside the grid box, so
          // the margins only need to fit the axis captions (and legend).
          left: yAxisLabel ? 40 : 12,
          right: 20,
          bottom: (showLegend ? 30 : 0) + (xAxisLabel ? 32 : 8),
          top: 20,
          containLabel: true,
        }
      : undefined,
    ...(needsCartesianAxes &&
      !isGeoScatter && {
        xAxis: {
          type: "category" as const,
          data: categories,
          name: xAxisLabel,
          nameLocation: "middle" as const,
          nameGap: xAxisNameGap,
          axisLabel: {
            rotate: rotateXAxisLabels ? 45 : 0,
            fontSize: AXIS_LABEL_FONT_SIZE,
            hideOverlap: true,
            ...(rotateXAxisLabels && {
              width: MAX_ROTATED_LABEL_WIDTH,
              overflow: "truncate" as const,
            }),
          },
          splitLine: {
            show: false,
          },
        },
        yAxis: {
          type: "value" as const,
          name: yAxisLabel,
          nameLocation: "middle" as const,
          nameGap: yAxisNameGap,
          axisLabel: {
            fontSize: AXIS_LABEL_FONT_SIZE,
            hideOverlap: true,
            formatter: (value: number) => compactNumberFormatter.format(value),
          },
          splitLine: {
            show: showGrid,
          },
        },
      }),
    ...(isGeoScatter && {
      xAxis: {
        type: "value" as const,
        name: xAxisLabel,
        nameLocation: "middle" as const,
        nameGap: 25,
        min: -180,
        max: 180,
        axisLabel: {
          fontSize: 10,
        },
        splitLine: {
          show: showGrid,
          lineStyle: {
            type: "dashed" as const,
            color: "#e0e0e0",
          },
        },
      },
      yAxis: {
        type: "value" as const,
        name: yAxisLabel,
        nameLocation: "middle" as const,
        nameGap: 35,
        min: -90,
        max: 90,
        axisLabel: {
          fontSize: 10,
        },
        splitLine: {
          show: showGrid,
          lineStyle: {
            type: "dashed" as const,
            color: "#e0e0e0",
          },
        },
      },
    }),
    ...(isHeatmap && {
      visualMap: {
        min: 0,
        max: Math.max(
          0,
          ...data.flatMap((dataRow) =>
            seriesConfig
              .map((seriesItem) => toFiniteNumber(dataRow[seriesItem.dataKey]))
              .filter((value): value is number => value !== null),
          ),
        ),
        calculable: true,
        orient: "horizontal" as const,
        left: "center",
        bottom: "0%",
      },
    }),
    ...(isMap && {
      geo: {
        map: "world",
        roam: true,
      },
    }),
    // Cast series to satisfy ECOption type
    series: echartsSeries as ECOption["series"],
  };

  return option;
};

export const ChartRenderer = ({
  chartType,
  chartData,
  chartConfig,
  onEntityClick,
}: ChartRendererProps) => {
  const echartsOption = useMemo(() => {
    if (!chartData.length || !chartConfig.series.length) {
      return null;
    }
    return buildEChartsOption(chartType, chartData, chartConfig);
  }, [chartType, chartData, chartConfig]);

  // Handle chart clicks for bar/line charts where data points have entityId
  const handleChartInit = useCallback(
    (chart: Chart) => {
      if (!onEntityClick) {
        return;
      }

      chart.on("click", (params) => {
        // Get the data index from the clicked element
        const { dataIndex } = params as { dataIndex?: number };
        if (dataIndex !== undefined && dataIndex >= 0) {
          // Access the original data to get entity ID
          const dataItem = chartData[dataIndex];
          if (
            isChartDataRow(dataItem) &&
            typeof dataItem.entityId === "string" &&
            isEntityId(dataItem.entityId)
          ) {
            onEntityClick(dataItem.entityId);
          }
        }
      });
    },
    [chartData, onEntityClick],
  );

  if (!echartsOption) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <Typography color="text.secondary">
          No data available for chart
        </Typography>
      </Box>
    );
  }

  return (
    <EChart options={echartsOption} onChartInitialized={handleChartInit} />
  );
};
