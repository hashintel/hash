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

export type ConvergenceVerdict =
  | { kind: "too-early"; completedSteps: number; window: number }
  | { kind: "improving"; lastImprovementStep: number }
  | { kind: "converging"; stagnantSteps: number };

/** The completed steps a verdict looks back over: a tenth of the study, five at least. */
export const convergenceWindow = (requestedTrials: number): number =>
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
    return { kind: "too-early", completedSteps: completed.length, window };
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
  return stagnantSteps < window
    ? {
        kind: "improving",
        lastImprovementStep: completed[lastImprovement]!.trial + 1,
      }
    : { kind: "converging", stagnantSteps };
};

/** The chip's words for a verdict. */
export const describeConvergence = (verdict: ConvergenceVerdict): string => {
  switch (verdict.kind) {
    case "too-early":
      return "Too early to say";
    case "improving":
      return "Still improving";
    case "converging":
      return "Converging";
  }
};
