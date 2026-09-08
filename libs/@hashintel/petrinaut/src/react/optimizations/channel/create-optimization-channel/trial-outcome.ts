import { getOwn } from "@hashintel/petrinaut-core";

import { sweepCellObjective } from "../../../experiments/sweep-cell-objective";

import type {
  DetachedObjectiveRunOutcome,
  DetachedObjectiveRunResult,
} from "../../../experiments/context";
import type { PetrinautOptimizationTrialOutcome } from "@hashintel/petrinaut-core/optimization";

export const prunedTrialOutcome = (
  reason: string,
): PetrinautOptimizationTrialOutcome => ({ kind: "pruned", reason });

/**
 * The mean of the per-run finals the CPU backend reports. Null when the
 * backend reports no run axis, or a run's value is missing or not finite.
 */
const runResultsMean = (
  result: DetachedObjectiveRunResult,
  metricId: string,
): number | null => {
  if (result.runResults.size === 0) {
    return null;
  }
  let sum = 0;
  for (const values of result.runResults.values()) {
    const objective = getOwn(values, metricId);
    if (objective === undefined || !Number.isFinite(objective)) {
      return null;
    }
    sum += objective;
  }
  return sum / result.runResults.size;
};

/**
 * A settled trial batch as Optuna receives it. A batch that did not complete
 * prunes the trial with the batch's own reason. The objective is the mean of
 * the per-run objectives, as the optimizer service reports it; where the
 * backend reports no run axis it is the metric's last sampled frame, which
 * a distribution frame reduces to the mean of its bins.
 */
export const trialOutcome = (
  outcome: DetachedObjectiveRunOutcome,
  metricId: string,
): PetrinautOptimizationTrialOutcome => {
  if (!outcome.ok) {
    return prunedTrialOutcome(outcome.reason);
  }
  const objective =
    runResultsMean(outcome, metricId) ??
    sweepCellObjective(outcome.metricFrames, metricId);
  if (objective === null || !Number.isFinite(objective)) {
    return prunedTrialOutcome(
      `The objective metric "${metricId}" did not produce a finite value`,
    );
  }
  return { kind: "objective", objective };
};
