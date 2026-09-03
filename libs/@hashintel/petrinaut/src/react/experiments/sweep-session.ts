/**
 * Progressive computation of one parameter-sweep experiment.
 *
 * A sweep never computes its whole grid. It computes the combination the
 * navigator points at, in batches that climb `EXPERIMENT_RUN_LADDER`, and
 * restarts on the new combination the moment the selection changes — the way
 * a raytracer drops its rays when the camera moves. Finished batches fold
 * into a per-combination cache, so revisiting a combination resumes from its
 * ladder position instead of starting over.
 *
 * The session is backend-agnostic: it asks an injected `instantiateBatch` for
 * a `MonteCarloExperiment` per batch and only consumes the handle's stores,
 * so CPU worker pools and the WebGPU backend behave identically here.
 *
 * Determinism: batch *b* covering runs `[from, target)` derives its base seed
 * as `deriveRunSeed(seed, from)` (the first batch keeps `seed` verbatim).
 * Every combination climbs the same ladder, so the same rung uses the same
 * seeds in every combination — common random numbers across the grid — and
 * re-running a rung after a cancellation repeats it exactly.
 */
import { deriveRunSeed } from "@hashintel/petrinaut-core";

import {
  getNextRunTarget,
  mergeMetricFramesAcrossCells,
} from "./parameter-grid";

import type { ExperimentParameterAxis } from "./parameter-grid";
import type {
  MonteCarloExperiment,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloWorkerProgress,
} from "@hashintel/petrinaut-core";

/** Navigator position: value *index* per swept parameter identifier. */
export type SweepSelection = Readonly<Record<string, number>>;

/** Finished batches of one combination, merged. */
export type SweepCellSnapshot = {
  runsCompleted: number;
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
};

/** What the session streams to its owner on every meaningful change. */
export type SweepSessionUpdate = {
  selection: SweepSelection;
  /** Concrete swept values for `selection`, keyed by identifier. */
  parameterValues: Readonly<Record<string, number>>;
  /** Cached batches plus the in-flight batch, merged. */
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
  /** Runs contributing to `metricFrames`, including the in-flight batch. */
  runsSampled: number;
  /** Runs in finished batches only. */
  runsCompleted: number;
  /** Ladder target the in-flight batch climbs to; null when saturated. */
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
  /** Maximum runs per combination — the top of the ladder. */
  runCount: number;
  seed: number;
  instantiateBatch: InstantiateSweepBatch;
  onUpdate: (update: SweepSessionUpdate) => void;
  /** A failed batch stops the session; the owner decides how to surface it. */
  onError: (message: string) => void;
};

export type SweepSession = {
  setSelection: (selection: SweepSelection) => void;
  /**
   * Reads a combination's finished-batch snapshot, by concrete values.
   * The surface sampler uses this to reuse navigator work.
   */
  getCell: (
    parameterValues: Readonly<Record<string, number>>,
  ) => SweepCellSnapshot | undefined;
  /**
   * Brings a combination up to at least `minRuns` finished runs, off the
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
    parameterValues: Readonly<Record<string, number>>,
    minRuns: number,
  ) => Promise<SweepCellSnapshot | null>;
  dispose: () => void;
};

/** Canonical cache key for a combination: values in axis order. */
export function sweepCellKey(
  axes: readonly ExperimentParameterAxis[],
  parameterValues: Readonly<Record<string, number>>,
): string {
  return axes
    .map((axis) => `${axis.identifier}=${parameterValues[axis.identifier]}`)
    .join("|");
}

/** Concrete values for a selection of value indices. */
export function sweepSelectionValues(
  axes: readonly ExperimentParameterAxis[],
  selection: SweepSelection,
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const axis of axes) {
    const index = selection[axis.identifier] ?? 0;
    values[axis.identifier] =
      axis.values[Math.min(Math.max(index, 0), axis.values.length - 1)]!;
  }
  return values;
}

/** The base seed of the batch whose first run has global index `from`. */
export function sweepBatchSeed(seed: number, from: number): number {
  return from === 0 ? seed : deriveRunSeed(seed, from);
}

export function createSweepSession(
  options: CreateSweepSessionOptions,
): SweepSession {
  const { axes, runCount, seed, instantiateBatch, onUpdate, onError } = options;

  const cells = new Map<string, SweepCellSnapshot>();
  let selection: SweepSelection = Object.fromEntries(
    axes.map((axis) => [axis.identifier, 0]),
  );
  let disposed = false;
  let failed = false;
  /** Increments per selection change; a stale loop sees it and stops. */
  let generation = 0;
  let abortCurrent: (() => void) | null = null;

  const snapshotFor = (key: string): SweepCellSnapshot =>
    cells.get(key) ?? { runsCompleted: 0, metricFrames: [] };

  const publish = (update: {
    values: Record<string, number>;
    inFlightFrames?: readonly MonteCarloUserDefinedMetricFrame[];
    inFlightRuns?: number;
    runTarget: number | null;
    progress?: MonteCarloWorkerProgress | null;
    computing: boolean;
  }) => {
    if (disposed) {
      return;
    }
    const snapshot = snapshotFor(sweepCellKey(axes, update.values));
    const inFlight = update.inFlightFrames ?? [];
    onUpdate({
      selection,
      parameterValues: update.values,
      metricFrames:
        inFlight.length > 0
          ? mergeMetricFramesAcrossCells([snapshot.metricFrames, inFlight])
          : snapshot.metricFrames,
      runsSampled: snapshot.runsCompleted + (update.inFlightRuns ?? 0),
      runsCompleted: snapshot.runsCompleted,
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
    values: Record<string, number>,
    key: string,
    snapshot: SweepCellSnapshot,
    target: number,
  ): Promise<"continue" | "stop"> => {
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
      publish({ values, runTarget: target, computing: false });
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
        values,
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
      publish({ values, runTarget: null, computing: false });
    }
    const finishedFrames = handle.metrics.get().frames;
    handle.dispose();
    abortCurrent = null;

    if (outcome === "complete") {
      // Fold the batch into the cache even when the user has moved on —
      // completed rays are never thrown away.
      cells.set(key, {
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

  const refineLoop = async (loopGeneration: number): Promise<void> => {
    while (!isStale(loopGeneration) && !failed) {
      const values = sweepSelectionValues(axes, selection);
      const key = sweepCellKey(axes, values);
      const snapshot = snapshotFor(key);
      const target = getNextRunTarget(snapshot.runsCompleted, runCount);

      if (target === null) {
        publish({ values, runTarget: null, computing: false });
        return;
      }

      publish({ values, runTarget: target, computing: true });

      const outcome = await executeBatch(
        loopGeneration,
        values,
        key,
        snapshot,
        target,
      );
      if (outcome === "stop") {
        return;
      }
      // Loop: next ladder rung for the (possibly unchanged) selection.
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
    values: Record<string, number>,
    minRuns: number,
  ): Promise<SweepCellSnapshot | null> => {
    if (disposed || failed) {
      return null;
    }
    const key = sweepCellKey(axes, values);
    const snapshot = snapshotFor(key);
    const target = Math.min(minRuns, runCount);
    if (snapshot.runsCompleted >= target) {
      return snapshot;
    }

    const abortController = new AbortController();
    let handle: MonteCarloExperiment;
    try {
      handle = await instantiateBatch({
        parameterValues: values,
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
    const merged: SweepCellSnapshot = {
      runsCompleted: target,
      metricFrames: mergeMetricFramesAcrossCells([
        snapshot.metricFrames,
        frames,
      ]),
    };
    // The navigator may have refined this cell further while we sampled; the
    // deeper snapshot wins.
    if (snapshotFor(key).runsCompleted < target) {
      cells.set(key, merged);
    }
    return snapshotFor(key);
  };

  return {
    setSelection(next) {
      if (disposed) {
        return;
      }
      const changed = axes.some(
        (axis) => (next[axis.identifier] ?? 0) !== selection[axis.identifier],
      );
      if (!changed) {
        return;
      }
      selection = Object.fromEntries(
        axes.map((axis) => [axis.identifier, next[axis.identifier] ?? 0]),
      );
      restart();
    },
    getCell(parameterValues) {
      return cells.get(sweepCellKey(axes, parameterValues));
    },
    sampleCell(parameterValues, minRuns) {
      const next = backgroundChain.then(() =>
        runBackgroundBatch({ ...parameterValues }, minRuns),
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
