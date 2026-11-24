import { deriveRunSeed } from "@hashintel/petrinaut-core";

import { axisValueAt, sweepRunFraction } from "../parameter-grid";
import { createCooperativeYielder } from "./cooperative-yield";

import type {
  ExperimentParameterAxis,
  SweepSelection,
} from "../parameter-grid";

/** The base seed of the batch whose first run has global index `from`. */
export const sweepBatchSeed = (seed: number, from: number): number =>
  from === 0 ? seed : deriveRunSeed(seed, from);

/** An error the batch machinery recognizes as a deliberate abort. */
export const abortError = (): Error => {
  const error = new Error("The batch was aborted.");
  error.name = "AbortError";
  return error;
};

/**
 * One batch's per-run draws: one column per ranged axis, run-major. The
 * typed array is written once and translated without a record per run.
 */
export type SweepRunDraws = {
  /** The drawn identifiers (ranged axes), in axis order. */
  identifiers: readonly string[];
  /** `values[run * identifiers.length + i]` is `identifiers[i]`'s draw. */
  values: Float64Array;
};

/**
 * Per-run parameter draws for a range selection's batch covering global run
 * indices `[from, target)`, or undefined when every axis is a point. Each
 * ranged axis draws continuously inside its selected value interval — the
 * quantized positions bound the interval, they do not grid it — via the
 * axis's own seed-shifted low-discrepancy sequence, prefix-stable in the
 * run index.
 */
export const sweepRangeDraws = async (
  seed: number,
  axes: readonly ExperimentParameterAxis[],
  selection: SweepSelection,
  from: number,
  target: number,
  signal?: { readonly aborted: boolean },
): Promise<SweepRunDraws | undefined> => {
  const ranged = axes
    .map((axis, axisIndex) => {
      const range = selection[axis.identifier] ?? {
        from: 0,
        to: axis.stepCount,
      };
      if (range.from === range.to) {
        return null;
      }
      return {
        axis,
        axisIndex,
        low: axisValueAt(axis, range.from),
        high: axisValueAt(axis, range.to),
      };
    })
    .filter((entry) => entry !== null);

  if (ranged.length === 0) {
    return undefined;
  }

  const runCount = target - from;
  const width = ranged.length;
  const values = new Float64Array(runCount * width);
  const yielder = createCooperativeYielder();
  for (let localIndex = 0; localIndex < runCount; localIndex++) {
    if (localIndex % 4096 === 0) {
      // A superseded batch stops here rather than finishing millions of
      // draws nobody wants. Checked independently of the yield, which a
      // hidden document skips.
      if (signal?.aborted) {
        throw abortError();
      }
      // Not before the first draw: the loop has held the thread for nothing
      // yet, so only a stalled machine could show the budget as spent.
      if (localIndex > 0 && yielder.shouldYield()) {
        await yielder.yieldNow();
      }
    }
    const globalIndex = from + localIndex;
    for (let column = 0; column < width; column++) {
      const { axis, axisIndex, low, high } = ranged[column]!;
      const fraction = sweepRunFraction(seed, globalIndex, axisIndex);
      // An integer axis gets one equal-width bucket per value, so the
      // endpoints draw as often as the interior; rounding a continuous draw
      // would halve their share.
      values[localIndex * width + column] = axis.integer
        ? low + Math.min(Math.floor(fraction * (high - low + 1)), high - low)
        : // 12 significant digits, the precision cached rungs are keyed at.
          Number((low + fraction * (high - low)).toPrecision(12));
    }
  }
  return { identifiers: ranged.map((entry) => entry.axis.identifier), values };
};
