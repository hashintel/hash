/**
 * Shared types for the Dashboard feature.
 * Used by frontend, API, and AI worker.
 */

import type { EntityId, VersionedUrl, WebId } from "@blockprotocol/type-system";
import type {
  EntityTraversalEdge,
  EntityTraversalPath,
  Filter,
} from "@local/hash-graph-client";

/**
 * UI-only metadata for one hop of a traversal path built via the
 * relationship picker: which named relationship was followed, and the entity
 * type at the far end (used to offer further relationships when chaining).
 */
export type TraversalHopMeta = {
  direction: "outgoing" | "incoming";
  linkTypeBaseUrl?: string;
  /** Base URL of the entity type reached by this hop, if constrained */
  entityTypeBaseUrl?: string;
};

/**
 * A traversal path with optional UI-only metadata: a human-readable label
 * describing the named relationship(s) it was built from (e.g. "Associated
 * with → Account") and per-hop details used by the relationship picker.
 * Both are stripped before the path is sent to the graph API and before
 * config hashing, so editing them never invalidates cached chart data.
 */
export type LabelledTraversalPath = EntityTraversalPath & {
  label?: string;
  hops?: TraversalHopMeta[];
};

/**
 * A dashboard item's data query: a structural query filter selecting the
 * root entities, plus optional traversal paths that pull connected entities
 * into the result subgraph so the analysis script can join across them.
 *
 * One "hop" from a root to the entities it links to is two edges:
 * `has-left-entity` incoming (root → link entities) then `has-right-entity`
 * outgoing (link entity → target). The reverse hop (entities linking to the
 * root) is `has-right-entity` incoming then `has-left-entity` outgoing.
 * See {@link outgoingHopEdges} / {@link incomingHopEdges}.
 */
export type StructuralQueryDefinition = {
  filter: Filter;
  traversalPaths?: LabelledTraversalPath[];
};

/**
 * The edge pair encoding one traversal hop from matched entities to the
 * entities they link to (links are themselves entities sitting between
 * source and target, hence two edges per hop).
 */
export const outgoingHopEdges: EntityTraversalEdge[] = [
  { kind: "has-left-entity", direction: "incoming" },
  { kind: "has-right-entity", direction: "outgoing" },
];

/**
 * The edge pair encoding one traversal hop from matched entities to the
 * entities that link to them.
 */
export const incomingHopEdges: EntityTraversalEdge[] = [
  { kind: "has-right-entity", direction: "incoming" },
  { kind: "has-left-entity", direction: "outgoing" },
];

/**
 * Normalize a stored structural query property value to a
 * {@link StructuralQueryDefinition}.
 *
 * Historically the property stored a bare `Filter`; newer items store the
 * definition object. The two are distinguished by the presence of a `filter`
 * key, which is not a valid `Filter` operator so cannot clash.
 */
export const normalizeStructuralQuery = (
  value: unknown,
): StructuralQueryDefinition | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if ("filter" in value) {
    const definition = value as StructuralQueryDefinition;
    return {
      filter: definition.filter,
      traversalPaths: definition.traversalPaths ?? [],
    };
  }

  return { filter: value as Filter, traversalPaths: [] };
};

/**
 * Strip UI-only labels from traversal paths, producing the shape accepted by
 * the graph API (and used for config hashing).
 */
export const toApiTraversalPaths = (
  traversalPaths: LabelledTraversalPath[] | undefined,
): EntityTraversalPath[] =>
  (traversalPaths ?? []).map(({ edges }) => ({ edges }));

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

export const chartTypes = [
  "bar",
  "line",
  "pie",
  "scatter",
  "heatmap",
  "map",
] as const;

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

  /** Generated data query (filter + optional traversal paths) */
  structuralQuery: StructuralQueryDefinition | null;

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
  structuralQuery: StructuralQueryDefinition;
  explanation: string;
  sampleData?: unknown[];
  suggestedChartTypes?: ChartType[];
};

/**
 * Input for the analyze-dashboard-data activity
 */
export type AnalyzeDashboardDataInput = {
  structuralQuery: StructuralQueryDefinition;
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
