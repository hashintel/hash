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
 * Once the study settles the evaluator parks the sweep, uncapped, on the best
 * point, or on the point it was trying when the study was stopped, so that
 * point refines to the experiment's run count. A stop parks at once; the
 * terminal event that lands afterwards may carry the best, which re-parks
 * the sweep there.
 */
import { axisPositionFor } from "../../experiments/parameter-grid";
import { prunedTrialOutcome } from "../shared/pruned-trial-outcome";

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

export type SweepTrialEvaluator = PetrinautOptimizationChannel & {
  /**
   * The study is over: the sweep settles, uncapped, on the best point, or on
   * the last point tried when the study has none. A settle carrying a best
   * supersedes one without, so a completion that lands after a stop re-parks
   * the sweep on the best step; any later settle changes nothing.
   */
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
  navigateSweep,
}: {
  experimentId: string;
  /** The sweep's axes: one per optimized parameter, in the sweep's order. */
  axes: readonly ExperimentParameterAxis[];
  /** The experiment metric the study optimizes. */
  metricId: string;
  navigateSweep: ExperimentsActionsValue["navigateSweep"];
}): SweepTrialEvaluator => {
  /** Where the sweep is parked once the study is over; "none" while it runs. */
  let parked: "none" | "last" | "best" = "none";
  /** The point the latest trial moved the sweep to. */
  let lastPoint: SweepSelection | null = null;

  const evaluateTrial = async (request: PetrinautOptimizationTrialRequest) => {
    // Read through a call so the flag is re-checked after the await.
    const isCancelled = () => request.signal.aborted;
    if (parked !== "none" || isCancelled()) {
      return prunedTrialOutcome("cancelled");
    }
    const point = sweepPointFor(axes, request.suggestedValues);
    if (point === null) {
      return prunedTrialOutcome(
        "The suggestion misses a swept parameter or is not a number",
      );
    }
    lastPoint = point;
    // The manifest's runs per trial are what the point computes before its
    // value is read. A failed batch or a gone sweep rejects here, and the
    // rejection fails the study rather than pruning the trial.
    const cell: SweepVisitedCell | null = await navigateSweep(
      experimentId,
      point,
      { runCap: request.manifest.execution.seedsPerTrial ?? 1 },
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
      const bestPoint = best ? sweepPointFor(axes, best.parameters) : null;
      const next = bestPoint === null ? "last" : "best";
      if (parked === "best" || (parked === "last" && next === "last")) {
        return;
      }
      parked = next;
      const point = bestPoint ?? lastPoint;
      if (point !== null) {
        // The sweep may be gone already (its experiment removed): nothing
        // left to park.
        void navigateSweep(experimentId, point).catch(() => undefined);
      }
    },
  };
};
