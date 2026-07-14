import type { SiteNode } from "../../../shared/types";

export const LOW_SAMPLE_N = 10;

export type Tab = "dwell" | "planning" | "trends" | "suppliers";

export type SortKey =
  | "median"
  | "cost"
  | "material"
  | "deviation"
  | "exceeding"
  | "trend"
  | "costTrend"
  | "planned"
  | "previous"
  | "sample"
  | "status"
  | "impact"
  | "opportunity"
  | "vendor"
  | "lines"
  | "onTime"
  | "otif"
  | "meanLate"
  | "meanLateWhenLate"
  | "maxLate";

export type SortDir = "asc" | "desc";

export type SupplierMode = "worst" | "best";

export type DwellRow = SiteNode & {
  periodCost: number;
  costTrendPct: number | null;
  previousPeriodCost: number | null;
  previousCostN: number;
  /** Timing (measure) trend, shown stacked under the measure-value cell. */
  trendPct: number | null;
  previousValue: number | null;
  previousTrendN: number;
};

export type PlanningRow = SiteNode & {
  deviationPct: number;
  trendPct: number | null;
  previousValue: number | null;
  previousTrendN: number;
};

export type TrendRow = SiteNode & {
  trendPct: number | null;
  previousValue: number | null;
  previousTrendN: number;
};
