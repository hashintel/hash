import type { EntityId } from "@blockprotocol/type-system";
import type {
  ChartConfig,
  ChartType,
  DashboardGridLayout,
  GridPosition,
  StructuralQueryDefinition,
} from "@local/hash-isomorphic-utils/dashboard-types";

export type DashboardItemData = {
  entityId: EntityId;
  linkEntityId: EntityId;
  title: string;
  userGoal: string;
  structuralQuery: StructuralQueryDefinition | null;
  pythonScript: string | null;
  chartType: ChartType | null;
  chartConfig: ChartConfig | null;
  gridPosition: GridPosition;
  configurationStatus: "pending" | "configuring" | "ready" | "error";
  errorMessage?: string;
};

export type DashboardData = {
  entityId: EntityId;
  title: string;
  description?: string;
  gridLayout: DashboardGridLayout | null;
  items: DashboardItemData[];
};
