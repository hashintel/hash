/**
 * Progressive computation of one parameter-sweep experiment.
 *
 * The session computes exactly what the navigator selects and restarts the
 * moment the selection changes — the way a raytracer drops its rays when the
 * camera moves. A **point** selection runs the experiment at that value. A
 * **range** selection runs one stochastic experiment over the ranges: every
 * run draws its own value for each ranged parameter, low-discrepancy across
 * the selected intervals (`sweepRunFraction`), so the metric stream is the
 * live distribution over the region and sharpens exactly like a plain
 * experiment's. There is no grid and no per-cell batching — one selection,
 * one experiment, full parallelism, streaming from the first frames.
 *
 * Either kind climbs `EXPERIMENT_RUN_LADDER` in batches. Finished batches
 * fold into a cache keyed by the whole selection (a point is a degenerate
 * range), so revisiting any earlier selection — narrowing, collapsing to a
 * point, sliding back — restores its runs and resumes from its ladder
 * position.
 *
 * The session is backend-agnostic: it asks an injected `instantiateBatch` for
 * a `MonteCarloExperiment` per batch and only consumes the handle's stores.
 * A range batch carries per-run parameter values (`runs`), which the WebGPU
 * backend refuses — hosts route those to the CPU worker pool; point batches
 * stay GPU-eligible.
 *
 * Determinism: a batch covering runs `[from, target)` derives its base seed
 * as `deriveRunSeed(seed, from)` (the first batch keeps `seed` verbatim), and
 * a run's parameter draw depends only on its global index and the selected
 * range. The same rung therefore uses the same seeds in every selection —
 * common random numbers — and re-running a cancelled rung repeats it exactly.
 */
import { deriveRunSeed } from "@hashintel/petrinaut-core";

import {
  axisValueAt,
  fullSweepSelection,
  getNextRunTarget,
  mergeMetricFramesAcrossCells,
  normalizeSweepSelection,
  sweepRunFraction,
} from "./parameter-grid";

import type { ExperimentParameterAxis, SweepSelection } from "./parameter-grid";
import type {
  MonteCarloExperiment,
  MonteCarloRunConfig,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloWorkerProgress,
} from "@hashintel/petrinaut-core";

export type { SweepSelection } from "./parameter-grid";

/** Finished batches of one selection, merged. */
export type SweepCellSnapshot = {
  runsCompleted: number;
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
};

/** What the session streams to its owner on every meaningful change. */
export type SweepSessionUpdate = {
  selection: SweepSelection;
  /** Cached batches of the selection plus the in-flight batch, merged. */
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
  /**
   * One concrete value per swept parameter: the selected value for a point
   * axis, the range midpoint for a ranged axis. Scenario compilation uses
   * these — an initial state derived from a ranged parameter holds at the
   * midpoint while runtime reads vary per run.
   */
  parameterValues: Readonly<Record<string, number>>;
  /**
   * Per-run parameter values for the batch's runs, present only when some
   * axis has a non-degenerate range. Backends that bake parameters in cannot
   * run these; hosts route them to the CPU worker pool at full parallelism.
   */
  runs?: readonly MonteCarloRunConfig[];
  /** Base seed for this batch (already derived from the batch's run range). */
  seed: number;
  /** Runs this batch adds on top of the selection's finished batches. */
  runCount: number;
  /**
   * A surface-sampling batch rather than the navigator's. Hosts give these a
   * single worker so the navigator's batch keeps the cores.
   */
  background?: boolean;
  signal: AbortSignal;
}) => Promise<MonteCarloExperiment>;

export type CreateSweepSessionOptions = {
  axes: readonly ExperimentParameterAxis[];
  /** Maximum runs per selection — the top of the ladder. */
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
   * Reads a point's finished-batch snapshot, by quantized position.
   * The surface sampler uses this to reuse navigator work.
   */
  getCell: (
    position: Readonly<Record<string, number>>,
  ) => SweepCellSnapshot | undefined;
  /**
   * Brings a point up to at least `minRuns` finished runs, off the
   * navigator's lane — the surface view samples its grid through this.
   *
   * Background batches run one at a time on a single worker, so the
   * navigator's own batch keeps the cores; a point the navigator has already
   * refined past `minRuns` resolves immediately from cache. Seeds follow the
   * same ladder-position rule as navigator batches, so a point sampled here
   * and later visited by the navigator resumes the identical run sequence.
   * Resolves null when the session is disposed first.
   */
  sampleCell: (
    position: Readonly<Record<string, number>>,
    minRuns: number,
  ) => Promise<SweepCellSnapshot | null>;
  dispose: () => void;
};

/** Canonical cache key for a point: quantized positions in axis order. */
export function sweepCellKey(
  axes: readonly ExperimentParameterAxis[],
  position: Readonly<Record<string, number>>,
): string {
  return axes
    .map((axis) => `${axis.identifier}=${position[axis.identifier] ?? 0}`)
    .join("|");
}

/**
 * Canonical cache key for a selection. A degenerate range (a point) produces
 * the same key as `sweepCellKey` for its position, so the navigator and the
 * surface sampler share cached point results.
 */
export function sweepSelectionKey(
  axes: readonly ExperimentParameterAxis[],
  selection: SweepSelection,
): string {
  return axes
    .map((axis) => {
      const range = selection[axis.identifier] ?? {
        from: 0,
        to: axis.stepCount,
      };
      return range.from === range.to
        ? `${axis.identifier}=${range.from}`
        : `${axis.identifier}=${range.from}..${range.to}`;
    })
    .join("|");
}

/** Concrete parameter values of a point's position tuple. */
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

/**
 * One concrete value per axis for a selection: the value at a point, the
 * range midpoint otherwise. What scenario compilation sees.
 */
export function sweepSelectionMidValues(
  axes: readonly ExperimentParameterAxis[],
  selection: SweepSelection,
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const axis of axes) {
    const range = selection[axis.identifier] ?? {
      from: 0,
      to: axis.stepCount,
    };
    // Midpoint in value space, not position space, so coarse axes do not
    // round the middle onto an endpoint.
    const middle =
      (axisValueAt(axis, range.from) + axisValueAt(axis, range.to)) / 2;
    values[axis.identifier] = axis.integer
      ? Math.round(middle)
      : Number(middle.toPrecision(12));
  }
  return values;
}

/**
 * Per-run parameter values for a range selection's batch covering global run
 * indices `[from, target)`, or undefined when every axis is a point. Each
 * ranged axis draws continuously inside its selected value interval — the
 * quantized positions bound the interval, they do not grid it — via the
 * axis's own seed-shifted low-discrepancy sequence, prefix-stable in the
 * run index.
 */
export function sweepRangeRuns(
  seed: number,
  axes: readonly ExperimentParameterAxis[],
  selection: SweepSelection,
  from: number,
  target: number,
): MonteCarloRunConfig[] | undefined {
  const ranged = axes
    .map((axis, axisIndex) => {
      const range = selection[axis.identifier] ?? {
        from: 0,
        to: axis.stepCount,
      };
      if (range.from === range.to) {
        return null;
      }
      return {
        axis,
        axisIndex,
        low: axisValueAt(axis, range.from),
        high: axisValueAt(axis, range.to),
      };
    })
    .filter((entry) => entry !== null);

  if (ranged.length === 0) {
    return undefined;
  }

  return Array.from({ length: target - from }, (_, localIndex) => {
    const globalIndex = from + localIndex;
    const parameterValues: Record<string, string> = {};
    for (const { axis, axisIndex, low, high } of ranged) {
      const raw =
        low + sweepRunFraction(seed, globalIndex, axisIndex) * (high - low);
      parameterValues[axis.identifier] = String(
        axis.integer ? Math.round(raw) : Number(raw.toPrecision(12)),
      );
    }
    return { parameterValues };
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

  /** Finished batches per selection key (points and ranges alike). */
  const cache = new Map<string, SweepCellSnapshot>();
  let selection: SweepSelection = normalizeSweepSelection(
    axes,
    options.initialSelection ?? fullSweepSelection(axes),
  );
  let disposed = false;
  let failed = false;
  /** Increments per selection change; a stale loop sees it and stops. */
  let generation = 0;
  let abortCurrent: (() => void) | null = null;

  const snapshotFor = (key: string): SweepCellSnapshot =>
    cache.get(key) ?? { runsCompleted: 0, metricFrames: [] };

  const publish = (update: {
    inFlightFrames?: readonly MonteCarloUserDefinedMetricFrame[];
    inFlightRuns?: number;
    runTarget: number | null;
    progress?: MonteCarloWorkerProgress | null;
    computing: boolean;
  }) => {
    if (disposed) {
      return;
    }
    const snapshot = snapshotFor(sweepSelectionKey(axes, selection));
    const inFlight = update.inFlightFrames ?? [];
    onUpdate({
      selection,
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
   * Runs one ladder batch for the current selection and folds it into the
   * cache. Returns whether the loop should continue climbing.
   */
  const executeBatch = async (
    loopGeneration: number,
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

    const runs = sweepRangeRuns(
      seed,
      axes,
      selection,
      snapshot.runsCompleted,
      target,
    );

    let handle: MonteCarloExperiment;
    try {
      handle = await instantiateBatch({
        parameterValues: sweepSelectionMidValues(axes, selection),
        ...(runs === undefined ? {} : { runs }),
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
      publish({ runTarget: target, computing: false });
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
      publish({ runTarget: null, computing: false });
    }
    const finishedFrames = handle.metrics.get().frames;
    handle.dispose();
    abortCurrent = null;

    if (outcome === "complete") {
      // Fold the batch into the cache even when the user has moved on —
      // completed rays are never thrown away.
      cache.set(key, {
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
      const key = sweepSelectionKey(axes, selection);
      const snapshot = snapshotFor(key);
      const target = getNextRunTarget(snapshot.runsCompleted, runCount);

      if (target === null) {
        publish({ runTarget: null, computing: false });
        return;
      }

      publish({ runTarget: target, computing: true });

      const outcome = await executeBatch(loopGeneration, key, snapshot, target);
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
    position: Readonly<Record<string, number>>,
    minRuns: number,
  ): Promise<SweepCellSnapshot | null> => {
    if (disposed || failed) {
      return null;
    }
    const key = sweepCellKey(axes, position);
    const snapshot = snapshotFor(key);
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
      // A refused background point is a hole in the surface, not a failed
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
    // The navigator may have refined this point further while we sampled; the
    // deeper snapshot wins.
    if (snapshotFor(key).runsCompleted < target) {
      cache.set(key, {
        runsCompleted: target,
        metricFrames: mergeMetricFramesAcrossCells([
          snapshot.metricFrames,
          frames,
        ]),
      });
    }
    return snapshotFor(key);
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
      return cache.get(sweepCellKey(axes, position));
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
