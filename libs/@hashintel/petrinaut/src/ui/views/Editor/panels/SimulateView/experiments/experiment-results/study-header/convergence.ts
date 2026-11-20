/**
 * Whether a live study is still finding better steps: best-so-far
 * stagnation over the last `window` completed steps. Optuna's
 * `BestValueStagnationEvaluator` computes the same signal in the vendored
 * runtime; this is the TypeScript stand-in until the Python side reports it.
 */
import type {
  PetrinautOptimizationDirection,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";

export type ConvergenceVerdict = "too-early" | "improving" | "converging";

/** The completed steps a verdict looks back over: a tenth of the study, five at least. */
const convergenceWindow = (requestedTrials: number): number =>
  Math.max(5, Math.floor(requestedTrials / 10));

export const assessConvergence = (
  trials: readonly PetrinautOptimizationTrialEvent[],
  direction: PetrinautOptimizationDirection,
  requestedTrials: number,
): ConvergenceVerdict => {
  const window = convergenceWindow(requestedTrials);
  const completed = trials
    .filter((trial) => trial.state === "complete" && trial.objective !== null)
    .toSorted((left, right) => left.trial - right.trial);
  if (completed.length < window) {
    return "too-early";
  }

  let best: number | null = null;
  let lastImprovement = 0;
  for (const [index, trial] of completed.entries()) {
    const objective = trial.objective!;
    const improves =
      best === null ||
      (direction === "maximize" ? objective > best : objective < best);
    if (improves) {
      best = objective;
      lastImprovement = index;
    }
  }
  const stagnantSteps = completed.length - 1 - lastImprovement;
  return stagnantSteps < window ? "improving" : "converging";
};
