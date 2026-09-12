/**
 * The sweep surface: a contour of one metric's final value over two swept
 * parameters, drawn from the points the sweep has computed. Every visited
 * point is a dot with its value, the field is interpolated between them, and
 * the point being computed is a ring, which the fold turns into a dot.
 * Nothing samples on its own: the surface fills in as the navigator's
 * controls, a pick on the plot, or an optimizer move the selection. Picking
 * a point collapses every parameter to a point — the two shown ones to the
 * pick, the others to the middle of their ranges; while an optimizer drives
 * the sweep the plot only displays.
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
import { ChartCard } from "../shared/chart-card";
import { formatAxisValue } from "../shared/format-axis-value";
import {
  mergeSurfaceFields,
  surfaceAxisPosition,
  surfaceGridCoordinate,
} from "../shared/surface-field";
import {
  SURFACE_FOOTER_TWO_ROW_HEIGHT,
  SURFACE_PLOT_HEIGHT,
  SurfaceAxisControls,
  surfaceCaption,
  SurfaceControlLabel,
  SurfaceReadOnlyMark,
} from "../shared/surface-frame";
import { surfaceColumnCount } from "../shared/surface-sampling";
import {
  computingSurfaceField,
  describeVisitedSurface,
  isPointSelection,
  visitedSurfaceField,
} from "./sweep-surface/visited-field";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type {
  ExperimentParameterAxis,
  SweepAxisSelection,
} from "../../../../../../react/experiments/parameter-grid";
import type { ContourSurfaceFraction } from "../../../../../components/contour-surface";
import type { ChartCardTone } from "../shared/chart-card";

export const SweepSurface = ({
  experiment,
  following,
  disabled = false,
  tone,
}: {
  experiment: ExperimentRecord;
  /** An optimizer moves the selection: the plot displays and never picks. */
  following: boolean;
  /** The plot only displays: the sweep was cancelled and nothing computes for a pick. */
  disabled?: boolean;
  tone?: ChartCardTone;
}) => {
  const readOnly = following || disabled;
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
    setSweepSelection(experiment.id, picked);
  };

  /** The axis readout a plot fraction lands on. */
  const readoutAt = (axis: ExperimentParameterAxis, fraction: number): string =>
    `${axisDisplayName(axis)} = ${formatAxisValue(
      axisValueAt(axis, surfaceAxisPosition(axis, fraction)),
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
            computing: sweep.computing,
          }),
        )
      : null;

  return (
    <ChartCard
      title="Surface"
      subtitle={surfaceCaption({
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
          pointSelection: isPointSelection(selection, axes),
          runsCompleted: sweep.runsCompleted,
          runTarget: sweep.runTarget,
          following,
        }),
      })}
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
          disabled={readOnly}
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
            disabled={readOnly}
          />
          {readOnly ? (
            <SurfaceReadOnlyMark
              reason={following ? "following" : "disabled"}
            />
          ) : null}
        </SurfaceAxisControls>
      }
      tone={tone}
    >
      {xAxis && yAxis && field ? (
        <ContourSurface
          nx={surfaceColumnCount(xAxis)}
          ny={surfaceColumnCount(yAxis)}
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
          onPickFraction={readOnly ? undefined : handlePickFraction}
          onPreviewFraction={readOnly ? undefined : setPreview}
          readOnly={readOnly}
          aria-label="Sweep surface"
        />
      ) : null}
    </ChartCard>
  );
};
