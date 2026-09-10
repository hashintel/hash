/**
 * @layerRoot react.optimizations.sweep-evaluator
 * @role Evaluates an optimizer's trials through a parameter sweep's own compute: each trial moves the sweep to the suggested point and reads the metric there
 *
 * A study started from an experiment's Parameters card runs no batches of
 * its own. Its evaluator turns every suggestion into a point on the sweep's
 * quantized axes, asks the experiments provider to navigate there and wait
 * for the trial's runs, and reports the metric's value at that point. The
 * sweep's navigator therefore moves trial by trial, every trial is a visited
 * point on its Surface, and the runs use the sweep's common random numbers.
 * Once the study settles the evaluator parks the sweep on the best point and
 * lifts the run cap, so that point refines to the experiment's run count.
 */
import { axisPositionFor } from "../../experiments/parameter-grid";
import { prunedTrialOutcome } from "../channel/create-optimization-channel/trial-outcome";

import type {
  ExperimentsActionsValue,
  SweepVisitedCell,
} from "../../experiments/context";
import type {
  ExperimentParameterAxis,
  SweepSelection,
} from "../../experiments/parameter-grid";
import type { OptimizationBest } from "../context";
import type {
  PetrinautOptimizationChannel,
  PetrinautOptimizationTrialRequest,
} from "@hashintel/petrinaut-core/optimization";

/** Runs a trial's point computes before its value is read: the ladder's first rung. */
export const SWEEP_TRIAL_RUNS = 8;

export type SweepTrialEvaluator = PetrinautOptimizationChannel & {
  /** The study is over: the sweep settles on the best point, uncapped. */
  settle: (best: OptimizationBest | null | undefined) => void;
};

/** The sweep point an optimizer's suggestion lands on. */
export const sweepPointFor = (
  axes: readonly ExperimentParameterAxis[],
  values: Readonly<Record<string, number | boolean>>,
): SweepSelection | null => {
  const selection: Record<string, { from: number; to: number }> = {};
  for (const axis of axes) {
    const value = values[axis.identifier];
    if (typeof value !== "number") {
      return null;
    }
    const position = axisPositionFor(axis, value);
    selection[axis.identifier] = { from: position, to: position };
  }
  return selection;
};

export const createSweepTrialEvaluator = ({
  experimentId,
  axes,
  metricId,
  runCap = SWEEP_TRIAL_RUNS,
  navigateSweep,
}: {
  experimentId: string;
  /** The sweep's axes: one per optimized parameter, in the sweep's order. */
  axes: readonly ExperimentParameterAxis[];
  /** The experiment metric the study optimizes. */
  metricId: string;
  /** Runs a trial's point computes before its value is read. */
  runCap?: number;
  navigateSweep: ExperimentsActionsValue["navigateSweep"];
}): SweepTrialEvaluator => {
  let settled = false;

  const evaluateTrial = async (request: PetrinautOptimizationTrialRequest) => {
    // Read through a call so the flag is re-checked after the await.
    const isCancelled = () => request.signal.aborted;
    if (settled || isCancelled()) {
      return prunedTrialOutcome("cancelled");
    }
    const point = sweepPointFor(axes, request.suggestedValues);
    if (point === null) {
      return prunedTrialOutcome(
        "The suggestion misses a swept parameter or is not a number",
      );
    }
    const cell: SweepVisitedCell | null = await navigateSweep(
      experimentId,
      point,
      { runCap },
    );
    if (cell === null) {
      return prunedTrialOutcome(
        isCancelled()
          ? "cancelled"
          : "The sweep moved on before the point computed",
      );
    }
    const objective = cell.means[metricId];
    if (objective === undefined || !Number.isFinite(objective)) {
      return prunedTrialOutcome(
        `The point measured no finite value for "${metricId}"`,
      );
    }
    return { kind: "objective" as const, objective };
  };

  return {
    evaluateTrial,
    settle: (best) => {
      settled = true;
      const point = best ? sweepPointFor(axes, best.parameters) : null;
      if (point !== null) {
        void navigateSweep(experimentId, point);
      }
    },
  };
};
