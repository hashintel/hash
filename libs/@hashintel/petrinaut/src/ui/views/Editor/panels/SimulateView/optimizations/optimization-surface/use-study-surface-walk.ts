/**
 * The fill of a remote study's surface: an X×Y sub-grid of the shown axes
 * walked in quad-tree order, each cell brought to `SURFACE_CELL_RUNS` runs of
 * the study's frozen model through the detached sampler, which is serialised
 * — so one lane of single-cell chunks.
 */
import { sweepCellObjective } from "../../../../../../../react/experiments/sweep-cell-objective";
import {
  quadTreeLevels,
  SURFACE_CELL_RUNS,
  surfacePositions,
} from "../../shared/surface-sampling";
import { useSurfaceWalk } from "../../shared/use-surface-walk";
import {
  type OptimizationSurfaceView,
  surfaceWalkKey,
} from "./navigation-slice";
import { sampleStudyCell, type StudyCellCache } from "./sample-study-cell";

import type { ExperimentsContextValue } from "../../../../../../../react/experiments/context";
import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";
import type { OptimizationSurfaceAxis } from "../../../../../../../react/optimizations/surface-grid";
import type { RefObject } from "react";

export const useStudySurfaceWalk = ({
  sampleDetachedObjective,
  cellCache,
  optimization,
  axes,
  view,
  slice,
}: {
  sampleDetachedObjective: ExperimentsContextValue["sampleDetachedObjective"];
  cellCache: RefObject<StudyCellCache>;
  optimization: Pick<OptimizationRecord, "id" | "input">;
  axes: readonly OptimizationSurfaceAxis[];
  view: OptimizationSurfaceView;
  /** Position per off-surface axis and value per boolean, as a slice key. */
  slice: string;
}): ReadonlyMap<string, number> => {
  const metricId = optimization.input.objective.metricId;
  const xAxis = axes.find((axis) => axis.identifier === view.xAxisId);
  const yAxis = axes.find((axis) => axis.identifier === view.yAxisId);

  return useSurfaceWalk<number>({
    walkKey: surfaceWalkKey(optimization.id, view, slice),
    lanes: 1,
    buildWalk: () => {
      if (!xAxis || !yAxis || xAxis === yAxis) {
        return null;
      }
      const xPositions = surfacePositions(xAxis);
      const yPositions = surfacePositions(yAxis);
      return {
        chunks: quadTreeLevels(xPositions.length, yPositions.length)
          .flat()
          .map((cell) => [cell]),
        sample: (chunk) =>
          Promise.all(
            chunk.map(async (cell) => {
              const snapshot = await sampleStudyCell({
                sampleDetachedObjective,
                cache: cellCache.current,
                optimization,
                axes,
                xAxisId: view.xAxisId,
                yAxisId: view.yAxisId,
                slice,
                xPosition: xPositions[cell.x]!,
                yPosition: yPositions[cell.y]!,
                minRuns: SURFACE_CELL_RUNS,
              });
              return snapshot
                ? sweepCellObjective(snapshot.metricFrames, metricId)
                : null;
            }),
          ),
      };
    },
  });
};
