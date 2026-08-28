/**
 * The sweep surface: an Optuna-style filled contour of one metric's final
 * value over two swept parameters, filling in live as combinations are
 * sampled.
 *
 * The view drives the sampling: while it is open, it walks the X×Y grid
 * coarse-to-fine through the sweep's background lane (8 runs per cell), so
 * the coarse shape of the surface appears within the first few cells and
 * sharpens from there. Parameters outside the two shown axes stay at the
 * navigator's values — moving them restarts the walk for the new slice, the
 * navigator's own refinements flow in as deeper samples of their cells, and
 * clicking the surface moves the navigator to the nearest combination.
 */
import { use, useEffect, useRef, useState } from "react";

import { Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import {
  bluesColor,
  coarseToFineOrder,
  contourLevels,
  idwRaster,
  marchingSquaresSegments,
  sweepCellObjective,
} from "../../../../../../react/experiments/contour-grid";
import { useElementSize } from "../../../../../../react/hooks/use-element-size";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type { ContourSample } from "../../../../../../react/experiments/contour-grid";
import type { ExperimentParameterAxis } from "../../../../../../react/experiments/parameter-grid";

/** Runs a surface cell needs before its point appears. */
const SURFACE_CELL_RUNS = 8;

/**
 * Sampled positions per axis on the surface: a sub-grid of the slider's
 * quantization, coarse enough that a full X×Y sweep at `SURFACE_CELL_RUNS`
 * stays affordable while the picture keeps filling in.
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

/** Raster resolution per grid cell, in pixels of interpolation lattice. */
const RASTER_SUBDIVISION = 8;

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

const canvasFrameStyle = css({
  position: "relative",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  overflow: "hidden",
  backgroundColor: "neutral.s00",
});

const canvasStyle = css({
  display: "block",
  width: "[100%]",
  height: "[280px]",
  cursor: "crosshair",
});

const captionStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
});

type SurfaceValues = ReadonlyMap<string, number>;

function surfaceCellKey(xIndex: number, yIndex: number): string {
  return `${xIndex},${yIndex}`;
}

/**
 * The navigator's position for every axis not shown on the surface: the
 * middle of its selected range (the range itself when it is a point).
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

function drawSurface(options: {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  nx: number;
  ny: number;
  values: SurfaceValues;
}): void {
  const { canvas, width, height, nx, ny, values } = options;
  const pixelRatio = globalThis.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * pixelRatio));
  canvas.height = Math.max(1, Math.round(height * pixelRatio));
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, width, height);

  const samples: ContourSample[] = [];
  for (const [key, value] of values) {
    const [x = 0, y = 0] = key.split(",").map(Number);
    samples.push({ x, y, value });
  }
  if (samples.length === 0) {
    return;
  }

  const rasterWidth = Math.max(2, (nx - 1) * RASTER_SUBDIVISION + 1);
  const rasterHeight = Math.max(2, (ny - 1) * RASTER_SUBDIVISION + 1);
  const raster = idwRaster({
    samples,
    nx,
    ny,
    width: rasterWidth,
    height: rasterHeight,
  });

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    min = Math.min(min, sample.value);
    max = Math.max(max, sample.value);
  }

  const cellWidth = width / (rasterWidth - 1);
  const cellHeight = height / (rasterHeight - 1);
  const span = max - min;

  // Filled bands: each raster point painted by its normalized value.
  for (let py = 0; py < rasterHeight - 1; py++) {
    for (let px = 0; px < rasterWidth - 1; px++) {
      const value = raster[py * rasterWidth + px]!;
      context.fillStyle = bluesColor(span > 0 ? (value - min) / span : 0.5);
      context.fillRect(
        px * cellWidth,
        py * cellHeight,
        cellWidth + 1,
        cellHeight + 1,
      );
    }
  }

  // Iso-lines over the fill.
  if (span > 0) {
    context.strokeStyle = "rgba(15, 23, 42, 0.35)";
    context.lineWidth = 1;
    for (const level of contourLevels(min, max, 10)) {
      context.beginPath();
      for (const [x1, y1, x2, y2] of marchingSquaresSegments(
        raster,
        rasterWidth,
        rasterHeight,
        level,
      )) {
        context.moveTo(x1 * cellWidth, y1 * cellHeight);
        context.lineTo(x2 * cellWidth, y2 * cellHeight);
      }
      context.stroke();
    }
  }

  // Sampled points, so it is visible where data actually exists.
  const pointX = (x: number): number => (x / Math.max(nx - 1, 1)) * width;
  const pointY = (y: number): number =>
    height - (y / Math.max(ny - 1, 1)) * height;
  for (const sample of samples) {
    context.beginPath();
    context.arc(pointX(sample.x), pointY(sample.y), 2.5, 0, Math.PI * 2);
    context.fillStyle = "rgba(15, 23, 42, 0.75)";
    context.fill();
    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.lineWidth = 1;
    context.stroke();
  }
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
  const [cellValues, setCellValues] = useState<SurfaceValues>(new Map());
  const [walkKey, setWalkKey] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(frameRef, { debounce: 50 });

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

    const fixedEntries = Object.entries(
      Object.fromEntries(
        slice
          .split("|")
          .filter((entry) => entry !== "")
          .map((entry) => entry.split("=") as [string, string]),
      ),
    );

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
              next.set(surfaceCellKey(cell.x, cell.y), value);
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

  // Painting is imperative canvas work driven by measured size — outside
  // React's render, same as the uPlot charts.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !xAxis || !yAxis || !size || size.width === 0) {
      return;
    }
    drawSurface({
      canvas,
      width: size.width,
      height: 280,
      nx: surfacePositions(xAxis).length,
      ny: surfacePositions(yAxis).length,
      values: cellValues,
    });
  }, [cellValues, size, xAxis, yAxis]);

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

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!xAxis || !yAxis || !sweepSelection) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - bounds.left) / bounds.width;
    const relativeY = 1 - (event.clientY - bounds.top) / bounds.height;
    const clamp = (fraction: number) => Math.min(Math.max(fraction, 0), 1);
    // Clicking collapses both shown axes to a point at the clicked position.
    const xPosition = Math.round(clamp(relativeX) * xAxis.stepCount);
    const yPosition = Math.round(clamp(relativeY) * yAxis.stepCount);
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
      <div className={canvasFrameStyle} ref={frameRef}>
        <canvas
          ref={canvasRef}
          className={canvasStyle}
          onClick={handleCanvasClick}
          aria-label="Objective surface over the two selected parameters; click to move the navigator"
        />
      </div>
      <span className={captionStyle}>
        {sampledCount} of {totalCells} combinations sampled at{" "}
        {SURFACE_CELL_RUNS}+ runs — click the surface to move the navigator.
        Other parameters stay at their navigator values.
      </span>
    </div>
  );
};
