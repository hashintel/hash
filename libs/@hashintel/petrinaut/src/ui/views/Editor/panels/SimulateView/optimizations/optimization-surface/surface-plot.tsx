/**
 * The plot of a study's surface: the X/Y axis selects, a contour over cells
 * sampled locally in quad-tree order, and the caption. `refinedCells` lays
 * deeper values the owner computed for the points it looked at over the
 * walk's own samples. Completed trials are rings (the best emphasized) and
 * the navigation marker sits where the parameters are.
 */
import { type ReactNode, type RefObject, use, useState } from "react";

import { ExperimentsActionsContext } from "../../../../../../../react/experiments/context";
import { sweepCellObjective } from "../../../../../../../react/experiments/sweep-cell-objective";
import {
  optimizationAxisPositionFor,
  optimizationAxisValueAt,
} from "../../../../../../../react/optimizations/surface-grid";
import {
  ContourSurface,
  contourSurfaceKey,
} from "../../../../../../components/contour-surface";
import { formatAxisValue } from "../../shared/format-axis-value";
import {
  SurfaceAxisControls,
  SurfaceCaption,
  SurfaceFrame,
} from "../../shared/surface-frame";
import {
  quadTreeLevels,
  SURFACE_CELL_RUNS,
  surfacePositions,
} from "../../shared/surface-sampling";
import { useSurfaceWalk } from "../../shared/use-surface-walk";
import {
  type OptimizationSurfaceView,
  surfaceSliceKey,
  surfaceWalkKey,
} from "./navigation-slice";
import { sampleStudyCell, type StudyCellCache } from "./sample-study-cell";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";
import type { OptimizationSurfaceAxis } from "../../../../../../../react/optimizations/surface-grid";
import type {
  ContourSurfaceFraction,
  ContourSurfaceMarker,
} from "../../../../../../components/contour-surface";

/** Grid-index coordinate of an axis position, fractional between samples. */
export const surfaceGridCoordinate = (
  axis: OptimizationSurfaceAxis,
  position: number,
): number => (position / axis.stepCount) * (surfacePositions(axis).length - 1);

/** The sampled cell an axis position pair lands on, or null between cells. */
export const surfaceCellKeyAt = (
  xAxis: OptimizationSurfaceAxis,
  yAxis: OptimizationSurfaceAxis,
  xPosition: number,
  yPosition: number,
): string | null => {
  const xIndex = surfacePositions(xAxis).indexOf(xPosition);
  const yIndex = surfacePositions(yAxis).indexOf(yPosition);
  return xIndex === -1 || yIndex === -1
    ? null
    : contourSurfaceKey(xIndex, yIndex);
};

export const OptimizationSurfacePlot = ({
  optimization,
  axes,
  view,
  onViewChange,
  positions,
  booleans,
  cellCache,
  refinedCells,
  onPick,
  children,
}: {
  optimization: Pick<OptimizationRecord, "id" | "input" | "trials" | "best">;
  axes: readonly OptimizationSurfaceAxis[];
  view: OptimizationSurfaceView;
  onViewChange: (view: OptimizationSurfaceView) => void;
  /** A position per axis. */
  positions: Readonly<Record<string, number>>;
  /** A value per boolean optimized parameter. */
  booleans: Readonly<Record<string, boolean>>;
  cellCache: RefObject<StudyCellCache>;
  /** Deeper values for cells the owner refined; they win over the walk. */
  refinedCells: ReadonlyMap<string, number> | null;
  /** The X and Y positions a click or drag on the plot picked. */
  onPick: (positions: Record<string, number>) => void;
  /** Rows between the axis selects and the plot. */
  children?: ReactNode;
}) => {
  const { sampleDetachedObjective } = use(ExperimentsActionsContext);
  const metricId = optimization.input.objective.metricId;
  const [preview, setPreview] = useState<ContourSurfaceFraction | null>(null);
  const xAxis = axes.find((axis) => axis.identifier === view.xAxisId);
  const yAxis = axes.find((axis) => axis.identifier === view.yAxisId);
  const slice = surfaceSliceKey({ axes, view, positions, booleans });
  const walkKey = surfaceWalkKey(optimization.id, view, slice);

  // The sampler is serialised, so one lane of single-cell chunks.
  const walkValues = useSurfaceWalk<number>({
    walkKey,
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

  // A refined point is usually also a grid cell: its deeper value wins.
  const cellValues =
    refinedCells && refinedCells.size > 0
      ? new Map([...walkValues, ...refinedCells])
      : walkValues;

  const markers: ContourSurfaceMarker[] =
    xAxis && yAxis
      ? [
          ...optimization.trials
            .filter(
              (trial) => trial.state === "complete" && trial.objective !== null,
            )
            .map((trial): ContourSurfaceMarker | null => {
              const xValue = trial.parameters[xAxis.identifier];
              const yValue = trial.parameters[yAxis.identifier];
              if (typeof xValue !== "number" || typeof yValue !== "number") {
                return null;
              }
              return {
                x: surfaceGridCoordinate(
                  xAxis,
                  optimizationAxisPositionFor(xAxis, xValue),
                ),
                y: surfaceGridCoordinate(
                  yAxis,
                  optimizationAxisPositionFor(yAxis, yValue),
                ),
                emphasis: optimization.best?.trial === trial.trial,
              };
            })
            .filter((marker) => marker !== null),
          {
            x: surfaceGridCoordinate(xAxis, positions[xAxis.identifier] ?? 0),
            y: surfaceGridCoordinate(yAxis, positions[yAxis.identifier] ?? 0),
            kind: "navigation",
          },
        ]
      : [];

  const handlePickFraction = (fraction: ContourSurfaceFraction) => {
    if (!xAxis || !yAxis) {
      return;
    }
    onPick({
      [xAxis.identifier]: Math.round(fraction.x * xAxis.stepCount),
      [yAxis.identifier]: Math.round(fraction.y * yAxis.stepCount),
    });
  };

  /** The axis readout a plot fraction lands on. */
  const readoutAt = (axis: OptimizationSurfaceAxis, fraction: number): string =>
    `${axis.identifier} = ${formatAxisValue(
      optimizationAxisValueAt(axis, Math.round(fraction * axis.stepCount)),
    )}`;

  const totalCells =
    xAxis && yAxis
      ? surfacePositions(xAxis).length * surfacePositions(yAxis).length
      : 0;

  return (
    <SurfaceFrame>
      <SurfaceAxisControls
        axes={axes}
        xAxisId={view.xAxisId}
        yAxisId={view.yAxisId}
        onXAxisIdChange={(xAxisId) => onViewChange({ ...view, xAxisId })}
        onYAxisIdChange={(yAxisId) => onViewChange({ ...view, yAxisId })}
      />
      {children}
      {xAxis && yAxis ? (
        <ContourSurface
          nx={surfacePositions(xAxis).length}
          ny={surfacePositions(yAxis).length}
          contentKey={`${view.xAxisId}|${view.yAxisId}`}
          values={cellValues}
          markers={markers}
          onPickFraction={handlePickFraction}
          onPreviewFraction={setPreview}
          aria-label="Optimization surface"
        />
      ) : null}
      <SurfaceCaption
        preview={
          preview && xAxis && yAxis
            ? { x: readoutAt(xAxis, preview.x), y: readoutAt(yAxis, preview.y) }
            : null
        }
        sampledCount={cellValues.size}
        totalCells={totalCells}
        runsPerCell={SURFACE_CELL_RUNS}
        note="rings are the study's trials (best highlighted), the ringed dot the current parameters"
      />
    </SurfaceFrame>
  );
};
