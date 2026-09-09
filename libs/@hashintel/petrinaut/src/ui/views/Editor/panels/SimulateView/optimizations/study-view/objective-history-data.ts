/**
 * The objective history chart's data: one point per step in step order, the
 * step's own objective and the best so far over the steps that completed,
 * the way Optuna's `plot_optimization_history` draws a study.
 */
import type {
  PetrinautOptimizationInput,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";
import type uPlot from "uplot";

export type ObjectiveDirection =
  PetrinautOptimizationInput["objective"]["direction"];

/**
 * Whether the step's parameters satisfied the study's constraints. `unknown`
 * until a trial event carries constraint results; the chart then draws an
 * infeasible step in its muted colour.
 */
export type ObjectiveFeasibility = "feasible" | "infeasible" | "unknown";

export type ObjectiveHistoryPoint = {
  /** The step number as the table shows it: the trial index plus one. */
  step: number;
  /** Null for a pruned or failed step. */
  objective: number | null;
  /** The best objective over the completed steps up to and including this one. */
  bestSoFar: number | null;
  feasibility: ObjectiveFeasibility;
};

const isBetter = (
  direction: ObjectiveDirection,
  candidate: number,
  best: number,
): boolean => (direction === "maximize" ? candidate > best : candidate < best);

/**
 * `feasibilityOf` reads a trial's constraint verdict; until trial events
 * carry one, every step is of unknown feasibility. An infeasible step never
 * becomes the best so far, the way Optuna's history substitutes infinity
 * for it before accumulating, so the word "best" never sits on a
 * configuration that broke a constraint.
 */
export const buildObjectiveHistory = (
  trials: readonly PetrinautOptimizationTrialEvent[],
  direction: ObjectiveDirection,
  feasibilityOf: (
    trial: PetrinautOptimizationTrialEvent,
  ) => ObjectiveFeasibility = () => "unknown",
): ObjectiveHistoryPoint[] => {
  // Parallel steps report out of order; the history reads in step order.
  const ordered = trials.toSorted((left, right) => left.trial - right.trial);
  let best: number | null = null;
  return ordered.map((trial) => {
    const objective = trial.state === "complete" ? trial.objective : null;
    const feasibility = feasibilityOf(trial);
    if (
      objective !== null &&
      feasibility !== "infeasible" &&
      (best === null || isBetter(direction, objective, best))
    ) {
      best = objective;
    }
    return { step: trial.trial + 1, objective, bestSoFar: best, feasibility };
  });
};

/**
 * uPlot aligned data: `[steps, objectives, bestSoFar, infeasibleObjectives]`.
 * A step's objective sits in the second series when it is feasible or of
 * unknown feasibility and in the fourth when infeasible, so the chart can
 * colour the two apart without a per-point style.
 */
export const toObjectiveHistoryData = (
  points: readonly ObjectiveHistoryPoint[],
): uPlot.AlignedData => [
  points.map((point) => point.step),
  points.map((point) =>
    point.feasibility === "infeasible" ? null : point.objective,
  ),
  points.map((point) => point.bestSoFar),
  points.map((point) =>
    point.feasibility === "infeasible" ? point.objective : null,
  ),
];
