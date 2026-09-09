/**
 * The sweep surface: a contour of one metric's final value over two swept
 * parameters, filling in live as points are sampled.
 *
 * While open, it samples an X×Y sub-grid of the two shown parameters in
 * quad-tree order — level-aligned chunks, several in flight — through the
 * sweep's background lane, so a complete coarse picture lands first and
 * sharpens from there. Every metric's value comes back per cell, so
 * switching the shown metric re-reads the same samples. Parameters outside
 * the two shown axes hold at the middle of their selected ranges; moving them
 * restarts the sampling for the new slice. Picking a point on the plot
 * collapses both shown parameters to it.
 */
import { use, useState } from "react";

import { Select } from "@hashintel/ds-components";

import { ExperimentsActionsContext } from "../../../../../../react/experiments/context";
import {
  axisStep,
  axisValueAt,
} from "../../../../../../react/experiments/parameter-grid";
import { ContourSurface } from "../../../../../components/contour-surface";
import { formatAxisValue } from "../shared/format-axis-value";
import {
  describeSurfaceSampling,
  SurfaceAxisControls,
  SurfaceCaption,
  SurfaceControlLabel,
  SurfaceFrame,
} from "../shared/surface-frame";
import {
  quadTreeChunks,
  SURFACE_CELL_RUNS,
  surfacePositions,
} from "../shared/surface-sampling";
import { useSurfaceWalk } from "../shared/use-surface-walk";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type { ExperimentParameterAxis } from "../../../../../../react/experiments/parameter-grid";
import type {
  ContourSurfaceFraction,
  ContourSurfaceValues,
} from "../../../../../components/contour-surface";

/**
 * Cells per sampling request. Small enough that the first chunk paints the
 * coarse shape quickly, big enough that a full grid is a handful of requests
 * — each one batched experiment where the scenario allows it.
 */
const SURFACE_CHUNK_CELLS = 24;

/**
 * Chunks in flight at once. Wide background lanes each take a third of the
 * worker pool, so three of them fill it.
 */
const SURFACE_LANES = 3;

/** Per-cell values of every metric, keyed by metric id. */
type CellMetrics = Readonly<Record<string, number>>;

/**
 * The navigator's slice for every axis not shown on the surface: the middle
 * of its selected range, as `identifier=position` entries.
 */
const fixedPositions = (
  experiment: ExperimentRecord,
  xAxisId: string,
  yAxisId: string,
): [string, number][] =>
  experiment.parameterAxes
    .filter(
      (axis) => axis.identifier !== xAxisId && axis.identifier !== yAxisId,
    )
    .map((axis) => {
      const range = experiment.sweep?.selection[axis.identifier];
      return [
        axis.identifier,
        range ? Math.round((range.from + range.to) / 2) : 0,
      ];
    });

/**
 * The surface-grid index of the sampled position nearest the selection's
 * midpoint. Sub-sampled integer axes round to uneven spacing, so the marker
 * finds the nearest sampled position rather than scaling a fraction.
 */
const nearestGridIndex = (
  axis: ExperimentParameterAxis,
  range: { from: number; to: number } | undefined,
): number => {
  if (!range) {
    return 0;
  }
  const midpoint = (range.from + range.to) / 2;
  const positions = surfacePositions(axis);
  let nearest = 0;
  for (const [index, position] of positions.entries()) {
    if (
      Math.abs(position - midpoint) < Math.abs(positions[nearest]! - midpoint)
    ) {
      nearest = index;
    }
  }
  return nearest;
};

export const SweepSurface = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const { sampleSurfaceCells, setSweepSelection } = use(
    ExperimentsActionsContext,
  );
  const axes = experiment.parameterAxes;
  const [xAxisId, setXAxisId] = useState(axes[0]?.identifier ?? "");
  const [yAxisId, setYAxisId] = useState(axes[1]?.identifier ?? "");
  const [metricId, setMetricId] = useState(experiment.metricSpecs[0]?.id ?? "");
  const [preview, setPreview] = useState<ContourSurfaceFraction | null>(null);

  const xAxis = axes.find((axis) => axis.identifier === xAxisId);
  const yAxis = axes.find((axis) => axis.identifier === yAxisId);
  const experimentId = experiment.id;
  const sweepSelection = experiment.sweep?.selection;
  const slice = fixedPositions(experiment, xAxisId, yAxisId);

  // A metric change does not restart the walk: every metric's value is
  // already in the samples.
  const walkKey = `${experimentId}|${xAxisId}|${yAxisId}|${slice
    .map(([identifier, position]) => `${identifier}=${position}`)
    .join("|")}`;
  const cellMetrics = useSurfaceWalk<CellMetrics>({
    walkKey,
    lanes: SURFACE_LANES,
    buildWalk: () => {
      if (!xAxis || !yAxis || xAxis === yAxis) {
        return null;
      }
      const xPositions = surfacePositions(xAxis);
      const yPositions = surfacePositions(yAxis);
      return {
        chunks: quadTreeChunks(
          xPositions.length,
          yPositions.length,
          SURFACE_CHUNK_CELLS,
        ),
        sample: (chunk, onPartial) =>
          sampleSurfaceCells(
            experimentId,
            chunk.map((cell) => ({
              ...Object.fromEntries(slice),
              [xAxis.identifier]: xPositions[cell.x]!,
              [yAxis.identifier]: yPositions[cell.y]!,
            })),
            SURFACE_CELL_RUNS,
            onPartial,
          ),
      };
    },
  });

  if (axes.length < 2 || !experiment.sweep) {
    return null;
  }

  const handlePickFraction = (fraction: ContourSurfaceFraction) => {
    if (!xAxis || !yAxis || !sweepSelection) {
      return;
    }
    const xPosition = Math.round(fraction.x * xAxis.stepCount);
    const yPosition = Math.round(fraction.y * yAxis.stepCount);
    setSweepSelection(experimentId, {
      ...sweepSelection,
      [xAxis.identifier]: { from: xPosition, to: xPosition },
      [yAxis.identifier]: { from: yPosition, to: yPosition },
    });
  };

  /** The axis readout a plot fraction lands on. */
  const readoutAt = (axis: ExperimentParameterAxis, fraction: number): string =>
    `${axis.identifier} = ${formatAxisValue(
      axisValueAt(axis, Math.round(fraction * axis.stepCount)),
      axisStep(axis),
    )}`;

  const cellValues: ContourSurfaceValues = new Map(
    [...cellMetrics].flatMap(([key, metrics]) => {
      const value = metrics[metricId];
      return value === undefined ? [] : [[key, value] as [string, number]];
    }),
  );
  const totalCells =
    xAxis && yAxis
      ? surfacePositions(xAxis).length * surfacePositions(yAxis).length
      : 0;

  return (
    <SurfaceFrame>
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
      {xAxis && yAxis ? (
        <ContourSurface
          nx={surfacePositions(xAxis).length}
          ny={surfacePositions(yAxis).length}
          contentKey={`${xAxisId}|${yAxisId}|${metricId}`}
          values={cellValues}
          markers={[
            // Where the navigator sits on this slice.
            {
              x: nearestGridIndex(xAxis, sweepSelection?.[xAxis.identifier]),
              y: nearestGridIndex(yAxis, sweepSelection?.[yAxis.identifier]),
              kind: "navigation",
            },
          ]}
          onPickFraction={handlePickFraction}
          onPreviewFraction={setPreview}
          aria-label="Sweep surface"
        />
      ) : null}
      <SurfaceCaption
        preview={
          preview && xAxis && yAxis
            ? { x: readoutAt(xAxis, preview.x), y: readoutAt(yAxis, preview.y) }
            : null
        }
        text={describeSurfaceSampling({
          sampledCount: cellValues.size,
          totalCells,
          runsPerCell: SURFACE_CELL_RUNS,
        })}
      />
    </SurfaceFrame>
  );
};
