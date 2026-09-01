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
  coarseToFineOrder,
  sweepCellObjective,
} from "../../../../../../react/experiments/contour-grid";
import { distributionStats } from "../../../../../../react/experiments/distribution-stats";
import {
  EXPERIMENT_RUN_LADDER,
  mergeMetricFramesAcrossCells,
} from "../../../../../../react/experiments/parameter-grid";
import { sweepBatchSeed } from "../../../../../../react/experiments/sweep-session";
import {
  buildOptimizationSurfaceAxes,
  optimizationAxisMidpoint,
  optimizationAxisPositionFor,
  optimizationAxisValueAt,
} from "../../../../../../react/optimizations/surface-grid";
import {
  ContourSurface,
  contourSurfaceKey,
} from "../../../../../components/contour-surface";

import type { ExperimentsContextValue } from "../../../../../../react/experiments/context";
import type { DistributionStats } from "../../../../../../react/experiments/distribution-stats";
import type { SweepCellSnapshot } from "../../../../../../react/experiments/sweep-session";
import type { OptimizationRecord } from "../../../../../../react/optimizations/context";
import type { OptimizationSurfaceAxis } from "../../../../../../react/optimizations/surface-grid";
import type {
  ContourSurfaceMarker,
  ContourSurfaceValues,
} from "../../../../../components/contour-surface";

/** Runs a surface cell needs before its point appears. */
const SURFACE_CELL_RUNS = 8;

/** Ladder cap for the selected point's local refinement. */
const SELECTED_POINT_MAX_RUNS = 100;

/** Sampled positions per axis on the surface's sub-grid. */
const SURFACE_GRID_POSITIONS = 11;

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
  // The Select's root insists on min-content width, which overflows the
  // 170px box over the next label; a long option name fits by ellipsis.
  "& > div > div": { minWidth: "[0]" },
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
  const [cellValues, setCellValues] = useState<ContourSurfaceValues>(new Map());
  const [selectedStats, setSelectedStats] = useState<DistributionStats | null>(
    null,
  );
  const [walkKey, setWalkKey] = useState("");
  /** Finished local batches per position tuple, merged across rungs. */
  const cellCacheRef = useRef(new Map<string, SweepCellSnapshot>());

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
        setSelectedStats(distributionStats(snapshot.metricFrames, metricId));
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
          next.set(contourSurfaceKey(xIndex, yIndex), value);
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

  /** Completed trials projected onto the shown axes, as ring markers. */
  const trialMarkers: ContourSurfaceMarker[] =
    xAxis && yAxis
      ? optimization.trials
          .filter(
            (trial) => trial.state === "complete" && trial.objective !== null,
          )
          .map((trial) => {
            const xValue = trial.parameters[xAxis.identifier];
            const yValue = trial.parameters[yAxis.identifier];
            if (typeof xValue !== "number" || typeof yValue !== "number") {
              return null;
            }
            return {
              x:
                (optimizationAxisPositionFor(xAxis, xValue) / xAxis.stepCount) *
                (surfacePositions(xAxis).length - 1),
              y:
                (optimizationAxisPositionFor(yAxis, yValue) / yAxis.stepCount) *
                (surfacePositions(yAxis).length - 1),
              emphasis: optimization.best?.trial === trial.trial,
            };
          })
          .filter((marker) => marker !== null)
      : [];

  if (axes.length < 2 || !objectiveMetric) {
    return null;
  }

  const axisOptions = axes.map((axis) => ({
    value: axis.identifier,
    text: axis.identifier,
  }));

  const handlePickFraction = ({
    x: fractionX,
    y: fractionY,
  }: {
    x: number;
    y: number;
  }) => {
    if (!xAxis || !yAxis) {
      return;
    }
    setPositions((previous) => ({
      ...previous,
      [xAxis.identifier]: Math.round(fractionX * xAxis.stepCount),
      [yAxis.identifier]: Math.round(fractionY * yAxis.stepCount),
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
      {xAxis && yAxis ? (
        <ContourSurface
          nx={surfacePositions(xAxis).length}
          ny={surfacePositions(yAxis).length}
          contentKey={`${xAxisId}|${yAxisId}`}
          values={cellValues}
          markers={trialMarkers}
          onPickFraction={handlePickFraction}
          aria-label="Optimization surface"
        />
      ) : null}
      <span className={captionStyle}>
        {cellValues.size} locally computed points · rings are the study's trials
        (best highlighted) · click to navigate
      </span>
    </div>
  );
};
