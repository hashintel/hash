import type { BoundedTimeInterval } from "@local/hash-graph-types/temporal-versioning";

export type AggregatedUsageRecord = {
  serviceName: string;
  featureName: string;
  totalInputUnitCount: number;
  totalOutputUnitCount: number;
  totalCostInUsd: number;
  last24hoursTotalCostInUsd: number;
  limitedToPeriod: BoundedTimeInterval | null;
};
