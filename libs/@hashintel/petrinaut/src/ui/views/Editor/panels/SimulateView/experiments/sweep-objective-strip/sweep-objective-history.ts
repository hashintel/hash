import {
  isOptimizationActive,
  type OptimizationRecord,
} from "../../../../../../../react/optimizations/context";
/**
 * The objective history of every study a sweep ran, end to end: what the
 * strip under the sliders draws and what its row says.
 */
import {
  buildObjectiveHistory,
  type ObjectiveHistoryPoint,
} from "../../shared/objective-history-data";
import { objectiveMetricName } from "../../shared/study-labels";

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
  /**
   * The metric name and best of the last study that drew a step or is about
   * to, for the row's summary; a study that failed at start never names it.
   */
  metricName: string;
  best: number | null;
};

type SweepStudy = Pick<
  OptimizationRecord,
  "trials" | "input" | "requestedTrials" | "best" | "status"
>;

/**
 * Concatenates the studies' objective histories: each study's steps are
 * numbered after the previous study's run steps (`trials.length`, so a
 * stopped study leaves no gap), and best-so-far restarts with each study,
 * whose metric and direction may differ from the last. A study that ended
 * without a step, failed at start, adds no divider and no count; a sweep
 * whose studies all did is summarised as one that ran none.
 */
export const buildSweepObjectiveHistory = (
  studies: readonly SweepStudy[],
): SweepObjectiveHistory => {
  const points: ObjectiveHistoryPoint[] = [];
  const dividers: number[] = [];
  let studyCount = 0;
  let lastCounted: SweepStudy | null = null;
  let offset = 0;
  for (const study of studies) {
    if (study.trials.length === 0 && !isOptimizationActive(study)) {
      continue;
    }
    if (studyCount > 0) {
      dividers.push(offset + 1);
    }
    studyCount += 1;
    lastCounted = study;
    for (const point of buildObjectiveHistory(
      study.trials,
      study.input.objective.direction,
    )) {
      points.push({ ...point, step: point.step + offset });
    }
    offset += study.trials.length;
  }
  const last = studies.at(-1);
  if (last === undefined || lastCounted === null) {
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
    metricName: objectiveMetricName(lastCounted.input),
    best: lastCounted.best?.objective ?? null,
  };
};
