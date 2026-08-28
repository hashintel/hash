/**
 * The optimization surface: an Optuna-style filled contour of the study's
 * objective over two optimized parameters, computed locally.
 *
 * The study's own trials arrive with parameter values and objective values,
 * and are drawn as markers (projected onto the two shown axes, the way
 * Optuna's `plot_contour` projects). The interpolated fill comes from points
 * this view computes itself: it walks an X×Y sub-grid of the two shown
 * parameters coarse-to-fine, running the study's frozen model snapshot with
 * its objective metric on a background worker, holding every other optimized
 * parameter at its slider position (initially the best trial's value). One
 * slider per optimized parameter navigates the space; the selected point
 * refines with escalating batches, and the readout streams the objective's
 * mean and median as runs accumulate. Clicking the surface moves the two
 * shown sliders to the clicked position.
 *
 * In a future iteration the optimizer streams its own evaluations back
 * through the same feed; the trial markers are that feed's first form.
 */
import { use, useEffect, useRef, useState } from "react";

import { Select, Slider } from "@hashintel/ds-components";
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
import {
  EXPERIMENT_RUN_LADDER,
  mergeMetricFramesAcrossCells,
} from "../../../../../../react/experiments/parameter-grid";
import { sweepBatchSeed } from "../../../../../../react/experiments/sweep-session";
import { useElementSize } from "../../../../../../react/hooks/use-element-size";
import {
  buildOptimizationSurfaceAxes,
  optimizationAxisMidpoint,
  optimizationAxisPositionFor,
  optimizationAxisValueAt,
} from "../../../../../../react/optimizations/surface-grid";

import type { ExperimentsContextValue } from "../../../../../../react/experiments/context";
import type { ContourSample } from "../../../../../../react/experiments/contour-grid";
import type { SweepCellSnapshot } from "../../../../../../react/experiments/sweep-session";
import type { OptimizationRecord } from "../../../../../../react/optimizations/context";
import type { OptimizationSurfaceAxis } from "../../../../../../react/optimizations/surface-grid";

/** Runs a surface cell needs before its point appears. */
const SURFACE_CELL_RUNS = 8;

/** Ladder cap for the selected point's local refinement. */
const SELECTED_POINT_MAX_RUNS = 100;

/** Sampled positions per axis on the surface's sub-grid. */
const SURFACE_GRID_POSITIONS = 11;

/** Raster resolution per grid cell, in pixels of interpolation lattice. */
const RASTER_SUBDIVISION = 8;

/** Evenly spread quantized positions of `axis` shown on the surface. */
function surfacePositions(axis: OptimizationSurfaceAxis): number[] {
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
  "& [data-scope='select']": { width: "[170px]" },
});

const controlLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s120",
  flexShrink: 0,
});

const sliderRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const sliderNameStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s120",
  width: "[140px]",
  flexShrink: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const sliderControlStyle = css({
  flex: "1",
});

const sliderValueStyle = css({
  fontSize: "xs",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s100",
  width: "[96px]",
  flexShrink: 0,
  textAlign: "right",
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

const readoutStyle = css({
  fontSize: "xs",
  color: "neutral.s100",
  fontVariantNumeric: "tabular-nums",
});

function formatValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  const abs = Math.abs(value);
  return abs !== 0 && (abs < 0.001 || abs >= 10_000)
    ? value.toExponential(2)
    : String(Number(value.toPrecision(4)));
}

/** Mean and median of a distribution frame's bins. */
function distributionStats(
  snapshot: SweepCellSnapshot,
  metricId: string,
): { runs: number; mean: number; median: number } | null {
  for (let index = snapshot.metricFrames.length - 1; index >= 0; index--) {
    const frame = snapshot.metricFrames[index]!;
    if (frame.metricId !== metricId || frame.outputType !== "distribution") {
      continue;
    }
    let weight = 0;
    let sum = 0;
    for (const [value, frequency] of frame.bins) {
      weight += frequency;
      sum += value * frequency;
    }
    if (weight === 0) {
      return null;
    }
    const half = weight / 2;
    let cumulative = 0;
    let median = frame.bins[0]?.[0] ?? 0;
    for (const [value, frequency] of frame.bins) {
      cumulative += frequency;
      if (cumulative >= half) {
        median = value;
        break;
      }
    }
    return { runs: weight, mean: sum / weight, median };
  }
  return null;
}

type SurfaceValues = ReadonlyMap<string, number>;

/**
 * Brings one cell up to at least `minRuns` locally computed runs, merging
 * batches into `cache`. Everything is passed explicitly so the calling
 * effects can declare honest dependencies.
 */
async function sampleStudyCell(options: {
  sampleDetachedObjective: ExperimentsContextValue["sampleDetachedObjective"];
  cache: Map<string, SweepCellSnapshot>;
  optimization: OptimizationRecord;
  axes: readonly OptimizationSurfaceAxis[];
  xAxisId: string;
  yAxisId: string;
  /** Slider position per off-surface axis, plus boolean fallbacks. */
  slice: string;
  xPosition: number;
  yPosition: number;
  minRuns: number;
}): Promise<SweepCellSnapshot | null> {
  const {
    sampleDetachedObjective,
    cache,
    optimization,
    axes,
    xAxisId,
    yAxisId,
    slice,
    xPosition,
    yPosition,
    minRuns,
  } = options;
  const input = optimization.input;
  const objectiveMetric = input.model.definition.metrics?.find(
    (metric) => metric.id === input.objective.metricId,
  );
  if (!objectiveMetric) {
    return null;
  }

  const sliceEntries = new Map(
    slice
      .split("|")
      .filter((entry) => entry !== "")
      .map((entry) => entry.split("=") as [string, string]),
  );

  const values: Record<string, number | boolean> = {};
  for (const [identifier, binding] of Object.entries(
    input.scenario.parameterBindings,
  )) {
    if (binding.kind === "fixed") {
      values[identifier] = binding.value;
    } else if (binding.domain.kind === "boolean") {
      values[identifier] = sliceEntries.get(identifier) === "true";
    }
  }
  for (const axis of axes) {
    const position =
      axis.identifier === xAxisId
        ? xPosition
        : axis.identifier === yAxisId
          ? yPosition
          : Number(sliceEntries.get(axis.identifier) ?? 0);
    values[axis.identifier] = optimizationAxisValueAt(axis, position);
  }

  const key = `${slice}|x=${xPosition}|y=${yPosition}`;
  const cached = cache.get(key);
  if (cached && cached.runsCompleted >= minRuns) {
    return cached;
  }
  const from = cached?.runsCompleted ?? 0;
  const snapshot = await sampleDetachedObjective({
    cacheKey: optimization.id,
    definition: input.model.definition,
    scenarioId: input.scenario.id,
    scenarioParameterValues: values,
    metric: {
      id: objectiveMetric.id,
      label: objectiveMetric.name,
      code: objectiveMetric.code,
    },
    seed: sweepBatchSeed(input.execution.seed, from),
    runCount: minRuns - from,
    dt: input.execution.dt,
    maxTime: input.execution.maxTime,
  });
  if (!snapshot) {
    return cached ?? null;
  }
  const merged: SweepCellSnapshot = {
    runsCompleted: minRuns,
    metricFrames: cached
      ? mergeMetricFramesAcrossCells([
          cached.metricFrames,
          snapshot.metricFrames,
        ])
      : snapshot.metricFrames,
  };
  cache.set(key, merged);
  return merged;
}

function gridCellKey(xIndex: number, yIndex: number): string {
  return `${xIndex},${yIndex}`;
}

function drawSurface(options: {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  nx: number;
  ny: number;
  values: SurfaceValues;
  trials: readonly { x: number; y: number; best: boolean }[];
}): void {
  const { canvas, width, height, nx, ny, values, trials } = options;
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

  const pointX = (x: number): number => (x / Math.max(nx - 1, 1)) * width;
  const pointY = (y: number): number =>
    height - (y / Math.max(ny - 1, 1)) * height;

  if (samples.length > 0) {
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

  // Trial markers, projected onto the shown axes. Distinct from the sampled
  // dots: hollow rings, with the best trial emphasised.
  for (const trial of trials) {
    context.beginPath();
    context.arc(
      pointX(trial.x),
      pointY(trial.y),
      trial.best ? 5 : 3.5,
      0,
      Math.PI * 2,
    );
    context.strokeStyle = trial.best
      ? "rgba(217, 119, 6, 0.95)"
      : "rgba(217, 119, 6, 0.55)";
    context.lineWidth = trial.best ? 2 : 1.25;
    context.stroke();
  }
}

export const OptimizationSurface = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const { sampleDetachedObjective } = use(ExperimentsContext);
  const input = optimization.input;
  const axes = buildOptimizationSurfaceAxes(input);
  const objectiveMetric = input.model.definition.metrics?.find(
    (metric) => metric.id === input.objective.metricId,
  );

  const [xAxisId, setXAxisId] = useState(axes[0]?.identifier ?? "");
  const [yAxisId, setYAxisId] = useState(axes[1]?.identifier ?? "");
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [cellValues, setCellValues] = useState<SurfaceValues>(new Map());
  const [selectedStats, setSelectedStats] = useState<{
    runs: number;
    mean: number;
    median: number;
  } | null>(null);
  const [walkKey, setWalkKey] = useState("");
  /** Finished local batches per position tuple, merged across rungs. */
  const cellCacheRef = useRef(new Map<string, SweepCellSnapshot>());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(frameRef, { debounce: 50 });

  const xAxis = axes.find((axis) => axis.identifier === xAxisId);
  const yAxis = axes.find((axis) => axis.identifier === yAxisId);

  /** Slider position per axis: explicit, else best trial, else midpoint. */
  const positionOf = (axis: OptimizationSurfaceAxis): number => {
    const explicit = positions[axis.identifier];
    if (explicit !== undefined) {
      return explicit;
    }
    const best = optimization.best?.parameters[axis.identifier];
    return typeof best === "number"
      ? optimizationAxisPositionFor(axis, best)
      : optimizationAxisMidpoint(axis);
  };

  /**
   * The off-surface coordinates: slider positions of the other axes, plus
   * boolean bindings at the best trial's values. Part of the cache key, so a
   * best-trial change that moves a boolean restarts the walk rather than
   * silently mixing slices.
   */
  const booleanSlice = Object.entries(input.scenario.parameterBindings)
    .filter(
      (
        entry,
      ): entry is [string, { kind: "optimize"; domain: { kind: "boolean" } }] =>
        entry[1].kind === "optimize" && entry[1].domain.kind === "boolean",
    )
    .map(([identifier]) => {
      const best = optimization.best?.parameters[identifier];
      return `${identifier}=${typeof best === "boolean" ? best : false}`;
    });
  const slice = [
    ...axes
      .filter(
        (axis) => axis.identifier !== xAxisId && axis.identifier !== yAxisId,
      )
      .map((axis) => `${axis.identifier}=${positionOf(axis)}`),
    ...booleanSlice,
  ].join("|");

  // A new slice/axes identity restarts the walk; clearing the sampled values
  // during render (not in an effect) repaints without a stale frame.
  const nextWalkKey = `${optimization.id}|${xAxisId}|${yAxisId}|${slice}`;
  if (walkKey !== nextWalkKey) {
    setWalkKey(nextWalkKey);
    setCellValues(new Map());
    setSelectedStats(null);
  }

  const xSelected = xAxis ? positionOf(xAxis) : 0;
  const ySelected = yAxis ? positionOf(yAxis) : 0;

  // The grid walk: samples the X×Y sub-grid coarse-to-fine on the background
  // lane, feeding the contour. Restarts when the slice or axes change.
  useEffect(() => {
    const axesNow = buildOptimizationSurfaceAxes(optimization.input);
    const walkXAxis = axesNow.find((axis) => axis.identifier === xAxisId);
    const walkYAxis = axesNow.find((axis) => axis.identifier === yAxisId);
    const metricId = optimization.input.objective.metricId;
    if (!walkXAxis || !walkYAxis || walkXAxis === walkYAxis) {
      return;
    }
    const walk: { stale: boolean } = { stale: false };
    const isWalkStale = () => walk.stale;
    const xPositions = surfacePositions(walkXAxis);
    const yPositions = surfacePositions(walkYAxis);

    const run = async () => {
      for (const cell of coarseToFineOrder(
        xPositions.length,
        yPositions.length,
      )) {
        if (isWalkStale()) {
          return;
        }
        const snapshot = await sampleStudyCell({
          sampleDetachedObjective,
          cache: cellCacheRef.current,
          optimization,
          axes: axesNow,
          xAxisId,
          yAxisId,
          slice,
          xPosition: xPositions[cell.x]!,
          yPosition: yPositions[cell.y]!,
          minRuns: SURFACE_CELL_RUNS,
        });
        if (isWalkStale()) {
          return;
        }
        if (snapshot) {
          const value = sweepCellObjective(snapshot.metricFrames, metricId);
          if (value !== null) {
            setCellValues((previous) => {
              const next = new Map(previous);
              next.set(gridCellKey(cell.x, cell.y), value);
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
  }, [optimization, xAxisId, yAxisId, slice, sampleDetachedObjective]);

  // The selected point's refinement: escalating batches, streaming the
  // objective's mean/median into the readout.
  useEffect(() => {
    const axesNow = buildOptimizationSurfaceAxes(optimization.input);
    const walkXAxis = axesNow.find((axis) => axis.identifier === xAxisId);
    const walkYAxis = axesNow.find((axis) => axis.identifier === yAxisId);
    const metricId = optimization.input.objective.metricId;
    if (!walkXAxis || !walkYAxis || walkXAxis === walkYAxis) {
      return;
    }
    const refinement: { stale: boolean } = { stale: false };
    const isRefinementStale = () => refinement.stale;

    const run = async () => {
      for (const target of EXPERIMENT_RUN_LADDER) {
        if (target > SELECTED_POINT_MAX_RUNS) {
          return;
        }
        const snapshot = await sampleStudyCell({
          sampleDetachedObjective,
          cache: cellCacheRef.current,
          optimization,
          axes: axesNow,
          xAxisId,
          yAxisId,
          slice,
          xPosition: xSelected,
          yPosition: ySelected,
          minRuns: target,
        });
        if (isRefinementStale()) {
          return;
        }
        if (!snapshot) {
          return;
        }
        setSelectedStats(distributionStats(snapshot, metricId));
        setCellValues((previous) => {
          // The selected point is usually also a grid cell; refresh it.
          const xPositions = surfacePositions(walkXAxis);
          const yPositions = surfacePositions(walkYAxis);
          const xIndex = xPositions.indexOf(xSelected);
          const yIndex = yPositions.indexOf(ySelected);
          if (xIndex === -1 || yIndex === -1) {
            return previous;
          }
          const value = sweepCellObjective(snapshot.metricFrames, metricId);
          if (value === null) {
            return previous;
          }
          const next = new Map(previous);
          next.set(gridCellKey(xIndex, yIndex), value);
          return next;
        });
      }
    };
    void run();

    return () => {
      refinement.stale = true;
    };
  }, [
    optimization,
    xAxisId,
    yAxisId,
    slice,
    xSelected,
    ySelected,
    sampleDetachedObjective,
  ]);

  // Painting is imperative canvas work driven by measured size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !xAxis || !yAxis || !size || size.width === 0) {
      return;
    }
    const xPositions = surfacePositions(xAxis);
    const yPositions = surfacePositions(yAxis);
    const trials = optimization.trials
      .filter((trial) => trial.state === "complete" && trial.objective !== null)
      .map((trial) => {
        const xValue = trial.parameters[xAxis.identifier];
        const yValue = trial.parameters[yAxis.identifier];
        if (typeof xValue !== "number" || typeof yValue !== "number") {
          return null;
        }
        return {
          x:
            (optimizationAxisPositionFor(xAxis, xValue) / xAxis.stepCount) *
            (xPositions.length - 1),
          y:
            (optimizationAxisPositionFor(yAxis, yValue) / yAxis.stepCount) *
            (yPositions.length - 1),
          best: optimization.best?.trial === trial.trial,
        };
      })
      .filter((trial) => trial !== null);
    drawSurface({
      canvas,
      width: size.width,
      height: 280,
      nx: xPositions.length,
      ny: yPositions.length,
      values: cellValues,
      trials,
    });
  }, [cellValues, size, xAxis, yAxis, optimization.trials, optimization.best]);

  if (axes.length < 2 || !objectiveMetric) {
    return null;
  }

  const axisOptions = axes.map((axis) => ({
    value: axis.identifier,
    text: axis.identifier,
  }));

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!xAxis || !yAxis) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const clamp = (fraction: number) => Math.min(Math.max(fraction, 0), 1);
    const relativeX = clamp((event.clientX - bounds.left) / bounds.width);
    const relativeY = clamp(1 - (event.clientY - bounds.top) / bounds.height);
    setPositions((previous) => ({
      ...previous,
      [xAxis.identifier]: Math.round(relativeX * xAxis.stepCount),
      [yAxis.identifier]: Math.round(relativeY * yAxis.stepCount),
    }));
  };

  const direction =
    input.objective.direction === "maximize" ? "Maximize" : "Minimize";

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
      </div>
      {axes.map((axis) => (
        <div className={sliderRowStyle} key={axis.identifier}>
          <span className={sliderNameStyle} title={axis.identifier}>
            {axis.identifier}
          </span>
          <Slider
            className={sliderControlStyle}
            min={0}
            max={axis.stepCount}
            step={1}
            value={positionOf(axis)}
            onChangeEnd={(position) =>
              setPositions((previous) => ({
                ...previous,
                [axis.identifier]: position,
              }))
            }
          />
          <span className={sliderValueStyle}>
            {formatValue(optimizationAxisValueAt(axis, positionOf(axis)))}
          </span>
        </div>
      ))}
      <div className={readoutStyle}>
        {direction} {objectiveMetric.name} at selection:{" "}
        {selectedStats
          ? `${formatValue(selectedStats.mean)} mean · ${formatValue(
              selectedStats.median,
            )} median · ${selectedStats.runs} runs`
          : "computing…"}
      </div>
      <div ref={frameRef} className={canvasFrameStyle}>
        <canvas
          ref={canvasRef}
          className={canvasStyle}
          onClick={handleCanvasClick}
        />
      </div>
      <span className={captionStyle}>
        {cellValues.size} locally computed points · rings are the study's trials
        (best highlighted) · click to navigate
      </span>
    </div>
  );
};
