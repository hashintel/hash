import { createUserKeyedRecord } from "@hashintel/petrinaut-core";

import { mergeMetricFramesAcrossCells } from "../../../../../../../react/experiments/parameter-grid";
import { sweepBatchSeed } from "../../../../../../../react/experiments/sweep-session";
import {
  optimizationAxisValueAt,
  partitionParameterBindings,
} from "../../../../../../../react/optimizations/surface-grid";
import { objectiveMetric } from "../../shared/study-labels";

import type { ExperimentsContextValue } from "../../../../../../../react/experiments/context";
import type { SweepCellSnapshot } from "../../../../../../../react/experiments/sweep-session";
import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";
import type { OptimizationSurfaceAxis } from "../../../../../../../react/optimizations/surface-grid";

/**
 * Per axis pair, position tuple and slice, the promise of a cell's deepest
 * merged result. A cell's entry is a promise so the walk and a selected
 * point's refinement queue behind each other instead of both sampling from
 * the same run index.
 */
export type StudyCellCache = Map<string, Promise<SweepCellSnapshot | null>>;

/**
 * Brings one cell up to at least `minRuns` locally computed runs, merging
 * batches into `cache`.
 */
export const sampleStudyCell = async (options: {
  sampleDetachedObjective: ExperimentsContextValue["sampleDetachedObjective"];
  cache: StudyCellCache;
  optimization: Pick<OptimizationRecord, "id" | "input">;
  axes: readonly OptimizationSurfaceAxis[];
  xAxisId: string;
  yAxisId: string;
  /** Position per off-surface axis and value per boolean, as a slice key. */
  slice: string;
  xPosition: number;
  yPosition: number;
  minRuns: number;
}): Promise<SweepCellSnapshot | null> => {
  const {
    sampleDetachedObjective,
    cache,
    optimization,
    axes,
    xAxisId,
    yAxisId,
    slice,
    xPosition,
    yPosition,
    minRuns,
  } = options;
  const input = optimization.input;
  const metric = objectiveMetric(input);
  if (!metric) {
    return null;
  }

  const sliceEntries = new Map(
    slice
      .split("|")
      .filter((entry) => entry !== "")
      .map((entry) => entry.split("=") as [string, string]),
  );

  const { fixed, optimized } = partitionParameterBindings(input);
  const values = createUserKeyedRecord<number | boolean>();
  for (const [identifier, value] of Object.entries(fixed)) {
    values[identifier] = value;
  }
  for (const [identifier, binding] of Object.entries(optimized)) {
    if (binding.domain.kind === "boolean") {
      values[identifier] = sliceEntries.get(identifier) === "true";
    }
  }
  for (const axis of axes) {
    const position =
      axis.identifier === xAxisId
        ? xPosition
        : axis.identifier === yAxisId
          ? yPosition
          : Number(sliceEntries.get(axis.identifier) ?? 0);
    values[axis.identifier] = optimizationAxisValueAt(axis, position);
  }

  // The axes are part of the key: swapping X and Y keeps the positions and the
  // slice while every value moves to the other parameter.
  const key = `${xAxisId}=${xPosition}|${yAxisId}=${yPosition}|${slice}`;
  const pending = cache.get(key);
  const settled = (async (): Promise<SweepCellSnapshot | null> => {
    const cached = await pending;
    if (cached && cached.runsCompleted >= minRuns) {
      return cached;
    }
    const from = cached?.runsCompleted ?? 0;
    const snapshot = await sampleDetachedObjective({
      cacheKey: optimization.id,
      definition: input.model.definition,
      scenarioId: input.scenario.id,
      scenarioParameterValues: values,
      metric: { id: metric.id, label: metric.name, code: metric.code },
      seed: sweepBatchSeed(input.execution.seed, from),
      runCount: minRuns - from,
      dt: input.execution.dt,
      maxTime: input.execution.maxTime,
    });
    if (!snapshot) {
      return cached ?? null;
    }
    return {
      runsCompleted: minRuns,
      metricFrames: cached
        ? mergeMetricFramesAcrossCells([
            cached.metricFrames,
            snapshot.metricFrames,
          ])
        : snapshot.metricFrames,
    };
  })();
  cache.set(key, settled);
  return await settled;
};
