/**
 * The sweep surface: a contour of one metric's final value over two swept
 * parameters, drawn from the points the sweep has computed. Every visited
 * point is a dot with its value, the field is interpolated between them, and
 * the point being computed is a ring whose running value enters the field as
 * its runs complete. Nothing samples on its own: the surface fills in as the
 * navigator's controls, a pick on the plot, or an optimizer move the
 * selection. Picking a point collapses both shown parameters to it; while an
 * optimizer drives the sweep the plot only displays.
 */
import { use, useState } from "react";

import { Select } from "@hashintel/ds-components";

import { ExperimentsActionsContext } from "../../../../../../react/experiments/context";
import {
  axisDisplayName,
  axisStep,
  axisValueAt,
  selectionMidpoint,
} from "../../../../../../react/experiments/parameter-grid";
import { ContourSurface } from "../../../../../components/contour-surface";
import { formatAxisValue } from "../shared/format-axis-value";
import {
  mergeSurfaceFields,
  surfaceGridCoordinate,
} from "../shared/surface-field";
import {
  SURFACE_FOOTER_TWO_ROW_HEIGHT,
  SURFACE_PLOT_HEIGHT,
  SurfaceAxisControls,
  surfaceCaption,
  SurfaceControlLabel,
  SurfaceFrame,
} from "../shared/surface-frame";
import { surfacePositions } from "../shared/surface-sampling";
import {
  computingSurfaceField,
  describeVisitedSurface,
  visitedSurfaceField,
} from "./sweep-surface/visited-field";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type { ExperimentParameterAxis } from "../../../../../../react/experiments/parameter-grid";
import type { ContourSurfaceFraction } from "../../../../../components/contour-surface";
import type { ChartCardTone } from "../shared/chart-card";
import type { ReactNode } from "react";

export const SweepSurface = ({
  experiment,
  following = false,
  tone,
  actions,
}: {
  experiment: ExperimentRecord;
  /** An optimizer moves the selection: the plot displays and never picks. */
  following?: boolean;
  tone?: ChartCardTone;
  /** The header's right side, e.g. a help tooltip. */
  actions?: ReactNode;
}) => {
  const { setSweepSelection } = use(ExperimentsActionsContext);
  const axes = experiment.parameterAxes;
  const [xAxisId, setXAxisId] = useState(axes[0]?.identifier ?? "");
  const [yAxisId, setYAxisId] = useState(axes[1]?.identifier ?? "");
  const [metricId, setMetricId] = useState(experiment.metricSpecs[0]?.id ?? "");
  const [preview, setPreview] = useState<ContourSurfaceFraction | null>(null);

  const xAxis = axes.find((axis) => axis.identifier === xAxisId);
  const yAxis = axes.find((axis) => axis.identifier === yAxisId);
  const { sweep } = experiment;

  if (axes.length < 2 || !sweep) {
    return null;
  }
  const { selection } = sweep;

  const handlePickFraction = (fraction: ContourSurfaceFraction) => {
    if (!xAxis || !yAxis) {
      return;
    }
    const xPosition = Math.round(fraction.x * xAxis.stepCount);
    const yPosition = Math.round(fraction.y * yAxis.stepCount);
    setSweepSelection(experiment.id, {
      ...selection,
      [xAxis.identifier]: { from: xPosition, to: xPosition },
      [yAxis.identifier]: { from: yPosition, to: yPosition },
    });
  };

  /** The axis readout a plot fraction lands on. */
  const readoutAt = (axis: ExperimentParameterAxis, fraction: number): string =>
    `${axisDisplayName(axis)} = ${formatAxisValue(
      axisValueAt(axis, Math.round(fraction * axis.stepCount)),
      axisStep(axis),
    )}`;

  const field =
    xAxis && yAxis && xAxis !== yAxis
      ? mergeSurfaceFields(
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
            metricId,
            computing: sweep.computing,
            metricFrames: experiment.metricFrames,
          }),
        )
      : null;

  return (
    <SurfaceFrame
      title="Surface"
      caption={surfaceCaption({
        preview:
          preview && xAxis && yAxis
            ? {
                x: readoutAt(xAxis, preview.x),
                y: readoutAt(yAxis, preview.y),
              }
            : null,
        text: describeVisitedSurface({
          visitedCount: sweep.visited.length,
          computing: sweep.computing,
          runsCompleted: sweep.runsCompleted,
          runTarget: sweep.runTarget,
          following,
        }),
      })}
      actions={actions}
      bodyHeight={SURFACE_PLOT_HEIGHT}
      // The axis selects on one row, the metric select on the next.
      footerHeight={SURFACE_FOOTER_TWO_ROW_HEIGHT}
      footer={
        <SurfaceAxisControls
          axes={axes}
          xAxisId={xAxisId}
          yAxisId={yAxisId}
          onXAxisIdChange={setXAxisId}
          onYAxisIdChange={setYAxisId}
        >
          <SurfaceControlLabel>Metric</SurfaceControlLabel>
          <Select
            size="xs"
            aria-label="Surface metric"
            items={experiment.metricSpecs.map((spec) => ({
              value: spec.id,
              text: spec.label,
            }))}
            value={metricId}
            onChange={(value) => setMetricId(value ?? "")}
          />
        </SurfaceAxisControls>
      }
      tone={tone}
    >
      {xAxis && yAxis && field ? (
        <ContourSurface
          nx={surfacePositions(xAxis).length}
          ny={surfacePositions(yAxis).length}
          height={SURFACE_PLOT_HEIGHT}
          contentKey={`${xAxisId}|${yAxisId}|${metricId}`}
          values={field.values}
          sampleMarks="none"
          markers={[
            ...field.markers,
            // Where the navigator sits.
            {
              x: surfaceGridCoordinate(
                xAxis,
                selectionMidpoint(selection, xAxis),
              ),
              y: surfaceGridCoordinate(
                yAxis,
                selectionMidpoint(selection, yAxis),
              ),
              kind: "navigation",
            },
          ]}
          onPickFraction={following ? undefined : handlePickFraction}
          onPreviewFraction={following ? undefined : setPreview}
          aria-label="Sweep surface"
        />
      ) : null}
    </SurfaceFrame>
  );
};
