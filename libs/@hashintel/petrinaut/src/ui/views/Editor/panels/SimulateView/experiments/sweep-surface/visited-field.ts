/**
 * The sweep surface's field from what the sweep has computed: every visited
 * point projected onto the two shown axes as a filled dot with its value for
 * the shown metric, and the point being computed as a ring, its running
 * value entering the field as the runs complete. Pure; the card reads the
 * record and hands the pieces in.
 */
import { selectionMidpoint } from "../../../../../../../react/experiments/parameter-grid";
import { sweepCellObjective } from "../../../../../../../react/experiments/sweep-cell-objective";
import { contourSurfaceKey } from "../../../../../../components/contour-surface";
import {
  type SurfaceField,
  surfaceGridCoordinate,
} from "../../shared/surface-field";

import type { SweepVisitedCell } from "../../../../../../../react/experiments/context";
import type {
  ExperimentParameterAxis,
  SweepSelection,
} from "../../../../../../../react/experiments/parameter-grid";
import type { ContourSurfaceMarker } from "../../../../../../components/contour-surface";
import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

/** Whether the selection is a single point on every axis. */
export const isPointSelection = (
  selection: SweepSelection,
  axes: readonly ExperimentParameterAxis[],
): boolean =>
  axes.every((axis) => {
    const range = selection[axis.identifier];
    return range !== undefined && range.from === range.to;
  });

/**
 * Visited points as a field. Every visited point is a sample and a dot
 * wherever its hidden-axis positions sit, so the picture is the projection
 * of everything computed, as a study's surface is; the point matching the
 * current selection is emphasized.
 */
export const visitedSurfaceField = ({
  visited,
  xAxis,
  yAxis,
  metricId,
  selection,
}: {
  visited: readonly SweepVisitedCell[];
  xAxis: ExperimentParameterAxis;
  yAxis: ExperimentParameterAxis;
  metricId: string;
  selection: SweepSelection;
}): SurfaceField => {
  const values = new Map<string, number>();
  const markers: ContourSurfaceMarker[] = [];
  const selectedX = selection[xAxis.identifier];
  const selectedY = selection[yAxis.identifier];
  for (const cell of visited) {
    const xPosition = cell.position[xAxis.identifier];
    const yPosition = cell.position[yAxis.identifier];
    if (xPosition === undefined || yPosition === undefined) {
      continue;
    }
    const x = surfaceGridCoordinate(xAxis, xPosition);
    const y = surfaceGridCoordinate(yAxis, yPosition);
    const value = cell.means[metricId];
    if (value === undefined) {
      markers.push({ x, y, kind: "muted" });
      continue;
    }
    values.set(contourSurfaceKey(x, y), value);
    markers.push({
      x,
      y,
      kind: "dot",
      emphasis:
        selectedX !== undefined &&
        selectedY !== undefined &&
        selectedX.from === xPosition &&
        selectedX.to === xPosition &&
        selectedY.from === yPosition &&
        selectedY.to === yPosition,
    });
  }
  return { values, markers };
};

/**
 * The point being computed, as a ring at the selection with the metric's
 * running value from the frames streaming for it, so the field fills in
 * before the point folds. Nothing while the selection is a range or nothing
 * computes.
 */
export const computingSurfaceField = ({
  selection,
  axes,
  xAxis,
  yAxis,
  metricId,
  computing,
  metricFrames,
}: {
  selection: SweepSelection;
  axes: readonly ExperimentParameterAxis[];
  xAxis: ExperimentParameterAxis;
  yAxis: ExperimentParameterAxis;
  metricId: string;
  computing: boolean;
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
}): SurfaceField => {
  if (!computing || !isPointSelection(selection, axes)) {
    return { values: new Map(), markers: [] };
  }
  const x = surfaceGridCoordinate(xAxis, selectionMidpoint(selection, xAxis));
  const y = surfaceGridCoordinate(yAxis, selectionMidpoint(selection, yAxis));
  const running = sweepCellObjective(metricFrames, metricId);
  return {
    values:
      running === null
        ? new Map()
        : new Map([[contourSurfaceKey(x, y), running]]),
    markers: [{ x, y, kind: "point" }],
  };
};

/** The caption's state line for the sweep surface. */
export const describeVisitedSurface = ({
  visitedCount,
  computing,
  runsCompleted,
  runTarget,
  following,
}: {
  visitedCount: number;
  computing: boolean;
  runsCompleted: number;
  runTarget: number | null;
  following: boolean;
}): string => {
  const points =
    visitedCount === 0
      ? "no points yet"
      : `${visitedCount} ${visitedCount === 1 ? "point" : "points"}`;
  if (following) {
    return `${points} · the optimizer is choosing the next point`;
  }
  const refining = computing
    ? runTarget === null
      ? `computing the selected point: ${runsCompleted} runs`
      : `computing the selected point: ${runsCompleted} of ${runTarget} runs`
    : null;
  return [
    points,
    ...(refining === null ? [] : [refining]),
    "drag or click to compute a point",
  ].join(" · ");
};
