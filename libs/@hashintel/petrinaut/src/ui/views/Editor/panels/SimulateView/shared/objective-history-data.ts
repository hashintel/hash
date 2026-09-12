/**
 * The objective history chart's data: one point per step in step order, the
 * step's own objective and the best so far over the steps that completed,
 * the way Optuna's `plot_optimization_history` draws a study.
 */
import type {
  PetrinautOptimizationDirection,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";
import type uPlot from "uplot";

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
  direction: PetrinautOptimizationDirection,
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
  direction: PetrinautOptimizationDirection,
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

/**
 * uPlot aligned data: `[steps, objectives, bestSoFar]`. Half a step before
 * each divider step a gap sample (a null objective and best) is laid in, so
 * the stepped best-so-far line ends with one study and starts anew with the
 * next instead of holding across the divider; the dots skip the null, and
 * the x axis labels whole steps alone.
 */
export const toObjectiveHistoryData = (
  points: readonly ObjectiveHistoryPoint[],
  dividers: readonly number[] = [],
): uPlot.AlignedData => {
  const steps: number[] = [];
  const objectives: (number | null)[] = [];
  const bestSoFar: (number | null)[] = [];
  const pendingDividers = dividers.toSorted((left, right) => left - right);
  let nextDivider = pendingDividers.at(0);
  for (const point of points) {
    while (nextDivider !== undefined && nextDivider <= point.step) {
      steps.push(nextDivider - 0.5);
      objectives.push(null);
      bestSoFar.push(null);
      pendingDividers.shift();
      nextDivider = pendingDividers.at(0);
    }
    steps.push(point.step);
    objectives.push(point.objective);
    bestSoFar.push(point.bestSoFar);
  }
  return [steps, objectives, bestSoFar];
};
