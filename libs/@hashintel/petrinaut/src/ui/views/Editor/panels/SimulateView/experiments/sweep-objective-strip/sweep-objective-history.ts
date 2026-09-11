/**
 * The objective history of the study a sweep ran: what the strip under the
 * sliders draws and what its row says.
 */
import {
  isOptimizationActive,
  type OptimizationRecord,
} from "../../../../../../../react/optimizations/context";
import {
  buildObjectiveHistory,
  type ObjectiveHistoryPoint,
} from "../../shared/objective-history-data";
import { objectiveMetricName } from "../../shared/study-labels";

export type SweepObjectiveHistory = {
  /** The study's steps, numbered from 1. */
  points: readonly ObjectiveHistoryPoint[];
  /**
   * The x axis's right edge: while the study runs, the steps it asked for
   * (never short of the steps run); settled, the last step run.
   */
  xMax: number;
  /**
   * The metric the study optimizes and the best it found, for the row's
   * summary; a study that failed at start names neither.
   */
  metricName: string;
  best: number | null;
};

type SweepStudy = Pick<
  OptimizationRecord,
  "trials" | "input" | "requestedTrials" | "best" | "status"
>;

/**
 * The study's steps numbered from 1 with its metric and best; a study that
 * ended without a step, failed at start, is summarised as one that ran none.
 */
export const buildSweepObjectiveHistory = (
  study: SweepStudy,
): SweepObjectiveHistory => {
  const points = buildObjectiveHistory(
    study.trials,
    study.input.objective.direction,
  );
  if (study.trials.length === 0 && !isOptimizationActive(study)) {
    return { points, xMax: 0, metricName: "", best: null };
  }
  return {
    points,
    xMax: isOptimizationActive(study)
      ? Math.max(points.length, study.requestedTrials)
      : points.length,
    metricName: objectiveMetricName(study.input),
    best: study.best?.objective ?? null,
  };
};
