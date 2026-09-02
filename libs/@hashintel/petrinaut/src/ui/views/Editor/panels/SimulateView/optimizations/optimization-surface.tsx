/**
 * The optimization surface: an Optuna-style filled contour of the study's
 * objective over two optimized parameters, computed locally.
 *
 * The study's trials arrive with parameter and objective values and are
 * drawn as markers projected onto the two shown axes. The interpolated fill
 * comes from points this view computes itself: it walks an X×Y sub-grid of
 * the shown parameters in quad-tree order, running the study's frozen model
 * with its objective metric on a background worker, holding every other
 * optimized parameter at its slider position (initially the best trial's
 * value). The selected point refines with escalating batches, and the
 * readout streams the objective's mean and median as runs accumulate.
 */
import { use, useEffect, useRef, useState } from "react";

import { Slider } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ExperimentsActionsContext } from "../../../../../../react/experiments/context";
import { distributionStats } from "../../../../../../react/experiments/distribution-stats";
import {
  EXPERIMENT_RUN_LADDER,
  mergeMetricFramesAcrossCells,
} from "../../../../../../react/experiments/parameter-grid";
import { sweepCellObjective } from "../../../../../../react/experiments/sweep-cell-objective";
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
import { formatAxisValue } from "../shared/format-axis-value";
import {
  SurfaceAxisControls,
  SurfaceCaption,
  SurfaceFrame,
} from "../shared/surface-frame";
import {
  quadTreeLevels,
  SURFACE_CELL_RUNS,
  surfacePositions,
} from "../shared/surface-sampling";
import { useSurfaceWalk } from "../shared/use-surface-walk";

import type { ExperimentsContextValue } from "../../../../../../react/experiments/context";
import type { DistributionStats } from "../../../../../../react/experiments/distribution-stats";
import type { SweepCellSnapshot } from "../../../../../../react/experiments/sweep-session";
import type { OptimizationRecord } from "../../../../../../react/optimizations/context";
import type { OptimizationSurfaceAxis } from "../../../../../../react/optimizations/surface-grid";
import type {
  ContourSurfaceFraction,
  ContourSurfaceMarker,
} from "../../../../../components/contour-surface";

/** Ladder cap for the selected point's local refinement. */
const SELECTED_POINT_MAX_RUNS = 100;

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

const readoutStyle = css({
  fontSize: "xs",
  color: "neutral.s100",
  fontVariantNumeric: "tabular-nums",
});

/**
 * Brings one cell up to at least `minRuns` locally computed runs, merging
 * batches into `cache`.
 */
const sampleStudyCell = async (options: {
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
}): Promise<SweepCellSnapshot | null> => {
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
};

export const OptimizationSurface = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const { sampleDetachedObjective } = use(ExperimentsActionsContext);
  const input = optimization.input;
  const axes = buildOptimizationSurfaceAxes(input);
  const metricId = input.objective.metricId;
  const objectiveMetric = input.model.definition.metrics?.find(
    (metric) => metric.id === metricId,
  );

  const [xAxisId, setXAxisId] = useState(axes[0]?.identifier ?? "");
  const [yAxisId, setYAxisId] = useState(axes[1]?.identifier ?? "");
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<ContourSurfaceFraction | null>(null);
  /**
   * The selected point's refinement so far, tagged with its walk: the current
   * point's stats, and every grid cell a selection has refined within this
   * walk, so a cell keeps its deeper value after the selection moves on.
   */
  const [refined, setRefined] = useState<{
    walkKey: string;
    stats: DistributionStats | null;
    cells: ReadonlyMap<string, number>;
  } | null>(null);
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

  // The off-surface coordinates: slider positions of the other axes, plus
  // boolean bindings at the best trial's values. Part of the walk key, so a
  // best-trial change that moves a boolean restarts the walk rather than
  // mixing slices.
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
  const walkKey = `${optimization.id}|${xAxisId}|${yAxisId}|${slice}`;

  const xSelected = xAxis ? positionOf(xAxis) : 0;
  const ySelected = yAxis ? positionOf(yAxis) : 0;

  // The sampler is serialised, so one lane of single-cell chunks.
  const walkValues = useSurfaceWalk<number>({
    walkKey,
    lanes: 1,
    buildWalk: () => {
      if (!xAxis || !yAxis || xAxis === yAxis) {
        return null;
      }
      const xPositions = surfacePositions(xAxis);
      const yPositions = surfacePositions(yAxis);
      return {
        chunks: quadTreeLevels(xPositions.length, yPositions.length)
          .flat()
          .map((cell) => [cell]),
        sample: (chunk) =>
          Promise.all(
            chunk.map(async (cell) => {
              const snapshot = await sampleStudyCell({
                sampleDetachedObjective,
                cache: cellCacheRef.current,
                optimization,
                axes,
                xAxisId,
                yAxisId,
                slice,
                xPosition: xPositions[cell.x]!,
                yPosition: yPositions[cell.y]!,
                minRuns: SURFACE_CELL_RUNS,
              });
              return snapshot
                ? sweepCellObjective(snapshot.metricFrames, metricId)
                : null;
            }),
          ),
      };
    },
  });

  // The selected point's refinement: escalating batches, streaming the
  // objective's mean/median into the readout and refreshing its grid cell.
  useEffect(() => {
    const walkAxes = buildOptimizationSurfaceAxes(optimization.input);
    const walkXAxis = walkAxes.find((axis) => axis.identifier === xAxisId);
    const walkYAxis = walkAxes.find((axis) => axis.identifier === yAxisId);
    const walkMetricId = optimization.input.objective.metricId;
    if (!walkXAxis || !walkYAxis || walkXAxis === walkYAxis) {
      return;
    }
    let stale = false;
    const isStale = () => stale;
    const xIndex = surfacePositions(walkXAxis).indexOf(xSelected);
    const yIndex = surfacePositions(walkYAxis).indexOf(ySelected);
    const cellKey =
      xIndex === -1 || yIndex === -1 ? null : contourSurfaceKey(xIndex, yIndex);

    const run = async () => {
      for (const target of EXPERIMENT_RUN_LADDER) {
        if (target > SELECTED_POINT_MAX_RUNS) {
          return;
        }
        const snapshot = await sampleStudyCell({
          sampleDetachedObjective,
          cache: cellCacheRef.current,
          optimization,
          axes: walkAxes,
          xAxisId,
          yAxisId,
          slice,
          xPosition: xSelected,
          yPosition: ySelected,
          minRuns: target,
        });
        if (isStale() || !snapshot) {
          return;
        }
        const value = sweepCellObjective(snapshot.metricFrames, walkMetricId);
        const stats = distributionStats(snapshot.metricFrames, walkMetricId);
        setRefined((previous) => {
          const cells = new Map(
            previous?.walkKey === walkKey ? previous.cells : [],
          );
          if (cellKey !== null && value !== null) {
            cells.set(cellKey, value);
          }
          return { walkKey, stats, cells };
        });
      }
    };
    void run();

    return () => {
      stale = true;
    };
  }, [
    optimization,
    xAxisId,
    yAxisId,
    slice,
    walkKey,
    xSelected,
    ySelected,
    sampleDetachedObjective,
  ]);

  const currentRefined = refined?.walkKey === walkKey ? refined : null;
  // A selected point is usually also a grid cell: its refined value wins.
  const cellValues =
    currentRefined && currentRefined.cells.size > 0
      ? new Map([...walkValues, ...currentRefined.cells])
      : walkValues;

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

  const handlePickFraction = (fraction: ContourSurfaceFraction) => {
    if (!xAxis || !yAxis) {
      return;
    }
    setPositions((previous) => ({
      ...previous,
      [xAxis.identifier]: Math.round(fraction.x * xAxis.stepCount),
      [yAxis.identifier]: Math.round(fraction.y * yAxis.stepCount),
    }));
  };

  /** The axis readout a plot fraction lands on. */
  const readoutAt = (axis: OptimizationSurfaceAxis, fraction: number): string =>
    `${axis.identifier} = ${formatAxisValue(
      optimizationAxisValueAt(axis, Math.round(fraction * axis.stepCount)),
    )}`;

  const direction =
    input.objective.direction === "maximize" ? "Maximize" : "Minimize";
  const stats = currentRefined?.stats;
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
      />
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
            {formatAxisValue(optimizationAxisValueAt(axis, positionOf(axis)))}
          </span>
        </div>
      ))}
      <div className={readoutStyle}>
        {direction} {objectiveMetric.name} at selection:{" "}
        {stats
          ? `${formatAxisValue(stats.mean)} mean · ${formatAxisValue(
              stats.median,
            )} median · ${stats.runs} runs`
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
          onPreviewFraction={setPreview}
          aria-label="Optimization surface"
        />
      ) : null}
      <SurfaceCaption
        preview={
          preview && xAxis && yAxis
            ? { x: readoutAt(xAxis, preview.x), y: readoutAt(yAxis, preview.y) }
            : null
        }
        sampledCount={cellValues.size}
        totalCells={totalCells}
        runsPerCell={SURFACE_CELL_RUNS}
        note="rings are the study's trials (best highlighted)"
      />
    </SurfaceFrame>
  );
};
