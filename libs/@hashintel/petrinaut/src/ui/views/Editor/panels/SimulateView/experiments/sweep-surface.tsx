/**
 * The sweep surface: a contour of one metric's final value over two swept
 * parameters, filling in live as points are sampled.
 *
 * This component owns the sampling: while it is open, it walks an X×Y
 * sub-grid of the two shown parameters coarse-to-fine through the sweep's
 * background lane (8 runs per point), so the coarse shape of the surface
 * appears within the first few points and sharpens from there. Parameters
 * outside the two shown axes hold at the middle of their selected ranges —
 * moving them restarts the walk for the new slice — and clicking the plot
 * collapses both shown parameters to a point at the clicked position.
 * Rendering itself is `ContourSurface`, which is purely presentational.
 */
import { use, useEffect, useState } from "react";

import { Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import {
  coarseToFineOrder,
  sweepCellObjective,
} from "../../../../../../react/experiments/contour-grid";
import {
  ContourSurface,
  contourSurfaceKey,
} from "../../../../../components/contour-surface";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type { ExperimentParameterAxis } from "../../../../../../react/experiments/parameter-grid";
import type { ContourSurfaceValues } from "../../../../../components/contour-surface";

/** Runs a surface point needs before it appears. */
const SURFACE_CELL_RUNS = 8;

/**
 * Sampled positions per axis on the surface's sub-grid: a subset of the
 * slider's quantization, coarse enough that a full X×Y sweep at
 * `SURFACE_CELL_RUNS` stays affordable while the picture keeps filling in.
 */
const SURFACE_GRID_POSITIONS = 11;

/** Evenly spread quantized positions of `axis` shown on the surface. */
function surfacePositions(axis: ExperimentParameterAxis): number[] {
  const count = Math.min(SURFACE_GRID_POSITIONS, axis.stepCount + 1);
  const positions = Array.from({ length: count }, (_, index) =>
    Math.round((index * axis.stepCount) / (count - 1)),
  );
  return [...new Set(positions)];
}

const surfaceStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const controlsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexWrap: "wrap",
  // Compact inline controls; the ds Select otherwise stretches to the row.
  "& [data-scope='select']": { width: "[170px]" },
});

const controlLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s120",
  flexShrink: 0,
});

const captionStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
});

/**
 * The navigator's slice for every axis not shown on the surface: the middle
 * of its selected range (the range itself when it is a point).
 */
function fixedPositionsKey(
  experiment: ExperimentRecord,
  xAxis: string,
  yAxis: string,
): string {
  return experiment.parameterAxes
    .filter((axis) => axis.identifier !== xAxis && axis.identifier !== yAxis)
    .map((axis) => {
      const range = experiment.sweep?.selection[axis.identifier];
      const position = range ? Math.round((range.from + range.to) / 2) : 0;
      return `${axis.identifier}=${position}`;
    })
    .join("|");
}

export const SweepSurface = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const { sampleSweepCell, setSweepSelection } = use(ExperimentsContext);
  const axes = experiment.parameterAxes;
  const [xAxisId, setXAxisId] = useState(axes[0]?.identifier ?? "");
  const [yAxisId, setYAxisId] = useState(axes[1]?.identifier ?? "");
  const [metricId, setMetricId] = useState(experiment.metricSpecs[0]?.id ?? "");
  const [cellValues, setCellValues] = useState<ContourSurfaceValues>(new Map());
  const [walkKey, setWalkKey] = useState("");

  const xAxis = axes.find((axis) => axis.identifier === xAxisId);
  const yAxis = axes.find((axis) => axis.identifier === yAxisId);
  const slice = fixedPositionsKey(experiment, xAxisId, yAxisId);
  const experimentId = experiment.id;
  const sweepSelection = experiment.sweep?.selection;

  // A new slice/axes/metric identity restarts the walk; clearing the sampled
  // values during render (not in the effect) repaints without a stale frame.
  const nextWalkKey = `${experimentId}|${xAxisId}|${yAxisId}|${metricId}|${slice}`;
  if (walkKey !== nextWalkKey) {
    setWalkKey(nextWalkKey);
    setCellValues(new Map());
  }

  // The sampling walk: restarts whenever the slice, the shown axes, or the
  // metric changes; stops when the section unmounts.
  useEffect(() => {
    if (!xAxis || !yAxis || xAxis === yAxis || metricId === "") {
      return;
    }
    const walk: { stale: boolean } = { stale: false };
    // Read through a call so the flow analysis cannot pin the flag to its
    // initial value: cleanup flips it from outside this closure.
    const isWalkStale = () => walk.stale;

    const fixedEntries = slice
      .split("|")
      .filter((entry) => entry !== "")
      .map((entry) => entry.split("=") as [string, string]);

    const xPositions = surfacePositions(xAxis);
    const yPositions = surfacePositions(yAxis);
    const run = async () => {
      for (const cell of coarseToFineOrder(
        xPositions.length,
        yPositions.length,
      )) {
        if (isWalkStale()) {
          return;
        }
        const position: Record<string, number> = {
          [xAxis.identifier]: xPositions[cell.x]!,
          [yAxis.identifier]: yPositions[cell.y]!,
        };
        for (const [identifier, positionText] of fixedEntries) {
          position[identifier] = Number(positionText);
        }

        const snapshot = await sampleSweepCell(
          experimentId,
          position,
          SURFACE_CELL_RUNS,
        );
        if (isWalkStale()) {
          return;
        }
        if (snapshot) {
          const value = sweepCellObjective(snapshot.metricFrames, metricId);
          if (value !== null) {
            setCellValues((previous) => {
              const next = new Map(previous);
              next.set(contourSurfaceKey(cell.x, cell.y), value);
              return next;
            });
          }
        }
      }
    };
    void run();

    return () => {
      walk.stale = true;
    };
  }, [axes, experimentId, metricId, sampleSweepCell, slice, xAxis, yAxis]);

  if (axes.length < 2 || !experiment.sweep) {
    return null;
  }

  const axisOptions = axes.map((axis) => ({
    value: axis.identifier,
    text: axis.identifier,
  }));
  const metricOptions = experiment.metricSpecs.map((spec) => ({
    value: spec.id,
    text: spec.label,
  }));

  const handleClickFraction = (fractionX: number, fractionY: number) => {
    if (!xAxis || !yAxis || !sweepSelection) {
      return;
    }
    // Clicking collapses both shown axes to a point at the clicked position.
    const xPosition = Math.round(fractionX * xAxis.stepCount);
    const yPosition = Math.round(fractionY * yAxis.stepCount);
    setSweepSelection(experimentId, {
      ...sweepSelection,
      [xAxis.identifier]: { from: xPosition, to: xPosition },
      [yAxis.identifier]: { from: yPosition, to: yPosition },
    });
  };

  const sampledCount = cellValues.size;
  const totalCells =
    xAxis && yAxis
      ? surfacePositions(xAxis).length * surfacePositions(yAxis).length
      : 0;

  return (
    <div className={surfaceStyle}>
      <div className={controlsStyle}>
        <span className={controlLabelStyle}>X</span>
        <Select
          size="xs"
          aria-label="Surface X parameter"
          items={axisOptions.filter((option) => option.value !== yAxisId)}
          value={xAxisId}
          onChange={(value) => setXAxisId(value ?? "")}
        />
        <span className={controlLabelStyle}>Y</span>
        <Select
          size="xs"
          aria-label="Surface Y parameter"
          items={axisOptions.filter((option) => option.value !== xAxisId)}
          value={yAxisId}
          onChange={(value) => setYAxisId(value ?? "")}
        />
        <span className={controlLabelStyle}>Metric</span>
        <Select
          size="xs"
          aria-label="Surface metric"
          items={metricOptions}
          value={metricId}
          onChange={(value) => setMetricId(value ?? "")}
        />
      </div>
      {xAxis && yAxis ? (
        <ContourSurface
          nx={surfacePositions(xAxis).length}
          ny={surfacePositions(yAxis).length}
          values={cellValues}
          onClickFraction={handleClickFraction}
          aria-label="Sweep surface"
        />
      ) : null}
      <span className={captionStyle}>
        {sampledCount} of {totalCells} points sampled at {SURFACE_CELL_RUNS}+
        runs · click to navigate
      </span>
    </div>
  );
};
