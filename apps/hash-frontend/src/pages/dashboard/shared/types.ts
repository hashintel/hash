import type { EntityId } from "@blockprotocol/type-system";
import type {
  ChartConfig,
  ChartType,
  DashboardGridLayout,
  GridPosition,
} from "@local/hash-isomorphic-utils/dashboard-types";

/**
 * Parameter definition for data scripts (e.g. date range).
 * Scripts receive current values as `params` in scope.
 */
export type DataScriptParameterOption = {
  value: string;
  label: string;
};

export type DataScriptParameters = {
  dateRange?: {
    default: string;
    options: DataScriptParameterOption[];
  };
};

/**
 * Data script: JS function body with `data` (vertices) and `params` in scope.
 * Optional parameters define valid values (e.g. date range dropdown).
 */
export type DataScript = {
  script: string;
  parameters?: DataScriptParameters;
};

export type DashboardItemData = {
  entityId: EntityId;
  linkEntityId: EntityId;
  title: string;
  userGoal: string;
  chartType: ChartType | null;
  chartData: unknown[] | null;
  chartConfig: ChartConfig | null;
  gridPosition: GridPosition;
  configurationStatus: "pending" | "configuring" | "ready" | "error";
  errorMessage?: string;
  /** API vertices (same shape as input to processVerticesIntoFlights). Used when dataScript is set. */
  rawData?: unknown;
  /** Transform script and optional parameter definitions. When set, chartData is computed at render time. */
  dataScript?: DataScript;
  /** Current parameter values (e.g. { dateRange: '7d' }). Drives script re-run when changed. */
  scriptParams?: Record<string, string>;
};

export type DashboardData = {
  entityId: EntityId;
  title: string;
  description?: string;
  gridLayout: DashboardGridLayout | null;
  items: DashboardItemData[];
};
