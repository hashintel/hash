import { deriveRunSeed } from "@hashintel/petrinaut-core";

import { sweepCellValues, type SweepRunDraws } from "./selection-draws";

import type { ExperimentParameterAxis } from "../parameter-grid";
import type { ExperimentCompletion } from "@hashintel/petrinaut-core";

export type CellMeans = readonly (Readonly<Record<string, number>> | null)[];

/**
 * Lays many cells out as one batch's per-run draws: each cell's values
 * repeated `runsPerCell` times, in cell order. Every cell pins the SAME seed
 * sequence — the one the per-cell ladder's first batch derives — so a cell's
 * runs are independent of which chunk sampled it and match the navigator's.
 */
export const layoutCellBatch = (
  axes: readonly ExperimentParameterAxis[],
  seed: number,
  positions: readonly Readonly<Record<string, number>>[],
  runsPerCell: number,
): { draws: SweepRunDraws; runSeeds: number[] } => {
  const identifiers = axes.map((axis) => axis.identifier);
  const width = identifiers.length;
  const values = new Float64Array(positions.length * runsPerCell * width);
  const cellSeeds = Array.from({ length: runsPerCell }, (_, run) =>
    deriveRunSeed(seed, run),
  );
  const runSeeds: number[] = [];
  for (const [cellIndex, position] of positions.entries()) {
    const cellValues = sweepCellValues(axes, position);
    for (let run = 0; run < runsPerCell; run++) {
      const base = (cellIndex * runsPerCell + run) * width;
      for (let column = 0; column < width; column++) {
        values[base + column] = cellValues[identifiers[column]!]!;
      }
      runSeeds.push(cellSeeds[run]!);
    }
  }
  return { draws: { identifiers, values }, runSeeds };
};

/**
 * Groups a batch's per-run metric values back into per-cell means, per
 * metric, index-aligned with the batch's cells (null for a cell with no
 * finished runs). Over a partial result set the means cover the runs
 * finished so far and refine toward the final value.
 */
export const groupCellMeans = (
  runResults: ExperimentCompletion["runResults"],
  cellCount: number,
  runsPerCell: number,
): CellMeans => {
  const accumulators = Array.from(
    { length: cellCount },
    (): Record<string, { sum: number; count: number }> => ({}),
  );
  for (const [runIndex, metricValues] of runResults) {
    const cell = accumulators[Math.floor(runIndex / runsPerCell)];
    if (!cell) {
      continue;
    }
    for (const [metricId, value] of Object.entries(metricValues)) {
      const entry = (cell[metricId] ??= { sum: 0, count: 0 });
      entry.sum += value;
      entry.count += 1;
    }
  }
  return accumulators.map((cell) => {
    const entries = Object.entries(cell);
    if (entries.length === 0) {
      return null;
    }
    return Object.fromEntries(
      entries.map(([metricId, { sum, count }]) => [metricId, sum / count]),
    );
  });
};
