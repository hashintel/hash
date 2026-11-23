import { use } from "react";

import { ExperimentsActionsContext } from "../../../../../../../react/experiments/context";
import { selectionMidpoint } from "../../../../../../../react/experiments/parameter-grid";
import { ContourSurface } from "./contour-surface";
import {
  mergeSurfaceFields,
  surfaceAxisPosition,
  surfaceGridCoordinate,
} from "./surface-field";
import { SURFACE_PLOT_HEIGHT } from "./surface-frame-layout";
import { surfaceColumnCount } from "./surface-sampling";
import { computingSurfaceField, visitedSurfaceField } from "./visited-field";

import type { ExperimentRecord } from "../../../../../../../react/experiments/context";
import type {
  ExperimentParameterAxis,
  SweepAxisSelection,
} from "../../../../../../../react/experiments/parameter-grid";
import type { ContourSurfaceFraction } from "./contour-surface";

/**
 * The contour of the visited points. A component of its own so that the field
 * is rebuilt when the sweep or a picker changes, and not when the pointer
 * moves over the plot.
 */
export const SweepSurfacePlot = ({
  experimentId,
  sweep,
  axes,
  xAxis,
  yAxis,
  metricId,
  readOnly,
  onPreview,
}: {
  experimentId: string;
  sweep: NonNullable<ExperimentRecord["sweep"]>;
  axes: readonly ExperimentParameterAxis[];
  xAxis: ExperimentParameterAxis;
  yAxis: ExperimentParameterAxis;
  metricId: string;
  readOnly: boolean;
  onPreview: (fraction: ContourSurfaceFraction | null) => void;
}) => {
  const { setSweepSelection } = use(ExperimentsActionsContext);
  const { selection } = sweep;

  const handlePickFraction = (fraction: ContourSurfaceFraction) => {
    const picked: Record<string, SweepAxisSelection> = {};
    for (const axis of axes) {
      const position =
        axis === xAxis
          ? surfaceAxisPosition(xAxis, fraction.x)
          : axis === yAxis
            ? surfaceAxisPosition(yAxis, fraction.y)
            : Math.round(selectionMidpoint(selection, axis));
      picked[axis.identifier] = { from: position, to: position };
    }
    setSweepSelection(experimentId, picked);
  };

  const field = mergeSurfaceFields(
    visitedSurfaceField({
      visited: sweep.visited,
      xAxis,
      yAxis,
      metricId,
      selection,
    }),
    computingSurfaceField({
      selection,
      axes,
      xAxis,
      yAxis,
      computing: sweep.computing,
    }),
  );

  return (
    <ContourSurface
      nx={surfaceColumnCount(xAxis)}
      ny={surfaceColumnCount(yAxis)}
      height={SURFACE_PLOT_HEIGHT}
      contentKey={`${xAxis.identifier}|${yAxis.identifier}|${metricId}`}
      values={field.values}
      sampleMarks="none"
      markers={[
        ...field.markers,
        // Where the navigator sits.
        {
          x: surfaceGridCoordinate(xAxis, selectionMidpoint(selection, xAxis)),
          y: surfaceGridCoordinate(yAxis, selectionMidpoint(selection, yAxis)),
          kind: "navigation",
        },
      ]}
      onPickFraction={readOnly ? undefined : handlePickFraction}
      onPreviewFraction={readOnly ? undefined : onPreview}
      readOnly={readOnly}
      aria-label="Sweep surface"
    />
  );
};
