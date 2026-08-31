/**
 * The sweep surface: a contour of one metric's final value over two swept
 * parameters, filling in live as points are sampled.
 *
 * This component owns the sampling: while it is open, it samples an X×Y
 * sub-grid of the two shown parameters in quad-tree order — the four
 * corners, then each level splitting every region in two over x and y — in
 * level-aligned chunks through the sweep's background lane, several chunks
 * in flight at once. Each chunk is one request carrying many cells (8 runs
 * per point), batched into a single experiment where the scenario allows
 * it, so a complete coarse picture lands with the first levels and sharpens
 * from there. The navigator's own selection always samples first: chunks
 * wait for the current selection's first streamed frames (the session
 * re-arms that gate on every selection change), so the metric charts fill
 * before the surface competes for workers. Every metric's value comes back
 * per cell, so switching the shown metric re-reads the same samples instead
 * of re-simulating. Parameters outside the two shown axes hold at the
 * middle of their selected ranges — moving them restarts the sampling for
 * the new slice — and clicking the plot collapses both shown parameters to
 * a point at the clicked position. Rendering itself is `ContourSurface`,
 * which is purely presentational.
 */
import { use, useEffect, useState } from "react";

import { Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import { quadTreeLevels } from "../../../../../../react/experiments/contour-grid";
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
 * Cells per sampling request. Small enough that the first chunk paints the
 * coarse shape quickly, big enough that a full grid is a handful of
 * requests — each of which the provider turns into one batched experiment
 * where the scenario allows it, instead of one batch per cell. Chunks never
 * span quad-tree levels, so each level paints as a unit.
 */
const SURFACE_CHUNK_CELLS = 24;

/**
 * Chunks dispatched concurrently. The session holds four background-batch
 * slots; keeping one in reserve leaves navigator-click refinement a lane of
 * its own while the fill still overlaps chunk setup with compute.
 */
const SURFACE_CHUNKS_IN_FLIGHT = 3;

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
  const { sampleSurfaceCells, setSweepSelection } = use(ExperimentsContext);
  const axes = experiment.parameterAxes;
  const [xAxisId, setXAxisId] = useState(axes[0]?.identifier ?? "");
  const [yAxisId, setYAxisId] = useState(axes[1]?.identifier ?? "");
  const [metricId, setMetricId] = useState(experiment.metricSpecs[0]?.id ?? "");
  // Sampled values per grid cell, per metric — metric-agnostic, so switching
  // the shown metric re-reads instead of re-sampling. The state carries the
  // walk it belongs to: a chunk resolved after a restart (the old effect's
  // stale flag flips only in the passive-effects flush, after the clear
  // below has committed) must not merge old-slice values into the new grid.
  const [grid, setGrid] = useState<{
    walkKey: string;
    values: ReadonlyMap<string, Readonly<Record<string, number>>>;
  }>({ walkKey: "", values: new Map() });

  const xAxis = axes.find((axis) => axis.identifier === xAxisId);
  const yAxis = axes.find((axis) => axis.identifier === yAxisId);
  const slice = fixedPositionsKey(experiment, xAxisId, yAxisId);
  const experimentId = experiment.id;
  const sweepSelection = experiment.sweep?.selection;

  // A new slice or axes identity restarts the sampling; a metric change
  // does not (every metric's value is already in the samples). Clearing
  // during render (not in the effect) repaints without a stale frame.
  const walkKey = `${experimentId}|${xAxisId}|${yAxisId}|${slice}`;
  if (grid.walkKey !== walkKey) {
    setGrid({ walkKey, values: new Map() });
  }

  // The sampling: restarts whenever the slice or the shown axes change;
  // stops when the section unmounts. Chunks go out sequentially so the
  // coarse picture lands first and a restart wastes at most one chunk.
  useEffect(() => {
    if (!xAxis || !yAxis || xAxis === yAxis) {
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
    // Level-aligned chunks in quad-tree order: coarse levels are whole
    // chunks, finer levels split at the size cap.
    const chunks = quadTreeLevels(xPositions.length, yPositions.length).flatMap(
      (level) => {
        const parts: { x: number; y: number }[][] = [];
        for (
          let start = 0;
          start < level.length;
          start += SURFACE_CHUNK_CELLS
        ) {
          parts.push(level.slice(start, start + SURFACE_CHUNK_CELLS));
        }
        return parts;
      },
    );

    const sampleChunk = async (chunk: readonly { x: number; y: number }[]) => {
      const positions = chunk.map((cell) => {
        const position: Record<string, number> = {
          [xAxis.identifier]: xPositions[cell.x]!,
          [yAxis.identifier]: yPositions[cell.y]!,
        };
        for (const [identifier, positionText] of fixedEntries) {
          position[identifier] = Number(positionText);
        }
        return position;
      });

      const cells = await sampleSurfaceCells(
        experimentId,
        positions,
        SURFACE_CELL_RUNS,
      );
      // A refused chunk is a hole in the surface, not the end of the fill —
      // later chunks may still land (a disposed session keeps refusing
      // cheaply until the cleanup flips the stale flag).
      if (isWalkStale() || !cells) {
        return;
      }
      setGrid((previous) => {
        if (previous.walkKey !== walkKey) {
          return previous;
        }
        const next = new Map(previous.values);
        for (const [index, values] of cells.entries()) {
          const cell = chunk[index];
          if (cell && values) {
            next.set(contourSurfaceKey(cell.x, cell.y), values);
          }
        }
        return { walkKey: previous.walkKey, values: next };
      });
    };

    // Parallel lanes pulling from one queue: chunks stream back roughly in
    // quad-tree order while setup and compute overlap across lanes.
    const queue = { index: 0 };
    const lane = async () => {
      while (!isWalkStale()) {
        const chunkIndex = queue.index;
        queue.index += 1;
        const chunk = chunks[chunkIndex];
        if (!chunk) {
          return;
        }
        await sampleChunk(chunk);
      }
    };
    for (let i = 0; i < SURFACE_CHUNKS_IN_FLIGHT; i++) {
      void lane();
    }

    return () => {
      walk.stale = true;
    };
  }, [experimentId, sampleSurfaceCells, slice, walkKey, xAxis, yAxis]);

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

  const cellValues: ContourSurfaceValues = new Map(
    [...grid.values.entries()].flatMap(([key, values]) => {
      const value = values[metricId];
      return value === undefined ? [] : [[key, value] as [string, number]];
    }),
  );
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
          contentKey={`${xAxisId}|${yAxisId}|${metricId}`}
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
