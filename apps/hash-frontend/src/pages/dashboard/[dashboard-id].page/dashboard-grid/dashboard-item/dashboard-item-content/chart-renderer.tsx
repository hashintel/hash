import type { EntityId } from "@blockprotocol/type-system";
import type { Chart, ECOption } from "@hashintel/design-system";
import { EChart } from "@hashintel/design-system";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { Box, Typography } from "@mui/material";
import { useCallback, useMemo } from "react";

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
    showLegend = true,
    showGrid = true,
    showTooltip = true,
    colors = DEFAULT_COLORS,
  } = chartConfig;

  const data = chartData as Record<string, unknown>[];

  // Extract category values for x-axis
  const categories = data.map((item) => String(item[categoryKey] ?? ""));

  // Check chart type categories
  const isPieChart =
    chartType === "pie" || seriesConfig.some((s) => s.type === "pie");
  const isHeatmap =
    chartType === "heatmap" || seriesConfig.some((s) => s.type === "heatmap");
  const isMap =
    chartType === "map" || seriesConfig.some((s) => s.type === "map");
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
        data: data.map((item, dataIndex) => ({
          name: String(item[categoryKey] ?? ""),
          value: item[seriesItem.dataKey] as number,
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
        data: data.map((item) => [
          item[categoryKey],
          item.y ?? item.yKey,
          item[seriesItem.dataKey],
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
        data: data.map((item) => ({
          name: String(item[categoryKey] ?? ""),
          value: item[seriesItem.dataKey] as number,
        })),
      };
    }

    // Scatter chart with geo coordinates
    if (seriesItem.type === "scatter" && isGeoScatter) {
      return {
        type: "scatter" as const,
        name: seriesItem.name ?? seriesItem.dataKey,
        coordinateSystem: "cartesian2d",
        data: data.map((item) => ({
          value: [
            item[categoryKey] as number,
            item[seriesItem.dataKey] as number,
          ],
          name: String(item.flight ?? ""),
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
        data: data.map((item) => [
          item[categoryKey] as number,
          item[seriesItem.dataKey] as number,
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
      data: data.map((item) => item[seriesItem.dataKey] as number),
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

  const option: ECOption = {
    tooltip: showTooltip
      ? {
          trigger: isPieChart || isHeatmap ? "item" : "axis",
          ...(isGeoScatter && {
            trigger: "item",
            formatter: (params: unknown) => {
              const p = params as { name?: string; value?: [number, number] };
              if (p.value) {
                return `${p.name ?? "Flight"}<br/>Lng: ${p.value[0]?.toFixed(4)}<br/>Lat: ${p.value[1]?.toFixed(4)}`;
              }
              return "";
            },
          }),
        }
      : undefined,
    legend: showLegend
      ? {
          show: true,
          bottom: 0,
        }
      : undefined,
    grid:
      showGrid && needsCartesianAxes
        ? {
            left: 60,
            right: 20,
            bottom: showLegend ? 50 : 40,
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
          nameGap: 25,
          axisLabel: {
            rotate: categories.length > 6 ? 45 : 0,
            fontSize: 10,
          },
        },
        yAxis: {
          type: "value" as const,
          name: yAxisLabel,
          nameLocation: "middle" as const,
          nameGap: 35,
          axisLabel: {
            fontSize: 10,
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
          ...data.map((item) =>
            Math.max(
              ...seriesConfig.map((s) => (item[s.dataKey] as number) ?? 0),
            ),
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
    if (!chartData.length || !chartConfig.series?.length) {
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
          const dataItem = chartData[dataIndex] as
            | { entityId?: EntityId }
            | undefined;
          if (dataItem?.entityId) {
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
