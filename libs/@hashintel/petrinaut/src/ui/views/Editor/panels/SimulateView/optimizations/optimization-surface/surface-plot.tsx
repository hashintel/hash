/**
 * The plot of a study's surface: the X/Y axis selects, a contour over the
 * field the owner hands in, the study's trials as markers, the navigation
 * marker where the parameters are, and a caption. The pure helpers beside it
 * turn a study's trials and its live selection stream into that field, and
 * decide whether the plot navigates or only displays.
 */
import { type ReactNode, useState } from "react";

import { sweepCellObjective } from "../../../../../../../react/experiments/sweep-cell-objective";
import {
  followedTrial,
  isOptimizationActive,
} from "../../../../../../../react/optimizations/context";
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
import { surfacePositions } from "../../shared/surface-sampling";

import type {
  OptimizationBest,
  OptimizationNavigation,
  OptimizationRecord,
  OptimizationSelectionStream,
} from "../../../../../../../react/optimizations/context";
import type { OptimizationSurfaceAxis } from "../../../../../../../react/optimizations/surface-grid";
import type {
  ContourSurfaceFraction,
  ContourSurfaceMarker,
  ContourSurfaceSampleMarks,
  ContourSurfaceValues,
} from "../../../../../../components/contour-surface";
import type { OptimizationSurfaceView } from "./navigation-slice";
import type { PetrinautOptimizationTrialEvent } from "@hashintel/petrinaut-core";

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

/** One point of the field, in grid-index space. */
export type SurfaceSample = { x: number; y: number; value: number };

/** A study's trials as a field: a sample per objective, a marker per trial. */
export type TrialSurfaceField = {
  values: ReadonlyMap<string, number>;
  markers: readonly ContourSurfaceMarker[];
};

/** How a trial with an objective is drawn. */
export type TrialSurfaceMark = "ring" | "dot";

/**
 * Projects the trials onto the shown axes. A trial with an objective is a
 * sample of the field and a mark — a ring over a field computed elsewhere, a
 * filled dot when the trials are the field's only samples — the best
 * emphasized. A trial without one — pruned or failed — is no sample; among
 * dots it is a muted ring, among rings it is absent.
 */
export const trialSurfaceField = ({
  trials,
  best,
  xAxis,
  yAxis,
  mark,
}: {
  trials: readonly PetrinautOptimizationTrialEvent[];
  best: OptimizationBest | null;
  xAxis: OptimizationSurfaceAxis;
  yAxis: OptimizationSurfaceAxis;
  mark: TrialSurfaceMark;
}): TrialSurfaceField => {
  const values = new Map<string, number>();
  const markers: ContourSurfaceMarker[] = [];
  for (const trial of trials) {
    const xValue = trial.parameters[xAxis.identifier];
    const yValue = trial.parameters[yAxis.identifier];
    if (typeof xValue !== "number" || typeof yValue !== "number") {
      continue;
    }
    const x = surfaceGridCoordinate(
      xAxis,
      optimizationAxisPositionFor(xAxis, xValue),
    );
    const y = surfaceGridCoordinate(
      yAxis,
      optimizationAxisPositionFor(yAxis, yValue),
    );
    if (trial.objective === null) {
      if (mark === "dot") {
        markers.push({ x, y, kind: "muted" });
      }
      continue;
    }
    values.set(contourSurfaceKey(x, y), trial.objective);
    markers.push({
      x,
      y,
      kind: mark === "dot" ? "dot" : "point",
      emphasis: best?.trial === trial.trial,
    });
  }
  return { values, markers };
};

/** The objective's running value on a selection stream; null before it has one. */
const selectionSurfaceValue = (
  selection: OptimizationSelectionStream | null,
  metricId: string,
): number | null =>
  selection === null || selection.error !== null
    ? null
    : sweepCellObjective(selection.metricFrames, metricId);

/**
 * The navigated point's live sample: the followed trial's running objective
 * until its own event lands, then whatever point the navigation refines.
 * Null while the stream has no value.
 */
export const navigatedSurfaceSample = ({
  selection,
  trials,
  metricId,
  xAxis,
  yAxis,
  positions,
}: {
  selection: OptimizationSelectionStream | null;
  trials: readonly PetrinautOptimizationTrialEvent[];
  metricId: string;
  xAxis: OptimizationSurfaceAxis;
  yAxis: OptimizationSurfaceAxis;
  positions: Readonly<Record<string, number>>;
}): SurfaceSample | null => {
  if (selection === null) {
    return null;
  }
  const value = selectionSurfaceValue(selection, metricId);
  if (value === null) {
    return null;
  }
  const trial = followedTrial(selection.key);
  if (trial !== null && trials.some((event) => event.trial === trial)) {
    return null;
  }
  return {
    x: surfaceGridCoordinate(xAxis, positions[xAxis.identifier] ?? 0),
    y: surfaceGridCoordinate(yAxis, positions[yAxis.identifier] ?? 0),
    value,
  };
};

/** The trials' field with the live sample laid over it. */
export const withNavigatedSample = (
  values: ReadonlyMap<string, number>,
  sample: SurfaceSample | null,
): ReadonlyMap<string, number> =>
  sample === null
    ? values
    : new Map([
        ...values,
        [contourSurfaceKey(sample.x, sample.y), sample.value],
      ]);

/**
 * Whether the plot navigates. While the study runs and the navigation follows
 * its steps, the optimizer chooses the points and the plot only displays;
 * otherwise a click or drag picks a point.
 */
export type SurfaceInteraction = "following" | "navigable";

export const surfaceInteraction = (
  optimization: Pick<OptimizationRecord, "status">,
  navigation: Pick<OptimizationNavigation, "followTrials">,
): SurfaceInteraction =>
  isOptimizationActive(optimization) && navigation.followTrials
    ? "following"
    : "navigable";

/** The caption's state line for a connected study's surface. */
export const describeSurfaceState = ({
  trials,
  best,
  interaction,
  selection,
}: {
  trials: readonly PetrinautOptimizationTrialEvent[];
  best: OptimizationBest | null;
  interaction: SurfaceInteraction;
  selection: OptimizationSelectionStream | null;
}): string => {
  const count = trials.length;
  const steps = `${count} ${count === 1 ? "step" : "steps"}`;
  if (interaction === "following") {
    return [
      count === 0 ? "no steps placed yet" : `${steps} placed`,
      ...(best === null ? [] : [`best ${formatAxisValue(best.objective)}`]),
      "dots are the study's steps, the best highlighted; the optimizer is choosing the next point",
    ].join(" · ");
  }
  const refining =
    selection !== null &&
    selection.computing &&
    followedTrial(selection.key) === null
      ? selection.runTarget === null
        ? `refining the picked point: ${selection.runsCompleted} runs`
        : `refining the picked point: ${selection.runsCompleted} of ${selection.runTarget} runs`
      : null;
  return [
    steps,
    ...(refining === null ? [] : [refining]),
    "drag or click to refine a point",
  ].join(" · ");
};

export const OptimizationSurfacePlot = ({
  axes,
  view,
  onViewChange,
  positions,
  values,
  markers,
  sampleMarks,
  contentKey,
  onPick,
  caption,
  children,
}: {
  axes: readonly OptimizationSurfaceAxis[];
  view: OptimizationSurfaceView;
  onViewChange: (view: OptimizationSurfaceView) => void;
  /** A position per axis; the navigation marker sits at the shown pair. */
  positions: Readonly<Record<string, number>>;
  values: ContourSurfaceValues;
  /** The data markers; the navigation marker is added here. */
  markers: readonly ContourSurfaceMarker[];
  sampleMarks: ContourSurfaceSampleMarks;
  /** Identity of the plotted field; a change drops the dimmed previous picture. */
  contentKey: string;
  /**
   * The X and Y positions a click or drag on the plot picked. Undefined
   * makes the plot display-only.
   */
  onPick: ((positions: Record<string, number>) => void) | undefined;
  /** The state line under the plot, outside a drag. */
  caption: string;
  /** Rows between the axis selects and the plot. */
  children?: ReactNode;
}) => {
  const [preview, setPreview] = useState<ContourSurfaceFraction | null>(null);
  const xAxis = axes.find((axis) => axis.identifier === view.xAxisId);
  const yAxis = axes.find((axis) => axis.identifier === view.yAxisId);

  const handlePickFraction =
    onPick && xAxis && yAxis
      ? (fraction: ContourSurfaceFraction) =>
          onPick({
            [xAxis.identifier]: Math.round(fraction.x * xAxis.stepCount),
            [yAxis.identifier]: Math.round(fraction.y * yAxis.stepCount),
          })
      : undefined;

  /** The axis readout a plot fraction lands on. */
  const readoutAt = (axis: OptimizationSurfaceAxis, fraction: number): string =>
    `${axis.identifier} = ${formatAxisValue(
      optimizationAxisValueAt(axis, Math.round(fraction * axis.stepCount)),
    )}`;

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
          contentKey={contentKey}
          values={values}
          markers={[
            ...markers,
            {
              x: surfaceGridCoordinate(xAxis, positions[xAxis.identifier] ?? 0),
              y: surfaceGridCoordinate(yAxis, positions[yAxis.identifier] ?? 0),
              kind: "navigation",
            },
          ]}
          sampleMarks={sampleMarks}
          onPickFraction={handlePickFraction}
          onPreviewFraction={handlePickFraction ? setPreview : undefined}
          aria-label="Optimization surface"
        />
      ) : null}
      <SurfaceCaption
        preview={
          preview && xAxis && yAxis
            ? { x: readoutAt(xAxis, preview.x), y: readoutAt(yAxis, preview.y) }
            : null
        }
        text={caption}
      />
    </SurfaceFrame>
  );
};
