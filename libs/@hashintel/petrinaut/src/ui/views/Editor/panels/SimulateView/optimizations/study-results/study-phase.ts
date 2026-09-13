import {
  isOptimizationActive,
  type OptimizationRecord,
} from "../../../../../../../react/optimizations/context";

/**
 * Live while steps still evaluate; settled once the record is complete,
 * cancelled or errored. A settled study shows its results, never a live
 * picture that will not update again.
 */
export type StudyPhase = "live" | "settled";

export const studyPhase = (
  optimization: Pick<OptimizationRecord, "status">,
): StudyPhase => (isOptimizationActive(optimization) ? "live" : "settled");
