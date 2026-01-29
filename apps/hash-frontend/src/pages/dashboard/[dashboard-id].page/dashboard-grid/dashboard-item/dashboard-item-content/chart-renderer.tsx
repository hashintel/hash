import type { ECOption } from "@hashintel/design-system";
import { EChart } from "@hashintel/design-system";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { Box, Typography } from "@mui/material";
import { useMemo } from "react";

const DEFAULT_COLORS = [
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
  "#0088fe",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
];

type ChartRendererProps = {
  chartType: ChartType;
  chartData: unknown[];
  chartConfig: ChartConfig;
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

    // Bar, line, scatter series format
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
            left: "3%",
            right: "4%",
            bottom: showLegend ? "15%" : "3%",
            containLabel: true,
          }
        : undefined,
    ...(needsCartesianAxes && {
      xAxis: {
        type: "category" as const,
        data: categories,
        name: xAxisLabel,
        nameLocation: "middle" as const,
        nameGap: 30,
      },
      yAxis: {
        type: "value" as const,
        name: yAxisLabel,
        nameLocation: "middle" as const,
        nameGap: 40,
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
    series: echartsSeries,
  };

  return option;
};

export const ChartRenderer = ({
  chartType,
  chartData,
  chartConfig,
}: ChartRendererProps) => {
  const echartsOption = useMemo(() => {
    if (!chartData.length || !chartConfig.series?.length) {
      return null;
    }
    return buildEChartsOption(chartType, chartData, chartConfig);
  }, [chartType, chartData, chartConfig]);

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

  return <EChart options={echartsOption} />;
};
