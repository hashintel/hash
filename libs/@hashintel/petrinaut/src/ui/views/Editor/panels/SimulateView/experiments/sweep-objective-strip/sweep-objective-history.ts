/**
 * The objective history of every study a sweep ran, end to end: what the
 * strip under the sliders draws and what its row says.
 */
import {
  buildObjectiveHistory,
  type ObjectiveHistoryPoint,
} from "../../shared/objective-history-chart";
import { objectiveMetricName } from "../../shared/study-labels";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

export type SweepObjectiveHistory = {
  /** Every study's steps end to end, numbered from 1 across studies. */
  points: readonly ObjectiveHistoryPoint[];
  /** The x axis's right edge: the steps run so far plus the last study's steps still to come. */
  xMax: number;
  /** The first global step of every study after the first: where a divider is drawn. */
  dividers: readonly number[];
  /** The last study's metric name and best, for the row's summary. */
  metricName: string;
  best: number | null;
};

/**
 * Concatenates the studies' objective histories: each study's steps are
 * numbered after the previous study's run steps (`trials.length`, so a
 * stopped study leaves no gap), and best-so-far restarts with each study,
 * whose metric and direction may differ from the last.
 */
export const buildSweepObjectiveHistory = (
  studies: readonly Pick<
    OptimizationRecord,
    "trials" | "input" | "requestedTrials" | "best"
  >[],
): SweepObjectiveHistory => {
  const points: ObjectiveHistoryPoint[] = [];
  const dividers: number[] = [];
  let offset = 0;
  for (const [index, study] of studies.entries()) {
    if (index > 0) {
      dividers.push(offset + 1);
    }
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
    return { points, xMax: 0, dividers, metricName: "", best: null };
  }
  return {
    points,
    xMax: Math.max(
      points.length,
      offset - last.trials.length + last.requestedTrials,
    ),
    dividers,
    metricName: objectiveMetricName(last.input),
    best: last.best?.objective ?? null,
  };
};
