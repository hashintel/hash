import type {
  MonteCarloUserDefinedMetricDistributionBin,
  MonteCarloUserDefinedMetricFrame,
  ScenarioParameter,
} from "@hashintel/petrinaut-core";

/**
 * A scenario parameter fixed to a single value for the whole experiment.
 * An empty `value` falls back to the parameter's default (same as before
 * ranges existed).
 */
export type ExperimentParameterFixedInput = {
  mode: "fixed";
  value: string;
};

/**
 * A scenario parameter swept across `valueCount` evenly spaced values from
 * `min` to `max` (both inclusive). Each value becomes one axis position in
 * the experiment's parameter grid.
 */
export type ExperimentParameterRangeInput = {
  mode: "range";
  min: number;
  max: number;
  valueCount: number;
};

export type ExperimentParameterInput =
  | ExperimentParameterFixedInput
  | ExperimentParameterRangeInput;

/**
 * One ranged parameter of an experiment: the discrete values it takes across
 * the grid. The cartesian product of all axes defines the experiment's cells.
 */
export type ExperimentParameterAxis = {
  identifier: string;
  values: readonly number[];
};

/**
 * Hard cap on the parameter grid size. Every combination runs `runCount`
 * simulations and stores per-frame metric distributions, so an unbounded grid
 * exhausts browser memory long before it finishes computing.
 */
export const MAX_EXPERIMENT_COMBINATIONS = 200;

/** Grid size above which the create form warns about cost. */
export const WARN_EXPERIMENT_COMBINATIONS = 50;

export type BuildRangeValuesOutcome =
  | { ok: true; values: number[] }
  | { ok: false; error: string };

/** Strips float artifacts (e.g. 0.30000000000000004) from generated values. */
function normalizeRangeValue(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * Expands a range input into its discrete values: `valueCount` evenly spaced
 * points from `min` to `max` inclusive. Integer parameters have each point
 * rounded to the nearest integer (a range that rounds two points onto the
 * same integer is rejected rather than silently deduplicated).
 */
export function buildParameterRangeValues(
  parameter: Pick<ScenarioParameter, "identifier" | "type">,
  range: ExperimentParameterRangeInput,
): BuildRangeValuesOutcome {
  const { identifier, type } = parameter;

  if (type === "boolean") {
    return {
      ok: false,
      error: `${identifier}: boolean parameters do not support ranges`,
    };
  }
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) {
    return {
      ok: false,
      error: `${identifier}: range min and max must be finite numbers`,
    };
  }
  if (!Number.isInteger(range.valueCount) || range.valueCount < 1) {
    return {
      ok: false,
      error: `${identifier}: range needs a whole number of values (at least 1)`,
    };
  }
  if (range.valueCount > 1 && range.max <= range.min) {
    return {
      ok: false,
      error: `${identifier}: range max must be greater than min`,
    };
  }
  if (type === "ratio" && (range.min < 0 || range.max > 1)) {
    return {
      ok: false,
      error: `${identifier}: ratio ranges must stay between 0 and 1`,
    };
  }

  if (range.valueCount === 1) {
    const single = type === "integer" ? Math.round(range.min) : range.min;
    return { ok: true, values: [normalizeRangeValue(single)] };
  }

  const step = (range.max - range.min) / (range.valueCount - 1);
  const values: number[] = [];
  for (let index = 0; index < range.valueCount; index++) {
    const raw =
      index === range.valueCount - 1 ? range.max : range.min + step * index;
    values.push(
      normalizeRangeValue(type === "integer" ? Math.round(raw) : raw),
    );
  }

  if (type === "integer" && new Set(values).size !== values.length) {
    return {
      ok: false,
      error: `${identifier}: the range produces duplicate integer values — reduce the number of values`,
    };
  }

  return { ok: true, values };
}

/** Number of cells the cartesian product of the axes produces (1 when empty). */
export function countGridCombinations(
  axes: readonly ExperimentParameterAxis[],
): number {
  return axes.reduce((product, axis) => product * axis.values.length, 1);
}

/**
 * Cartesian product of the axes' values, row-major (the first axis varies
 * slowest). Returns a single empty combination when there are no axes, so a
 * range-less experiment is just a grid with one cell.
 */
export function buildParameterGridCombinations(
  axes: readonly ExperimentParameterAxis[],
): Record<string, number>[] {
  let combinations: Record<string, number>[] = [{}];

  for (const axis of axes) {
    combinations = combinations.flatMap((combination) =>
      axis.values.map((value) => ({
        ...combination,
        [axis.identifier]: value,
      })),
    );
  }

  return combinations;
}

function mergeDistributionBins(
  left: readonly MonteCarloUserDefinedMetricDistributionBin[],
  right: readonly MonteCarloUserDefinedMetricDistributionBin[],
): MonteCarloUserDefinedMetricDistributionBin[] {
  const merged = new Map<number, number>(left);

  for (const [value, frequency] of right) {
    merged.set(value, (merged.get(value) ?? 0) + frequency);
  }

  return [...merged.entries()]
    .sort(([leftValue], [rightValue]) => leftValue - rightValue)
    .map(([value, frequency]) => [value, frequency]);
}

function mergeWeightedScalar(
  leftValue: number | null,
  leftWeight: number,
  rightValue: number | null,
  rightWeight: number,
): number | null {
  if (leftValue === null) {
    return rightValue;
  }
  if (rightValue === null) {
    return leftValue;
  }

  const totalWeight = leftWeight + rightWeight;
  if (totalWeight === 0) {
    return (leftValue + rightValue) / 2;
  }

  return (leftValue * leftWeight + rightValue * rightWeight) / totalWeight;
}

function mergeTwoFrames(
  left: MonteCarloUserDefinedMetricFrame,
  right: MonteCarloUserDefinedMetricFrame,
): MonteCarloUserDefinedMetricFrame {
  if (left.outputType !== right.outputType) {
    // Cells of one experiment share metric specs, so mismatched output types
    // for the same metric/frame should be impossible; keep the first rather
    // than produce a nonsense merge.
    return left;
  }

  if (
    left.outputType === "distribution" &&
    right.outputType === "distribution"
  ) {
    return {
      ...left,
      bins: mergeDistributionBins(left.bins, right.bins),
      runSampleCount: left.runSampleCount + right.runSampleCount,
      timeSampleCount: left.timeSampleCount + right.timeSampleCount,
    };
  }

  if (left.outputType === "scalar" && right.outputType === "scalar") {
    // Approximation: a run-sample-weighted mean is exact for "mean"
    // aggregations and a reasonable stand-in for the rest. Experiment metrics
    // always use distribution output, so this path only serves API users.
    return {
      ...left,
      value: mergeWeightedScalar(
        left.value,
        left.runSampleCount,
        right.value,
        right.runSampleCount,
      ),
      frameValue: mergeWeightedScalar(
        left.frameValue,
        left.runSampleCount,
        right.frameValue,
        right.runSampleCount,
      ),
      timeValue: mergeWeightedScalar(
        left.timeValue,
        left.runSampleCount,
        right.timeValue,
        right.runSampleCount,
      ),
      runSampleCount: left.runSampleCount + right.runSampleCount,
      timeSampleCount: left.timeSampleCount + right.timeSampleCount,
    };
  }

  return left;
}

/**
 * Merges the metric frames of several experiment cells into a single frame
 * stream, as if all their runs had been part of one batch. Distribution
 * frames merge exactly (histogram bins add up); frames are matched by
 * metric id + frame number, so cells at different stream positions simply
 * contribute to the frames they have reached.
 *
 * Frames are returned grouped by metric (in first-seen order) and sorted by
 * frame number within each metric — the shape the timeline chart expects.
 */
export function mergeMetricFramesAcrossCells(
  cellFrames: readonly (readonly MonteCarloUserDefinedMetricFrame[])[],
): MonteCarloUserDefinedMetricFrame[] {
  if (cellFrames.length === 0) {
    return [];
  }
  if (cellFrames.length === 1) {
    return [...cellFrames[0]!];
  }

  const metricOrder: string[] = [];
  const framesByMetric = new Map<
    string,
    Map<number, MonteCarloUserDefinedMetricFrame>
  >();

  for (const frames of cellFrames) {
    for (const frame of frames) {
      let metricFrames = framesByMetric.get(frame.metricId);
      if (!metricFrames) {
        metricFrames = new Map();
        framesByMetric.set(frame.metricId, metricFrames);
        metricOrder.push(frame.metricId);
      }

      const existing = metricFrames.get(frame.frameNumber);
      metricFrames.set(
        frame.frameNumber,
        existing ? mergeTwoFrames(existing, frame) : frame,
      );
    }
  }

  return metricOrder.flatMap((metricId) =>
    [...framesByMetric.get(metricId)!.values()].sort(
      (left, right) => left.frameNumber - right.frameNumber,
    ),
  );
}
