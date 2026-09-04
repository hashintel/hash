import type { OptimizationRecord } from "../../../../../../react/optimizations/context";

/**
 * The status as the drawer and the list name it. A connected study is
 * stopped rather than cancelled: its sampler stays, and it can be continued.
 */
export const describeOptimizationStatus = (
  optimization: Pick<OptimizationRecord, "status" | "navigation">,
): string => {
  switch (optimization.status) {
    case "initializing":
      return "Initializing";
    case "running":
      return "Running";
    case "complete":
      return "Complete";
    case "error":
      return "Error";
    case "cancelled":
      return optimization.navigation === null ? "Cancelled" : "Stopped";
  }
};
