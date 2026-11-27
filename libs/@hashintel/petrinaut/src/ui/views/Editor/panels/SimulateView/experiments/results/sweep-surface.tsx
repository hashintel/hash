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
import { useState } from "react";

import { Select } from "@hashintel/ds-components";

import {
  axisDisplayName,
  axisStep,
  axisValueAt,
} from "../../../../../../../react/experiments/parameter-grid";
import { ChartCard } from "./chart-card";
import { formatAxisValue } from "./format-axis-value";
import { surfaceAxisPosition } from "./sweep-surface/surface-field";
import {
  SurfaceAxisControls,
  SurfaceControlLabel,
  SurfaceReadOnlyMark,
} from "./sweep-surface/surface-frame";
import {
  SURFACE_FOOTER_TWO_ROW_HEIGHT,
  SURFACE_PLOT_HEIGHT,
  surfaceCaption,
} from "./sweep-surface/surface-frame-layout";
import { SweepSurfacePlot } from "./sweep-surface/sweep-surface-plot";
import { describeVisitedSurface } from "./sweep-surface/visited-field";

import type { ExperimentRecord } from "../../../../../../../react/experiments/context";
import type { ExperimentParameterAxis } from "../../../../../../../react/experiments/parameter-grid";
import type { ChartCardTone } from "./chart-card";
import type { ContourSurfaceFraction } from "./sweep-surface/contour-surface";

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

  /** The axis readout a plot fraction lands on. */
  const readoutAt = (axis: ExperimentParameterAxis, fraction: number): string =>
    `${axisDisplayName(axis)} = ${formatAxisValue(
      axisValueAt(axis, surfaceAxisPosition(axis, fraction)),
      axisStep(axis),
    )}`;

  return (
    <ChartCard
      title="Surface"
      help="Compare the metric across two parameters. Dots mark sampled points; the shading estimates values between them. Click or drag to sample a point."
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
      {xAxis && yAxis && xAxis !== yAxis ? (
        <SweepSurfacePlot
          experimentId={experiment.id}
          sweep={sweep}
          axes={axes}
          xAxis={xAxis}
          yAxis={yAxis}
          metricId={metricId}
          readOnly={readOnly}
          onPreview={setPreview}
        />
      ) : null}
    </ChartCard>
  );
};
