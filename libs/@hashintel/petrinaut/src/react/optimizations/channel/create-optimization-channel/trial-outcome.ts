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

type TrialReplicate = { seed: number; objective: number };

/**
 * The per-seed objectives, read off the per-run finals the CPU backend
 * reports. Run `i` ran `seeds[i]`, which is how the request pinned them.
 * Undefined when the backend reports no run axis, or a run's value is
 * missing or not finite.
 */
const trialReplicates = (
  result: DetachedObjectiveRunResult,
  metricId: string,
  seeds: readonly number[],
): TrialReplicate[] | undefined => {
  if (result.runResults.size === 0) {
    return undefined;
  }
  const replicates: TrialReplicate[] = [];
  const byRunIndex = [...result.runResults].sort(
    ([left], [right]) => left - right,
  );
  for (const [runIndex, values] of byRunIndex) {
    const seed = seeds[runIndex];
    const objective = getOwn(values, metricId);
    if (
      seed === undefined ||
      objective === undefined ||
      !Number.isFinite(objective)
    ) {
      return undefined;
    }
    replicates.push({ seed, objective });
  }
  return replicates;
};

/**
 * A settled trial batch as Optuna receives it. A batch that did not complete
 * prunes the trial with the batch's own reason. The objective is the mean of
 * the per-seed objectives, as the optimizer service reports it; where the
 * backend reports no run axis it is the metric's last sampled frame, which
 * a distribution frame reduces to the mean of its bins.
 */
export const trialOutcome = (
  outcome: DetachedObjectiveRunOutcome,
  metricId: string,
  seeds: readonly number[],
): PetrinautOptimizationTrialOutcome => {
  if (!outcome.ok) {
    return prunedTrialOutcome(outcome.reason);
  }
  const replicates = trialReplicates(outcome, metricId, seeds);
  const objective = replicates
    ? replicates.reduce((sum, replicate) => sum + replicate.objective, 0) /
      replicates.length
    : sweepCellObjective(outcome.metricFrames, metricId);
  if (objective === null || !Number.isFinite(objective)) {
    return prunedTrialOutcome(
      `The objective metric "${metricId}" did not produce a finite value`,
    );
  }
  return {
    kind: "objective",
    objective,
    ...(replicates === undefined ? {} : { replicates }),
  };
};
