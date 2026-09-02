import { createMonteCarloMetricNumericAccumulator } from "@hashintel/petrinaut-core";

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
 * A scenario parameter swept across the interval `[min, max]`. The interval
 * quantizes internally (`buildParameterAxis`); nothing about its resolution
 * is declared here.
 */
export type ExperimentParameterRangeInput = {
  mode: "range";
  min: number;
  max: number;
};

export type ExperimentParameterInput =
  | ExperimentParameterFixedInput
  | ExperimentParameterRangeInput;

/**
 * One swept parameter of an experiment: its interval, quantized into
 * `stepCount` steps. Positions run `0..stepCount` inclusive; position `p`
 * maps to the value `axisValueAt(axis, p)`. Quantization is what makes
 * revisited slider positions cache hits: every computed batch is keyed by
 * position, so returning to a position restores its runs and distributions.
 */
export type ExperimentParameterAxis = {
  identifier: string;
  min: number;
  max: number;
  /** Positions run 0..stepCount inclusive. */
  stepCount: number;
  integer: boolean;
};

/**
 * Quantization steps per axis. Fine enough that the slider feels continuous
 * against the interval, coarse enough that positions repeat (and therefore
 * hit the per-position cache) when the user returns to one.
 */
export const SWEEP_AXIS_STEPS = 50;

/** Inclusive position range of one axis; `from === to` is a point. */
export type SweepAxisSelection = { from: number; to: number };

/**
 * The navigator's selection: an inclusive position range per swept
 * parameter. The default selection spans every axis whole.
 */
export type SweepSelection = Readonly<Record<string, SweepAxisSelection>>;

/**
 * Cumulative run targets a combination climbs through as it is refined:
 * a small batch for a fast first picture, then progressively larger batches
 * so the viewed distributions sharpen quickly at first and keep improving
 * while the user stays on a selection. Extended ×5/×2 beyond the last step
 * for very large run budgets.
 */
export const EXPERIMENT_RUN_LADDER: readonly number[] = [8, 25, 100, 500, 1000];

/**
 * The next cumulative run target for a combination that currently has
 * `completedRuns` runs, clamped to `maxRuns` (the experiment's requested run
 * count). Returns null once the combination is saturated.
 */
export function getNextRunTarget(
  completedRuns: number,
  maxRuns: number,
): number | null {
  if (completedRuns >= maxRuns) {
    return null;
  }

  for (const target of EXPERIMENT_RUN_LADDER) {
    if (target > completedRuns) {
      return Math.min(target, maxRuns);
    }
  }

  // Beyond the explicit ladder: keep alternating ×5 / ×2 (1000 → 5000 →
  // 10000 → 50000 …) so arbitrarily large run budgets still step smoothly.
  let target = EXPERIMENT_RUN_LADDER.at(-1)!;
  let timesFive = true;
  while (target <= completedRuns) {
    target *= timesFive ? 5 : 2;
    timesFive = !timesFive;
  }

  return Math.min(target, maxRuns);
}

export type BuildAxisOutcome =
  | { ok: true; axis: ExperimentParameterAxis }
  | { ok: false; error: string };

/** Strips float artifacts (e.g. 0.30000000000000004) from generated values. */
function normalizeRangeValue(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * Builds a swept parameter's quantized axis from its interval. Integer
 * parameters get one step per integer when the interval is narrower than
 * `SWEEP_AXIS_STEPS`, so every position is a distinct integer.
 */
export function buildParameterAxis(
  parameter: Pick<ScenarioParameter, "identifier" | "type">,
  range: Pick<ExperimentParameterRangeInput, "min" | "max">,
): BuildAxisOutcome {
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
  if (type === "ratio" && (range.min < 0 || range.max > 1)) {
    return {
      ok: false,
      error: `${identifier}: ratio ranges must stay between 0 and 1`,
    };
  }

  const min = type === "integer" ? Math.round(range.min) : range.min;
  const max = type === "integer" ? Math.round(range.max) : range.max;
  if (max <= min) {
    return {
      ok: false,
      error: `${identifier}: range max must be greater than min`,
    };
  }

  return {
    ok: true,
    axis: {
      identifier,
      min,
      max,
      stepCount:
        type === "integer"
          ? Math.min(SWEEP_AXIS_STEPS, max - min)
          : SWEEP_AXIS_STEPS,
      integer: type === "integer",
    },
  };
}

/** The concrete parameter value at a quantized position (0..stepCount). */
export function axisValueAt(
  axis: ExperimentParameterAxis,
  position: number,
): number {
  const clamped = Math.min(Math.max(position, 0), axis.stepCount);
  const raw = axis.min + ((axis.max - axis.min) * clamped) / axis.stepCount;
  return normalizeRangeValue(axis.integer ? Math.round(raw) : raw);
}

/** The value distance between adjacent positions of an axis. */
export const axisStep = (axis: {
  min: number;
  max: number;
  stepCount: number;
}): number => (axis.max - axis.min) / axis.stepCount;

/** The quantized position nearest to `value` (0..stepCount). */
export function axisPositionFor(
  axis: ExperimentParameterAxis,
  value: number,
): number {
  const fraction = (value - axis.min) / (axis.max - axis.min);
  return Math.min(
    Math.max(Math.round(fraction * axis.stepCount), 0),
    axis.stepCount,
  );
}

/** The default selection: every axis spans its whole interval. */
export function fullSweepSelection(
  axes: readonly ExperimentParameterAxis[],
): SweepSelection {
  return Object.fromEntries(
    axes.map((axis) => [axis.identifier, { from: 0, to: axis.stepCount }]),
  );
}

/** Clamps a selection to the axes and orders each range's ends. */
export function normalizeSweepSelection(
  axes: readonly ExperimentParameterAxis[],
  selection: SweepSelection,
): SweepSelection {
  return Object.fromEntries(
    axes.map((axis) => {
      const range = selection[axis.identifier] ?? {
        from: 0,
        to: axis.stepCount,
      };
      const clamp = (position: number) =>
        Math.min(Math.max(Math.round(position), 0), axis.stepCount);
      const from = clamp(range.from);
      const to = clamp(range.to);
      return [
        axis.identifier,
        from <= to ? { from, to } : { from: to, to: from },
      ];
    }),
  );
}

// One prime base per swept axis: two axes sharing a base would draw along a
// diagonal. A sweep can range every scenario parameter, so the list is long.
const HALTON_BASES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71,
  73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131,
];

/** Radical inverse of `index` in `base` — the Halton sequence's coordinate. */
function radicalInverse(index: number, base: number): number {
  let result = 0;
  let fraction = 1 / base;
  let remaining = index;
  while (remaining > 0) {
    result += (remaining % base) * fraction;
    remaining = Math.floor(remaining / base);
    fraction /= base;
  }
  return result;
}

/**
 * A seed-derived fraction in [0, 1): each axis's Cranley–Patterson shift.
 * `Math.imul` keeps every product in 32 bits — plain `*` would round through
 * f64 and diverge across engines.
 */
/* eslint-disable no-bitwise -- a 32-bit hash is bit manipulation by definition */
function axisShift(seed: number, axisIndex: number): number {
  let hash =
    (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(axisIndex + 1, 0x85ebca6b)) >>>
    0;
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 0x297a2d39) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4_294_967_296;
}
/* eslint-enable no-bitwise */

/**
 * Where run `globalRunIndex` falls along ranged axis `axisIndex`, in [0, 1):
 * a per-axis low-discrepancy sequence (radical inverse in a distinct prime
 * base per axis), rotated by a seed-derived shift (Cranley–Patterson). Any
 * prefix of runs covers every range near-uniformly and jointly; the rotation
 * makes the draws unbiased over the seed and gives every experiment seed its
 * own value sequence. Prefix-stable — a draw depends only on the seed, the
 * axis, and the run index — so a ladder batch extends the exact sequence
 * earlier batches drew from, and cached runs never go stale.
 */
export function sweepRunFraction(
  seed: number,
  globalRunIndex: number,
  axisIndex: number,
): number {
  const fraction =
    radicalInverse(
      globalRunIndex + 1,
      HALTON_BASES[axisIndex % HALTON_BASES.length]!,
    ) + axisShift(seed, axisIndex);
  return fraction >= 1 ? fraction - 1 : fraction;
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
    // Exact: scalar frames carry their across-runs accumulator state, and the
    // accumulator monoid recombines it — the same mechanism a sharded
    // experiment uses (`metrics/merge.ts`).
    const accumulator = createMonteCarloMetricNumericAccumulator(
      left.aggregateRuns,
    );
    const runAggregate = accumulator.merge(
      left.runAggregate,
      right.runAggregate,
    );
    const frameValue = accumulator.read(runAggregate);

    return {
      ...left,
      frameValue,
      value: frameValue,
      timeValue: null,
      runAggregate,
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
