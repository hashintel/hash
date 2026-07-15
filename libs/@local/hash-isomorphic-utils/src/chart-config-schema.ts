/**
 * Auto-generated JSON schema for ChartConfig.
 * Do not edit manually - regenerate with: yarn generate:chart-config-schema
 */
export const chartConfigSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $ref: "#/definitions/ChartConfig",
  definitions: {
    ChartConfig: {
      type: "object",
      properties: {
        categoryKey: {
          type: "string",
          description:
            "The data key for category axis (x-axis for bar/line, name for pie)",
        },
        series: {
          type: "array",
          items: {
            $ref: "#/definitions/EChartsSeriesConfig",
          },
          description:
            "Series configuration - each series represents a data series in the chart",
        },
        xAxisLabel: {
          type: "string",
          description: "X-axis label",
        },
        yAxisLabel: {
          type: "string",
          description: "Y-axis label",
        },
        showLegend: {
          type: "boolean",
          description: "Whether to show the legend",
        },
        showGrid: {
          type: "boolean",
          description: "Whether to show grid lines",
        },
        showTooltip: {
          type: "boolean",
          description: "Whether to show tooltips on hover",
        },
        tooltipLabelKey: {
          type: "string",
          description:
            "Optional data key for tooltip category label (e.g. full name). When set, tooltip shows this instead of categoryKey for the axis value.",
        },
        colors: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Color palette for series (hex colors)",
        },
      },
      required: ["categoryKey", "series"],
      additionalProperties: false,
      description:
        "Chart configuration (Apache ECharts-compatible)\n\nThis configuration is transformed into ECharts option format. See: https://echarts.apache.org/en/option.html",
    },
    EChartsSeriesConfig: {
      type: "object",
      properties: {
        type: {
          $ref: "#/definitions/ChartType",
        },
        name: {
          type: "string",
        },
        dataKey: {
          type: "string",
        },
        color: {
          type: "string",
        },
        stack: {
          type: "string",
        },
        areaStyle: {
          type: "object",
          additionalProperties: {},
        },
        smooth: {
          type: "boolean",
        },
        radius: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "array",
              items: {
                type: "string",
              },
              minItems: 2,
              maxItems: 2,
            },
          ],
          description:
            "For pie charts: radius as percentage or [innerRadius, outerRadius]",
        },
        center: {
          type: "array",
          items: {
            type: "string",
          },
          minItems: 2,
          maxItems: 2,
          description: "For pie charts: center position",
        },
      },
      required: ["type", "dataKey"],
      additionalProperties: false,
      description: "ECharts series configuration for different chart types",
    },
    ChartType: {
      type: "string",
      enum: ["bar", "line", "pie", "scatter", "heatmap", "map"],
      description: "Supported chart types (aligned with Apache ECharts)",
    },
  },
} as const;
