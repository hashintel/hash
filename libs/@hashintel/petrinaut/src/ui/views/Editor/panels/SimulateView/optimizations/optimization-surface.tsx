/**
 * The optimization surface: an Optuna-style filled contour of the study's
 * objective over two optimized parameters. The study's trials arrive with
 * parameter and objective values and are projected onto the two shown axes.
 *
 * Two variants share the plot and differ in where the field comes from.
 * `OptimizationSurface`, for a study run elsewhere, computes the fill itself:
 * it walks an X×Y sub-grid of the shown parameters in quad-tree order,
 * running the study's frozen model with its objective metric on a background
 * worker, holding every other optimized parameter at its slider position, and
 * refines the selected point with escalating batches. The trials sit on that
 * fill as rings. `NavigatedOptimizationSurface`, for a study evaluated in this
 * browser, computes nothing: the trials are the samples, the field is
 * interpolated between them, and the point being evaluated — or, once the
 * study is over, the point the navigation refines — streams its running value
 * into the field as it lands. It follows the record's navigation and the
 * provider's selection stream; the drawer's navigator holds the controls.
 */
import { use, useEffect, useRef, useState } from "react";

import { Slider } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ExperimentsActionsContext } from "../../../../../../react/experiments/context";
import { distributionStats } from "../../../../../../react/experiments/distribution-stats";
import { EXPERIMENT_RUN_LADDER } from "../../../../../../react/experiments/parameter-grid";
import { sweepCellObjective } from "../../../../../../react/experiments/sweep-cell-objective";
import {
  buildOptimizationSurfaceAxes,
  optimizationAxisValueAt,
  optimizationBooleanIdentifiers,
} from "../../../../../../react/optimizations/surface-grid";
import { formatAxisValue } from "../shared/format-axis-value";
import { describeSurfaceSampling } from "../shared/surface-frame";
import {
  SURFACE_CELL_RUNS,
  surfacePositions,
} from "../shared/surface-sampling";
import {
  type OptimizationSurfaceView,
  resolveSurfaceBooleans,
  resolveSurfacePositions,
  surfaceSliceKey,
  surfaceWalkKey,
} from "./optimization-surface/navigation-slice";
import {
  sampleStudyCell,
  type StudyCellCache,
} from "./optimization-surface/sample-study-cell";
import {
  describeSurfaceState,
  inFlightSurfaceField,
  mergeSurfaceFields,
  navigatedSurfaceSample,
  OptimizationSurfacePlot,
  surfaceCellKeyAt,
  surfaceInteraction,
  trialSurfaceField,
  withNavigatedSample,
} from "./optimization-surface/surface-plot";
import { useStudySurfaceWalk } from "./optimization-surface/use-study-surface-walk";

import type { DistributionStats } from "../../../../../../react/experiments/distribution-stats";
import type {
  OptimizationNavigation,
  OptimizationRecord,
  OptimizationSelectionStream,
} from "../../../../../../react/optimizations/context";
import type { OptimizationSurfaceAxis } from "../../../../../../react/optimizations/surface-grid";

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

const initialView = (
  axes: readonly OptimizationSurfaceAxis[],
): OptimizationSurfaceView => ({
  xAxisId: axes[0]?.identifier ?? "",
  yAxisId: axes[1]?.identifier ?? "",
});

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

  const [view, setView] = useState(() => initialView(axes));
  const [chosenPositions, setChosenPositions] = useState<
    Record<string, number>
  >({});
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
  const cellCacheRef = useRef<StudyCellCache>(new Map());

  const positions = resolveSurfacePositions(
    axes,
    chosenPositions,
    optimization.best,
  );
  const booleans = resolveSurfaceBooleans(
    optimizationBooleanIdentifiers(input),
    {},
    optimization.best,
  );
  const slice = surfaceSliceKey({ axes, view, positions, booleans });
  const walkKey = surfaceWalkKey(optimization.id, view, slice);
  const xSelected = positions[view.xAxisId] ?? 0;
  const ySelected = positions[view.yAxisId] ?? 0;
  const xAxis = axes.find((axis) => axis.identifier === view.xAxisId);
  const yAxis = axes.find((axis) => axis.identifier === view.yAxisId);

  const walkValues = useStudySurfaceWalk({
    sampleDetachedObjective,
    cellCache: cellCacheRef,
    optimization,
    axes,
    view,
    slice,
  });

  const optimizationId = optimization.id;
  const { xAxisId, yAxisId } = view;
  // The selected point's refinement: escalating batches, streaming the
  // objective's mean/median into the readout and refreshing its grid cell.
  useEffect(() => {
    // Only the study's identity and input drive the refinement; streamed
    // trials replace the record without restarting it.
    const study = { id: optimizationId, input };
    const walkAxes = buildOptimizationSurfaceAxes(input);
    const walkXAxis = walkAxes.find((axis) => axis.identifier === xAxisId);
    const walkYAxis = walkAxes.find((axis) => axis.identifier === yAxisId);
    const walkMetricId = input.objective.metricId;
    if (!walkXAxis || !walkYAxis || walkXAxis === walkYAxis) {
      return;
    }
    let stale = false;
    const isStale = () => stale;
    const cellKey = surfaceCellKeyAt(
      walkXAxis,
      walkYAxis,
      xSelected,
      ySelected,
    );

    const run = async () => {
      for (const target of EXPERIMENT_RUN_LADDER) {
        if (target > SELECTED_POINT_MAX_RUNS) {
          return;
        }
        const snapshot = await sampleStudyCell({
          sampleDetachedObjective,
          cache: cellCacheRef.current,
          optimization: study,
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
    optimizationId,
    input,
    xAxisId,
    yAxisId,
    slice,
    walkKey,
    xSelected,
    ySelected,
    sampleDetachedObjective,
  ]);

  if (axes.length < 2 || !objectiveMetric) {
    return null;
  }

  const currentRefined = refined?.walkKey === walkKey ? refined : null;
  const stats = currentRefined?.stats;
  const direction =
    input.objective.direction === "maximize" ? "Maximize" : "Minimize";

  // A refined point is usually also a grid cell: its deeper value wins.
  const cellValues =
    currentRefined && currentRefined.cells.size > 0
      ? new Map([...walkValues, ...currentRefined.cells])
      : walkValues;
  const markers =
    xAxis && yAxis
      ? trialSurfaceField({
          trials: optimization.trials,
          best: optimization.best,
          xAxis,
          yAxis,
          mark: "ring",
        }).markers
      : [];
  const totalCells =
    xAxis && yAxis
      ? surfacePositions(xAxis).length * surfacePositions(yAxis).length
      : 0;

  return (
    <OptimizationSurfacePlot
      axes={axes}
      view={view}
      onViewChange={setView}
      positions={positions}
      values={cellValues}
      markers={markers}
      sampleMarks="dot"
      contentKey={`${view.xAxisId}|${view.yAxisId}`}
      onPick={(picked) =>
        setChosenPositions((previous) => ({ ...previous, ...picked }))
      }
      caption={describeSurfaceSampling({
        sampledCount: cellValues.size,
        totalCells,
        runsPerCell: SURFACE_CELL_RUNS,
        note: "rings are the study's trials (best highlighted), the ringed dot the current parameters",
      })}
    >
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
            value={positions[axis.identifier]}
            onChangeEnd={(position) =>
              setChosenPositions((previous) => ({
                ...previous,
                [axis.identifier]: position,
              }))
            }
          />
          <span className={sliderValueStyle}>
            {formatAxisValue(
              optimizationAxisValueAt(axis, positions[axis.identifier] ?? 0),
            )}
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
    </OptimizationSurfacePlot>
  );
};

export const NavigatedOptimizationSurface = ({
  optimization,
  navigation,
  selection,
  onNavigationChange,
}: {
  optimization: OptimizationRecord;
  navigation: OptimizationNavigation;
  /** The provider's stream at the navigated point (or the followed step). */
  selection: OptimizationSelectionStream | null;
  onNavigationChange: (patch: Partial<OptimizationNavigation>) => void;
}) => {
  const input = optimization.input;
  const axes = optimization.axes;
  const [view, setView] = useState(() => initialView(axes));

  const positions = resolveSurfacePositions(
    axes,
    navigation.positions,
    optimization.best,
  );
  const booleans = resolveSurfaceBooleans(
    optimizationBooleanIdentifiers(input),
    navigation.booleans,
    optimization.best,
  );
  const xAxis = axes.find((axis) => axis.identifier === view.xAxisId);
  const yAxis = axes.find((axis) => axis.identifier === view.yAxisId);

  if (axes.length < 2 || !xAxis || !yAxis) {
    return null;
  }

  const field = mergeSurfaceFields(
    trialSurfaceField({
      trials: optimization.trials,
      best: optimization.best,
      xAxis,
      yAxis,
      mark: "dot",
    }),
    inFlightSurfaceField({ inFlight: optimization.inFlight, xAxis, yAxis }),
  );
  const values = withNavigatedSample(
    field.values,
    navigatedSurfaceSample({
      selection,
      trials: optimization.trials,
      metricId: input.objective.metricId,
      xAxis,
      yAxis,
      positions,
    }),
  );
  const interaction = surfaceInteraction(optimization, navigation);
  const slice = surfaceSliceKey({ axes, view, positions, booleans });

  return (
    <OptimizationSurfacePlot
      axes={axes}
      view={view}
      onViewChange={setView}
      positions={positions}
      values={values}
      markers={field.markers}
      sampleMarks="none"
      contentKey={surfaceWalkKey(optimization.id, view, slice)}
      onPick={
        interaction === "navigable"
          ? (picked) =>
              onNavigationChange({
                positions: { ...navigation.positions, ...picked },
                followTrials: false,
              })
          : undefined
      }
      caption={describeSurfaceState({
        trials: optimization.trials,
        best: optimization.best,
        interaction,
        selection,
      })}
    />
  );
};
