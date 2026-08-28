/**
 * Progressive computation of one parameter-sweep experiment.
 *
 * A sweep never computes its whole quantized space eagerly. It computes the
 * region the navigator selects — a position range per parameter, a single
 * point in the degenerate case — and restarts on the new region the moment
 * the selection changes, the way a raytracer drops its rays when the camera
 * moves. A point refines by climbing `EXPERIMENT_RUN_LADDER`; a region
 * levels its cells rung by rung, visiting them in a low-discrepancy order so
 * the merged view spreads across the region early. Finished batches fold
 * into a per-position cache, so revisiting a position — narrowing a range,
 * collapsing to a point, or sliding back — restores everything already
 * computed.
 *
 * The session is backend-agnostic: it asks an injected `instantiateBatch` for
 * a `MonteCarloExperiment` per batch and only consumes the handle's stores,
 * so CPU worker pools and the WebGPU backend behave identically here. Each
 * batch has one concrete value per parameter, so per-batch scenario
 * compilation and GPU eligibility are untouched by region selections.
 *
 * Determinism: a cell's batch covering runs `[from, target)` derives its
 * base seed as `deriveRunSeed(seed, from)` (the first batch keeps `seed`
 * verbatim). Every cell climbs the same ladder, so the same rung uses the
 * same seeds in every cell — common random numbers across the space — and
 * re-running a rung after a cancellation repeats it exactly.
 */
import { deriveRunSeed } from "@hashintel/petrinaut-core";

import {
  axisValueAt,
  countRegionCells,
  enumerateRegionCells,
  fullSweepSelection,
  getNextRunTarget,
  mergeMetricFramesAcrossCells,
  normalizeSweepSelection,
} from "./parameter-grid";

import type { ExperimentParameterAxis, SweepSelection } from "./parameter-grid";
import type {
  MonteCarloExperiment,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloWorkerProgress,
} from "@hashintel/petrinaut-core";

export type { SweepSelection } from "./parameter-grid";

/** Finished batches of one cell (quantized position tuple), merged. */
export type SweepCellSnapshot = {
  runsCompleted: number;
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
};

/** A cached cell: its position tuple and its merged finished batches. */
type SweepCellEntry = SweepCellSnapshot & {
  position: Readonly<Record<string, number>>;
};

/** What the session streams to its owner on every meaningful change. */
export type SweepSessionUpdate = {
  selection: SweepSelection;
  /** Concrete values of the cell the in-flight batch computes, or null. */
  activeCellValues: Readonly<Record<string, number>> | null;
  /** Cached batches of every cell in the region, plus the in-flight batch. */
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
  /** Runs contributing to `metricFrames`, including the in-flight batch. */
  runsSampled: number;
  /** Runs in finished batches across the region. */
  runsCompleted: number;
  /** Cells of the region with at least one finished batch. */
  cellsSampled: number;
  /** Cells inside the selected region. */
  cellsInRegion: number;
  /** Ladder target the in-flight batch climbs its cell to; null when done. */
  runTarget: number | null;
  /** Live progress of the in-flight batch; null when idle. */
  progress: MonteCarloWorkerProgress | null;
  computing: boolean;
};

export type InstantiateSweepBatch = (options: {
  /** Concrete swept values for the combination, keyed by identifier. */
  parameterValues: Readonly<Record<string, number>>;
  /** Base seed for this batch (already derived from the batch's run range). */
  seed: number;
  /** Runs this batch adds on top of the combination's finished batches. */
  runCount: number;
  /**
   * A surface-sampling batch rather than the navigator's. Hosts give these a
   * single worker so the navigator's sharded batch keeps the cores.
   */
  background?: boolean;
  signal: AbortSignal;
}) => Promise<MonteCarloExperiment>;

export type CreateSweepSessionOptions = {
  axes: readonly ExperimentParameterAxis[];
  /** Maximum runs per cell — the top of the ladder. */
  runCount: number;
  seed: number;
  /** Starting selection; the whole space when omitted. */
  initialSelection?: SweepSelection;
  instantiateBatch: InstantiateSweepBatch;
  onUpdate: (update: SweepSessionUpdate) => void;
  /** A failed batch stops the session; the owner decides how to surface it. */
  onError: (message: string) => void;
};

export type SweepSession = {
  setSelection: (selection: SweepSelection) => void;
  /**
   * Reads a cell's finished-batch snapshot, by quantized position.
   * The surface sampler uses this to reuse navigator work.
   */
  getCell: (
    position: Readonly<Record<string, number>>,
  ) => SweepCellSnapshot | undefined;
  /**
   * Brings a cell up to at least `minRuns` finished runs, off the
   * navigator's lane — the surface view samples its grid through this.
   *
   * Background batches run one at a time on a single worker, so the
   * navigator's own sharded batch keeps the cores; a cell the navigator has
   * already refined past `minRuns` resolves immediately from cache. Seeds
   * follow the same ladder-position rule as navigator batches, so a cell
   * sampled here and later visited by the navigator resumes the identical
   * run sequence. Resolves null when the session is disposed first.
   */
  sampleCell: (
    position: Readonly<Record<string, number>>,
    minRuns: number,
  ) => Promise<SweepCellSnapshot | null>;
  dispose: () => void;
};

/** Canonical cache key for a cell: quantized positions in axis order. */
export function sweepCellKey(
  axes: readonly ExperimentParameterAxis[],
  position: Readonly<Record<string, number>>,
): string {
  return axes
    .map((axis) => `${axis.identifier}=${position[axis.identifier] ?? 0}`)
    .join("|");
}

/** Concrete parameter values of a cell's position tuple. */
export function sweepCellValues(
  axes: readonly ExperimentParameterAxis[],
  position: Readonly<Record<string, number>>,
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const axis of axes) {
    values[axis.identifier] = axisValueAt(axis, position[axis.identifier] ?? 0);
  }
  return values;
}

/** Whether `position` lies inside the selected region. */
function cellInRegion(
  axes: readonly ExperimentParameterAxis[],
  selection: SweepSelection,
  position: Readonly<Record<string, number>>,
): boolean {
  return axes.every((axis) => {
    const range = selection[axis.identifier] ?? { from: 0, to: axis.stepCount };
    const cellPosition = position[axis.identifier] ?? 0;
    return cellPosition >= range.from && cellPosition <= range.to;
  });
}

/** The base seed of the batch whose first run has global index `from`. */
export function sweepBatchSeed(seed: number, from: number): number {
  return from === 0 ? seed : deriveRunSeed(seed, from);
}

export function createSweepSession(
  options: CreateSweepSessionOptions,
): SweepSession {
  const { axes, runCount, seed, instantiateBatch, onUpdate, onError } = options;

  const cells = new Map<string, SweepCellEntry>();
  let selection: SweepSelection = normalizeSweepSelection(
    axes,
    options.initialSelection ?? fullSweepSelection(axes),
  );
  let disposed = false;
  let failed = false;
  /** Increments per selection change; a stale loop sees it and stops. */
  let generation = 0;
  let abortCurrent: (() => void) | null = null;

  const snapshotFor = (
    position: Readonly<Record<string, number>>,
  ): SweepCellSnapshot =>
    cells.get(sweepCellKey(axes, position)) ?? {
      runsCompleted: 0,
      metricFrames: [],
    };

  const foldCell = (
    position: Readonly<Record<string, number>>,
    snapshot: SweepCellSnapshot,
  ) => {
    cells.set(sweepCellKey(axes, position), { ...snapshot, position });
  };

  /** Cached cells inside the current region. */
  const regionEntries = (): SweepCellEntry[] =>
    [...cells.values()].filter((entry) =>
      cellInRegion(axes, selection, entry.position),
    );

  const publish = (update: {
    activeCell: Readonly<Record<string, number>> | null;
    inFlightFrames?: readonly MonteCarloUserDefinedMetricFrame[];
    inFlightRuns?: number;
    runTarget: number | null;
    progress?: MonteCarloWorkerProgress | null;
    computing: boolean;
  }) => {
    if (disposed) {
      return;
    }
    const entries = regionEntries();
    const inFlight = update.inFlightFrames ?? [];
    const frameSets = entries.map((entry) => entry.metricFrames);
    if (inFlight.length > 0) {
      frameSets.push(inFlight);
    }
    onUpdate({
      selection,
      activeCellValues: update.activeCell
        ? sweepCellValues(axes, update.activeCell)
        : null,
      metricFrames: mergeMetricFramesAcrossCells(frameSets),
      runsSampled:
        entries.reduce((sum, entry) => sum + entry.runsCompleted, 0) +
        (update.inFlightRuns ?? 0),
      runsCompleted: entries.reduce(
        (sum, entry) => sum + entry.runsCompleted,
        0,
      ),
      cellsSampled: entries.filter((entry) => entry.runsCompleted > 0).length,
      cellsInRegion: countRegionCells(axes, selection),
      runTarget: update.runTarget,
      progress: update.progress ?? null,
      computing: update.computing,
    });
  };

  // Reads go through a function so the narrowing-based lint cannot claim the
  // flag is constant: it flips inside closures the checker treats as opaque.
  const isDisposed = (): boolean => disposed;

  /** Whether `loopGeneration` still owns the session's compute slot. */
  const isStale = (loopGeneration: number): boolean =>
    disposed || loopGeneration !== generation;

  /**
   * Runs one ladder batch for `values` and folds it into the cache.
   *
   * Returns whether the loop should continue climbing. Extracted from the
   * loop so its closures capture per-batch constants, not loop variables.
   */
  const executeBatch = async (
    loopGeneration: number,
    position: Readonly<Record<string, number>>,
    snapshot: SweepCellSnapshot,
    target: number,
  ): Promise<"continue" | "stop"> => {
    const values = sweepCellValues(axes, position);
    const abortController = new AbortController();
    // Until the handle exists, aborting the controller is all a restart can
    // do; instantiation rejects with AbortError and the stale loop exits.
    abortCurrent = () => {
      abortController.abort();
    };

    let handle: MonteCarloExperiment;
    try {
      handle = await instantiateBatch({
        parameterValues: values,
        seed: sweepBatchSeed(seed, snapshot.runsCompleted),
        runCount: target - snapshot.runsCompleted,
        signal: abortController.signal,
      });
    } catch (error) {
      if (isStale(loopGeneration)) {
        return "stop";
      }
      failed = true;
      onError(
        error instanceof Error ? error.message : "Failed to start a batch",
      );
      publish({ activeCell: position, runTarget: target, computing: false });
      return "stop";
    }

    if (isStale(loopGeneration)) {
      handle.dispose();
      return "stop";
    }

    // Resolved externally as well as by terminal events: an aborted batch's
    // transports are torn down before a `cancelled` event can travel back,
    // so waiting only on events would hang the loop.
    let resolveDone: (outcome: "complete" | "stopped") => void = () => {};
    const batchDone = new Promise<"complete" | "stopped">((resolve) => {
      resolveDone = resolve;
    });

    const publishLive = () => {
      if (isStale(loopGeneration)) {
        return;
      }
      publish({
        activeCell: position,
        inFlightFrames: handle.metrics.get().frames,
        inFlightRuns: handle.progress.get()?.completedRuns ?? 0,
        runTarget: target,
        progress: handle.progress.get(),
        computing: true,
      });
    };
    const offMetrics = handle.metrics.subscribe(publishLive);
    const offProgress = handle.progress.subscribe(publishLive);
    const offEvents = handle.events.subscribe((event) => {
      if (event.type === "complete") {
        resolveDone("complete");
        return;
      }
      if (event.type === "error" && !disposed) {
        failed = true;
        onError(event.message);
      }
      resolveDone("stopped");
    });

    abortCurrent = () => {
      abortController.abort();
      handle.cancel();
      resolveDone("stopped");
    };

    handle.start();

    const outcome = await batchDone;
    offMetrics();
    offProgress();
    offEvents();

    if (failed && !isStale(loopGeneration)) {
      // The session idles after a failure; leave the last good frames up
      // rather than a spinner that will never finish.
      publish({ activeCell: position, runTarget: null, computing: false });
    }
    const finishedFrames = handle.metrics.get().frames;
    handle.dispose();
    abortCurrent = null;

    if (outcome === "complete") {
      // Fold the batch into the cache even when the user has moved on —
      // completed rays are never thrown away.
      foldCell(position, {
        runsCompleted: target,
        metricFrames: mergeMetricFramesAcrossCells([
          snapshot.metricFrames,
          finishedFrames,
        ]),
      });
      return disposed ? "stop" : "continue";
    }

    return "stop";
  };

  /**
   * Levels the region rung by rung: every cell reaches a ladder target
   * before any cell climbs past it, and cells are visited in the enumerator's
   * low-discrepancy order so early coverage spreads across the region. For a
   * point selection this degenerates to climbing the ladder on one cell.
   */
  const refineLoop = async (loopGeneration: number): Promise<void> => {
    for (;;) {
      let advanced = false;

      for (const position of enumerateRegionCells(axes, selection)) {
        if (isStale(loopGeneration) || failed) {
          return;
        }
        const snapshot = snapshotFor(position);
        const target = getNextRunTarget(snapshot.runsCompleted, runCount);
        if (target === null) {
          continue;
        }
        // One rung per cell per pass: the pass takes every cell up one
        // ladder step before any cell climbs further, so a broad region
        // shows broad coverage before depth.
        publish({ activeCell: position, runTarget: target, computing: true });
        const outcome = await executeBatch(
          loopGeneration,
          position,
          snapshot,
          target,
        );
        if (outcome === "stop") {
          return;
        }
        advanced = true;
      }

      if (isStale(loopGeneration) || failed) {
        return;
      }
      if (!advanced) {
        // Every cell in the region is saturated.
        publish({ activeCell: null, runTarget: null, computing: false });
        return;
      }
    }
  };

  const restart = () => {
    generation += 1;
    abortCurrent?.();
    abortCurrent = null;
    void refineLoop(generation);
  };

  restart();

  /** Serializes background sampling; one small batch in flight at most. */
  let backgroundChain: Promise<unknown> = Promise.resolve();

  const runBackgroundBatch = async (
    position: Readonly<Record<string, number>>,
    minRuns: number,
  ): Promise<SweepCellSnapshot | null> => {
    if (disposed || failed) {
      return null;
    }
    const snapshot = snapshotFor(position);
    const target = Math.min(minRuns, runCount);
    if (snapshot.runsCompleted >= target) {
      return snapshot;
    }

    const abortController = new AbortController();
    let handle: MonteCarloExperiment;
    try {
      handle = await instantiateBatch({
        parameterValues: sweepCellValues(axes, position),
        seed: sweepBatchSeed(seed, snapshot.runsCompleted),
        runCount: target - snapshot.runsCompleted,
        background: true,
        signal: abortController.signal,
      });
    } catch {
      // A refused background cell is a hole in the surface, not a failed
      // sweep; the navigator lane reports real errors.
      return null;
    }
    if (isDisposed()) {
      handle.dispose();
      return null;
    }

    const done = new Promise<boolean>((resolve) => {
      const offEvents = handle.events.subscribe((event) => {
        offEvents();
        resolve(event.type === "complete");
      });
    });
    handle.start();
    const completed = await done;
    const frames = handle.metrics.get().frames;
    handle.dispose();

    if (!completed || isDisposed()) {
      return null;
    }
    // The navigator may have refined this cell further while we sampled; the
    // deeper snapshot wins.
    if (snapshotFor(position).runsCompleted < target) {
      foldCell(position, {
        runsCompleted: target,
        metricFrames: mergeMetricFramesAcrossCells([
          snapshot.metricFrames,
          frames,
        ]),
      });
    }
    return snapshotFor(position);
  };

  return {
    setSelection(next) {
      if (disposed) {
        return;
      }
      const normalized = normalizeSweepSelection(axes, next);
      const changed = axes.some((axis) => {
        const current = selection[axis.identifier]!;
        const incoming = normalized[axis.identifier]!;
        return current.from !== incoming.from || current.to !== incoming.to;
      });
      if (!changed) {
        return;
      }
      selection = normalized;
      restart();
    },
    getCell(position) {
      return cells.get(sweepCellKey(axes, position));
    },
    sampleCell(position, minRuns) {
      const next = backgroundChain.then(() =>
        runBackgroundBatch({ ...position }, minRuns),
      );
      backgroundChain = next.catch(() => null);
      return next;
    },
    dispose() {
      disposed = true;
      generation += 1;
      abortCurrent?.();
      abortCurrent = null;
    },
  };
}
