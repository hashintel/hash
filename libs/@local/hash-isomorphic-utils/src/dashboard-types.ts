/**
 * Shared types for the Dashboard feature.
 * Used by frontend, API, and AI worker.
 */

import type { EntityId, VersionedUrl, WebId } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";

/**
 * React Grid Layout position for a dashboard item
 */
export type GridPosition = {
  i: string; // Unique identifier (usually entityId)
  x: number; // X position in grid units
  y: number; // Y position in grid units
  w: number; // Width in grid units
  h: number; // Height in grid units
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  static?: boolean;
};

/**
 * React Grid Layout configuration for responsive breakpoints
 */
export type DashboardGridLayout = {
  layouts: {
    lg?: GridPosition[];
    md?: GridPosition[];
    sm?: GridPosition[];
    xs?: GridPosition[];
  };
  breakpoints?: {
    lg: number;
    md: number;
    sm: number;
    xs: number;
  };
  cols?: {
    lg: number;
    md: number;
    sm: number;
    xs: number;
  };
};

export const chartTypes = ["bar", "line", "pie", "scatter", "heatmap", "map"];

/**
 * Supported chart types (aligned with Apache ECharts)
 */
export type ChartType = (typeof chartTypes)[number];

/**
 * ECharts series configuration for different chart types
 */
export type EChartsSeriesConfig = {
  type: ChartType;
  name?: string;
  dataKey: string;
  color?: string;
  stack?: string; // For stacked bar/line charts
  areaStyle?: Record<string, unknown>; // For area-style line charts
  smooth?: boolean; // For smooth line charts
  /** For pie charts: radius as percentage or [innerRadius, outerRadius] */
  radius?: string | [string, string];
  /** For pie charts: center position */
  center?: [string, string];
};

/**
 * Chart configuration (Apache ECharts-compatible)
 *
 * This configuration is transformed into ECharts option format.
 * See: https://echarts.apache.org/en/option.html
 */
export type ChartConfig = {
  /** The data key for category axis (x-axis for bar/line, name for pie) */
  categoryKey: string;

  /** Series configuration - each series represents a data series in the chart */
  series: EChartsSeriesConfig[];

  /** X-axis label */
  xAxisLabel?: string;

  /** Y-axis label */
  yAxisLabel?: string;

  /** Whether to show the legend */
  showLegend?: boolean;

  /** Whether to show grid lines */
  showGrid?: boolean;

  /** Whether to show tooltips on hover */
  showTooltip?: boolean;

  /**
   * Optional data key for tooltip category label (e.g. full name).
   * When set, tooltip shows this instead of categoryKey for the axis value.
   */
  tooltipLabelKey?: string;

  /** Color palette for series (hex colors) */
  colors?: string[];
};

/**
 * Configuration stored on a DashboardItem entity
 */
export type DashboardItemConfig = {
  /** The user's natural language goal for this chart */
  userGoal: string;

  /** Generated Graph API filter query */
  structuralQuery: Filter | null;

  /** Python script for data transformation */
  pythonScript: string | null;

  /** Transformed data ready for charting */
  chartData: unknown[] | null;

  /** Type of chart to render */
  chartType: ChartType;

  /** ECharts configuration */
  chartConfig: ChartConfig;

  /** Grid position within the dashboard */
  gridPosition: GridPosition;

  /** Status of LLM configuration */
  configurationStatus: "pending" | "configuring" | "ready" | "error";

  /** Error message if configuration failed */
  errorMessage?: string;
};

/**
 * Input for the generate-dashboard-query activity
 */
export type GenerateDashboardQueryInput = {
  userGoal: string;
  webId: WebId;
  availableEntityTypes?: VersionedUrl[];
};

/**
 * Output from the generate-dashboard-query activity
 */
export type GenerateDashboardQueryOutput = {
  structuralQuery: Filter;
  explanation: string;
  sampleData?: unknown[];
  suggestedChartTypes?: ChartType[];
};

/**
 * Input for the analyze-dashboard-data activity
 */
export type AnalyzeDashboardDataInput = {
  structuralQuery: Filter;
  userGoal: string;
  targetChartType?: ChartType;
  webId: WebId;
};

/**
 * Output from the analyze-dashboard-data activity
 */
export type AnalyzeDashboardDataOutput = {
  pythonScript: string;
  chartData: unknown[];
  suggestedChartType: ChartType;
  explanation: string;
};

/**
 * Input for the generate-chart-config activity
 */
export type GenerateChartConfigInput = {
  chartData: unknown[];
  chartType: ChartType;
  userGoal: string;
};

/**
 * Output from the generate-chart-config activity
 */
export type GenerateChartConfigOutput = {
  chartConfig: ChartConfig;
  explanation: string;
};

/**
 * Properties for creating a new Dashboard entity
 */
export type CreateDashboardInput = {
  name: string;
  description?: string;
  webId: WebId;
};

/**
 * Properties for creating a new DashboardItem entity
 */
export type CreateDashboardItemInput = {
  name: string;
  userGoal: string;
  gridPosition: GridPosition;
  dashboardEntityId: EntityId;
  webId: WebId;
};
