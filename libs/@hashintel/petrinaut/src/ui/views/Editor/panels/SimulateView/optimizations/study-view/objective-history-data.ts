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
 * for a trial event carrying no constraint results.
 */
export type ObjectiveFeasibility = "feasible" | "infeasible" | "unknown";

/**
 * A step's feasibility from its constraint results: infeasible when its draw
 * broke a parameter constraint. A step whose state constraints fell short is
 * limited, not infeasible: its objective counts like any other, so it keeps
 * its colour and can be the best so far.
 */
export const trialFeasibility = (
  trial: Pick<PetrinautOptimizationTrialEvent, "constraints">,
): ObjectiveFeasibility => {
  if (!trial.constraints) {
    return "unknown";
  }
  return trial.constraints.infeasible === undefined ? "feasible" : "infeasible";
};

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
 * An infeasible step never becomes the best so far, the way Optuna's history
 * substitutes infinity for it before accumulating, so the word "best" never
 * sits on a configuration that broke a constraint.
 */
export const buildObjectiveHistory = (
  trials: readonly PetrinautOptimizationTrialEvent[],
  direction: ObjectiveDirection,
): ObjectiveHistoryPoint[] => {
  // Parallel steps report out of order; the history reads in step order.
  const ordered = trials.toSorted((left, right) => left.trial - right.trial);
  let best: number | null = null;
  return ordered.map((trial) => {
    const objective = trial.state === "complete" ? trial.objective : null;
    const feasibility = trialFeasibility(trial);
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

/** uPlot aligned data: `[steps, objectives, bestSoFar]`. */
export const toObjectiveHistoryData = (
  points: readonly ObjectiveHistoryPoint[],
): uPlot.AlignedData => [
  points.map((point) => point.step),
  points.map((point) => point.objective),
  points.map((point) => point.bestSoFar),
];
