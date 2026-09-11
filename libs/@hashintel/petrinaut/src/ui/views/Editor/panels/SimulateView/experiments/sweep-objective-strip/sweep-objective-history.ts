/**
 * The objective history of every study a sweep ran, end to end: what the
 * strip under the sliders draws and what its row says.
 */
import {
  buildObjectiveHistory,
  type ObjectiveHistoryPoint,
} from "../../shared/objective-history-data";
import { objectiveMetricName } from "../../shared/study-labels";

import {
  isOptimizationActive,
  type OptimizationRecord,
} from "../../../../../../../react/optimizations/context";

export type SweepObjectiveHistory = {
  /** Every study's steps end to end, numbered from 1 across studies. */
  points: readonly ObjectiveHistoryPoint[];
  /**
   * The x axis's right edge: while the last study runs, the steps run so far
   * plus its steps still to come; settled, the last step run.
   */
  xMax: number;
  /** The first global step of every study drawn after the first: where a divider is drawn. */
  dividers: readonly number[];
  /** The studies that drew a step or are about to, for the row's count. */
  studyCount: number;
  /** The last study's metric name and best, for the row's summary. */
  metricName: string;
  best: number | null;
};

/**
 * Concatenates the studies' objective histories: each study's steps are
 * numbered after the previous study's run steps (`trials.length`, so a
 * stopped study leaves no gap), and best-so-far restarts with each study,
 * whose metric and direction may differ from the last. A study that ended
 * without a step, failed at start, adds no divider and no count.
 */
export const buildSweepObjectiveHistory = (
  studies: readonly Pick<
    OptimizationRecord,
    "trials" | "input" | "requestedTrials" | "best" | "status"
  >[],
): SweepObjectiveHistory => {
  const points: ObjectiveHistoryPoint[] = [];
  const dividers: number[] = [];
  let studyCount = 0;
  let offset = 0;
  for (const study of studies) {
    if (study.trials.length === 0 && !isOptimizationActive(study)) {
      continue;
    }
    if (studyCount > 0) {
      dividers.push(offset + 1);
    }
    studyCount += 1;
    for (const point of buildObjectiveHistory(
      study.trials,
      study.input.objective.direction,
    )) {
      points.push({ ...point, step: point.step + offset });
    }
    offset += study.trials.length;
  }
  const last = studies.at(-1);
  if (last === undefined) {
    return {
      points,
      xMax: 0,
      dividers,
      studyCount,
      metricName: "",
      best: null,
    };
  }
  return {
    points,
    xMax: isOptimizationActive(last)
      ? Math.max(
          points.length,
          offset - last.trials.length + last.requestedTrials,
        )
      : points.length,
    dividers,
    studyCount,
    metricName: objectiveMetricName(last.input),
    best: last.best?.objective ?? null,
  };
};
