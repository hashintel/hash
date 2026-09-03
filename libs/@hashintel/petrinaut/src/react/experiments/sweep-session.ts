/**
 * Progressive computation of one parameter-sweep experiment.
 *
 * The session computes exactly what the navigator selects and restarts the
 * moment the selection changes. A **point** selection runs the experiment at
 * that value. A **range** selection runs one stochastic experiment over the
 * ranges: every run draws its own value for each ranged parameter,
 * low-discrepancy across the selected intervals (`sweepRunFraction`), so the
 * metric stream is the live distribution over the region.
 *
 * Either kind climbs `EXPERIMENT_RUN_LADDER` in batches. Finished batches
 * fold into a cache keyed by the whole selection (a point is a degenerate
 * range), so revisiting an earlier selection restores its runs and resumes
 * from its ladder position. The surface view samples its grid through the
 * same session, off the navigator's lane.
 *
 * The session is backend-agnostic: it asks an injected `instantiateBatch` for
 * a `MonteCarloExperiment` per batch and only consumes the handle's stores.
 *
 * Determinism: a batch covering runs `[from, target)` derives its base seed
 * as `deriveRunSeed(seed, from)` (the first batch keeps `seed` verbatim), and
 * a run's parameter draw depends only on its global index and the selected
 * range. The same rung therefore uses the same seeds in every selection —
 * common random numbers — and re-running a cancelled rung repeats it exactly.
 */
import { runExperimentToCompletion } from "@hashintel/petrinaut-core";

import {
  axisValueAt,
  fullSweepSelection,
  getNextRunTarget,
  mergeMetricFramesAcrossCells,
  normalizeSweepSelection,
} from "./parameter-grid";
import { createThrottle } from "./shared/throttle";
import { sweepCellObjective } from "./sweep-cell-objective";
import { createBatchRegistry } from "./sweep-session/batch-registry";
import {
  groupCellMeans,
  layoutCellBatch,
  type CellMeans,
} from "./sweep-session/cell-batch";
import {
  sweepBatchSeed,
  sweepCellKey,
  sweepCellValues,
  sweepRangeDraws,
  sweepSelectionKey,
} from "./sweep-session/selection-draws";

import type { ExperimentParameterAxis, SweepSelection } from "./parameter-grid";
import type { SweepBatchStatus } from "./sweep-session/batch-registry";
import type { SweepRunDraws } from "./sweep-session/selection-draws";
import type {
  ExperimentCompletion,
  MonteCarloExperiment,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloWorkerProgress,
} from "@hashintel/petrinaut-core";

export type { SweepSelection } from "./parameter-grid";
export type { SweepBatchStatus } from "./sweep-session/batch-registry";
export { sweepBatchSeed } from "./sweep-session/selection-draws";
export type { SweepRunDraws } from "./sweep-session/selection-draws";

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

/** Finished batches of one selection, merged. */
export type SweepCellSnapshot = {
  runsCompleted: number;
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
};

/** What the session streams to its owner on every meaningful change. */
export type SweepSessionUpdate = {
  selection: SweepSelection;
  /** Cached batches of the selection plus the in-flight batches, merged. */
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
  /** Runs contributing to `metricFrames`, including in-flight batches. */
  runsSampled: number;
  /** Runs in finished batches only. */
  runsCompleted: number;
  /** Ladder target the in-flight batch climbs to; null when saturated. */
  runTarget: number | null;
  /** Live progress of the oldest in-flight batch; null when idle. */
  progress: MonteCarloWorkerProgress | null;
  computing: boolean;
  /** A batch failed; the session computes nothing more for this selection. */
  failed: boolean;
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
   * Per-run parameter draws, present only when some axis has a
   * non-degenerate range. The CPU pool applies them per run; the WebGPU
   * backend reads them from a per-run parameter buffer.
   */
  draws?: SweepRunDraws;
  /** Base seed for this batch (already derived from the batch's run range). */
  seed: number;
  /** Runs this batch adds on top of the selection's finished batches. */
  runCount: number;
  /**
   * A surface-sampling batch rather than the navigator's. Hosts give these a
   * narrow lane so the navigator's batch keeps the cores.
   */
  background?: boolean;
  /**
   * The batch's consumer reads per-run metric values (`runResults`), which
   * only the CPU workers report.
   */
  requiresRunResults?: boolean;
  /**
   * Whether the session's own ladder was computing when this background
   * batch was requested. Hosts widen a background batch's lane once the
   * ladder idles or computes elsewhere (the GPU).
   */
  foregroundActive?: boolean;
  /**
   * Explicit per-run seeds (one per run, aligned with `draws`). Batched
   * surface cells pin these so a cell's runs use the same seeds regardless
   * of which chunk sampled it — and the same seeds its own ladder's first
   * batch would use.
   */
  runSeeds?: readonly number[];
  signal: AbortSignal;
}) => Promise<MonteCarloExperiment>;

/**
 * Receives a chunk's per-cell means as they firm up mid-flight, index-aligned
 * with the requested positions; a cell with no finished runs yet is null.
 */
export type SampleCellsPartialListener = (cells: CellMeans) => void;

export type CreateSweepSessionOptions = {
  axes: readonly ExperimentParameterAxis[];
  /** Maximum runs per selection — the top of the ladder. */
  runCount: number;
  seed: number;
  /** Starting selection; the whole space when omitted. */
  initialSelection?: SweepSelection;
  instantiateBatch: InstantiateSweepBatch;
  /**
   * A comparable key of the initial marking the scenario compiles to at one
   * cell's values, or null when those values do not compile. A surface chunk
   * runs as one batch only when every cell shares the first cell's key: one
   * batch carries one marking, so a marking the swept parameters shape
   * samples cell by cell instead.
   */
  initialMarkingKey: (
    values: Readonly<Record<string, number>>,
  ) => string | null;
  onUpdate: (update: SweepSessionUpdate) => void;
  /**
   * Every batch currently computing, foreground and background alike,
   * whenever the list or a batch's progress changes. Separate from
   * `onUpdate` so background progress does not republish the selection's
   * frames. Dispose publishes the empty list.
   */
  onBatches?: (batches: readonly SweepBatchStatus[]) => void;
  /**
   * Coalesces in-flight publishes: after a leading publish, further store
   * ticks inside this window fold into one trailing publish. 0 (the
   * default) publishes on every tick. Terminal publishes (batch end,
   * saturation, errors) are never delayed.
   */
  publishThrottleMs?: number;
  /** A failed batch stops the session; the owner decides how to surface it. */
  onError: (message: string) => void;
};

export type SweepSession = {
  setSelection: (selection: SweepSelection) => void;
  /**
   * Resolves once the CURRENT selection has streamed data — its first
   * in-flight frames, a cache hit with runs, or a failure (nothing to wait
   * for). Re-arms on every selection change, so awaiting it before secondary
   * work keeps the navigator's own point first in line at all times.
   */
  whenSelectionStreamed: () => Promise<void>;
  /** Reads a point's finished-batch snapshot, by quantized position. */
  getCell: (
    position: Readonly<Record<string, number>>,
  ) => SweepCellSnapshot | undefined;
  /**
   * Samples surface cells to `runsPerCell` runs each and resolves with each
   * cell's per-metric mean, index-aligned with `positions` (null for a cell
   * with no finished runs). Cells sharing one initial marking run as one
   * batch; otherwise each cell runs its own, reusing the navigator's cached
   * runs, and streams through `onPartial` as it resolves. Resolves null when
   * the session is disposed or the batch is refused.
   */
  sampleCells: (
    positions: readonly Readonly<Record<string, number>>[],
    runsPerCell: number,
    onPartial?: SampleCellsPartialListener,
  ) => Promise<CellMeans | null>;
  dispose: () => void;
};

/** Per-metric objective of a finished snapshot, for the metrics it holds. */
const snapshotMeans = (
  frames: readonly MonteCarloUserDefinedMetricFrame[],
): Readonly<Record<string, number>> => {
  const means: Record<string, number> = {};
  for (const metricId of new Set(frames.map((frame) => frame.metricId))) {
    const value = sweepCellObjective(frames, metricId);
    if (value !== null) {
      means[metricId] = value;
    }
  }
  return means;
};

export function createSweepSession(
  options: CreateSweepSessionOptions,
): SweepSession {
  const {
    axes,
    runCount,
    seed,
    instantiateBatch,
    initialMarkingKey,
    onUpdate,
    onError,
  } = options;

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
  /**
   * Background batches are cancelled through their handle, never through
   * this signal: aborting a started handle's signal tears its transports
   * down before the terminal event arrives, while `cancel()` ends the batch
   * with a `cancelled` event the awaiting code observes.
   */
  const backgroundSignal = new AbortController().signal;
  const backgroundHandles = new Set<MonteCarloExperiment>();
  /**
   * Generation whose refine loop is between its first batch and going idle;
   * null when the ladder finished or failed. Background batches read this
   * to know whether the foreground owns the compute right now.
   */
  let computingGeneration: number | null = null;
  const isForegroundComputing = (): boolean =>
    computingGeneration === generation;

  const registry = createBatchRegistry(options.onBatches ?? (() => {}));

  const snapshotFor = (key: string): SweepCellSnapshot =>
    cache.get(key) ?? { runsCompleted: 0, metricFrames: [] };

  /**
   * The last live merge, keyed by both inputs' identities: progress ticks
   * re-publish the same frame arrays, and re-merging every cached frame
   * against every in-flight frame per tick was the hottest main-thread cost.
   */
  let mergeCache: {
    cached: readonly MonteCarloUserDefinedMetricFrame[];
    inFlight: readonly MonteCarloUserDefinedMetricFrame[];
    result: readonly MonteCarloUserDefinedMetricFrame[];
  } | null = null;
  const mergeLive = (
    cached: readonly MonteCarloUserDefinedMetricFrame[],
    inFlight: readonly MonteCarloUserDefinedMetricFrame[],
  ): readonly MonteCarloUserDefinedMetricFrame[] => {
    if (
      mergeCache === null ||
      mergeCache.cached !== cached ||
      mergeCache.inFlight !== inFlight
    ) {
      mergeCache = {
        cached,
        inFlight,
        result: mergeMetricFramesAcrossCells([cached, inFlight]),
      };
    }
    return mergeCache.result;
  };

  /**
   * Generation whose selection has visibly streamed (see
   * `whenSelectionStreamed`); `restart` bumping `generation` re-arms the
   * gate without touching this.
   */
  let streamedGeneration = -1;
  let streamedWaiters: (() => void)[] = [];
  const markSelectionStreamed = () => {
    streamedGeneration = generation;
    const waiters = streamedWaiters;
    streamedWaiters = [];
    for (const waiter of waiters) {
      waiter();
    }
  };

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
    // Data on screen for the current selection — cached runs or the first
    // in-flight frames — opens the gate for secondary (surface) sampling.
    if (
      snapshot.runsCompleted > 0 ||
      inFlight.length > 0 ||
      (update.inFlightRuns ?? 0) > 0
    ) {
      markSelectionStreamed();
    }
    onUpdate({
      selection,
      metricFrames:
        inFlight.length > 0
          ? mergeLive(snapshot.metricFrames, inFlight)
          : snapshot.metricFrames,
      runsSampled: snapshot.runsCompleted + (update.inFlightRuns ?? 0),
      runsCompleted: snapshot.runsCompleted,
      runTarget: update.runTarget,
      progress: update.progress ?? null,
      computing: update.computing,
      failed,
    });
  };

  // Reads go through a function so the narrowing-based lint cannot claim the
  // flag is constant: it flips inside closures the checker treats as opaque.
  const isDisposed = (): boolean => disposed;
  const isFailed = (): boolean => failed;

  /** Whether `loopGeneration` still owns the session's compute slot. */
  const isStale = (loopGeneration: number): boolean =>
    disposed || loopGeneration !== generation;

  /**
   * One in-flight ladder batch. Rungs cover disjoint run ranges with
   * prefix-stable draws and seeds, so a successor can compute while its
   * predecessor is still running; only the FOLD into the cache is ordered.
   */
  type LadderRung = {
    target: number;
    handle: MonteCarloExperiment;
    /** Resolves with how the batch ended (external abort included). */
    done: Promise<"complete" | "stopped">;
    /** Resolves on the first metric frames — or on `done`, so races never hang. */
    streamed: Promise<void>;
    abort: () => void;
    /** Unsubscribes the rung's handle listeners. */
    detach: () => void;
  };

  /**
   * Starts one ladder batch for runs `[from, target)` of the current
   * selection. Returns null when the batch was superseded (abort, stale
   * generation) or failed — failure marks the session failed and publishes.
   */
  const startRung = async (
    loopGeneration: number,
    from: number,
    target: number,
    abortSet: Set<() => void>,
    onLiveTick: () => void,
  ): Promise<LadderRung | null> => {
    const abortController = new AbortController();
    // Until the handle exists, aborting the controller is all a restart can
    // do; instantiation rejects with AbortError and the stale loop exits.
    let abortRung = () => {
      abortController.abort();
    };
    const abortEntry = () => {
      abortRung();
    };
    abortSet.add(abortEntry);

    let draws: SweepRunDraws | undefined;
    try {
      draws = await sweepRangeDraws(
        seed,
        axes,
        selection,
        from,
        target,
        abortController.signal,
      );
    } catch (error) {
      abortSet.delete(abortEntry);
      // An abort means a restart or a dispose already superseded this
      // generation; anything else stops the selection with its reason.
      if (isStale(loopGeneration) || isAbortError(error)) {
        return null;
      }
      failed = true;
      onError(
        error instanceof Error ? error.message : "Failed to draw a batch",
      );
      publish({ runTarget: target, computing: false });
      markSelectionStreamed();
      return null;
    }

    // The value at a point axis, the range midpoint otherwise — taken in
    // value space so a coarse axis does not round it onto an endpoint.
    const parameterValues: Record<string, number> = {};
    for (const axis of axes) {
      const range = selection[axis.identifier]!;
      const middle =
        (axisValueAt(axis, range.from) + axisValueAt(axis, range.to)) / 2;
      parameterValues[axis.identifier] = axis.integer
        ? Math.round(middle)
        : Number(middle.toPrecision(12));
    }

    let handle: MonteCarloExperiment;
    try {
      handle = await instantiateBatch({
        parameterValues,
        draws,
        seed: sweepBatchSeed(seed, from),
        runCount: target - from,
        signal: abortController.signal,
      });
    } catch (error) {
      abortSet.delete(abortEntry);
      if (isStale(loopGeneration)) {
        return null;
      }
      failed = true;
      onError(
        error instanceof Error ? error.message : "Failed to start a batch",
      );
      publish({ runTarget: target, computing: false });
      // Nothing more will stream for this selection; unblock waiters so the
      // surface's own attempts can run (and refuse) instead of hanging.
      markSelectionStreamed();
      return null;
    }

    if (isStale(loopGeneration)) {
      abortSet.delete(abortEntry);
      handle.dispose();
      return null;
    }

    // Resolved externally as well as by terminal events: an aborted batch's
    // transports are torn down before a `cancelled` event can travel back,
    // so waiting only on events would hang the loop.
    let resolveDone: (outcome: "complete" | "stopped") => void = () => {};
    const done = new Promise<"complete" | "stopped">((resolve) => {
      resolveDone = resolve;
    });
    let resolveStreamed: () => void = () => {};
    const streamed = new Promise<void>((resolve) => {
      resolveStreamed = resolve;
    });
    void done.then(() => {
      resolveStreamed();
      abortSet.delete(abortEntry);
    });

    const offMetrics = handle.metrics.subscribe(() => {
      if (handle.metrics.get().frames.length > 0) {
        resolveStreamed();
      }
      onLiveTick();
    });
    const offProgress = handle.progress.subscribe(onLiveTick);
    const offEvents = handle.events.subscribe((event) => {
      if (event.type === "complete") {
        resolveDone("complete");
        return;
      }
      if (event.type === "error" && !disposed && !isStale(loopGeneration)) {
        failed = true;
        onError(event.message);
        // Nothing more streams for this selection; the surface's waiters
        // resume and refuse instead of hanging.
        markSelectionStreamed();
      }
      resolveDone("stopped");
    });

    abortRung = () => {
      abortController.abort();
      handle.cancel();
      resolveDone("stopped");
    };

    handle.start();
    const unregister = registry.register("selection", target - from, handle);
    void done.then(unregister);

    return {
      target,
      handle,
      done,
      streamed,
      abort: abortEntry,
      detach: () => {
        offMetrics();
        offProgress();
        offEvents();
      },
    };
  };

  /**
   * Climbs the run ladder for the current selection, PIPELINED: as soon as
   * the current rung streams its first frames, the next rung starts — run
   * ranges are disjoint and draws/seeds are prefix-stable, so the successor
   * computes valid runs while its predecessor finishes. Folds stay strictly
   * ordered: a rung folds only after every earlier rung folded, and a rung
   * that stops discards its started successor (a gap can never enter the
   * cache). At most two rungs are in flight, bounding what a slider move
   * throws away.
   */
  const refineLoop = async (loopGeneration: number): Promise<void> => {
    computingGeneration = loopGeneration;
    const releaseCompute = () => {
      if (computingGeneration === loopGeneration) {
        computingGeneration = null;
      }
    };
    const key = sweepSelectionKey(axes, selection);
    const live: LadderRung[] = [];
    const abortSet = new Set<() => void>();
    abortCurrent = () => {
      for (const abort of abortSet) {
        abort();
      }
    };

    const publishAllLive = () => {
      if (isStale(loopGeneration) || live.length === 0) {
        return;
      }
      const first = live[0]!;
      const frameSets = live
        .map((rung) => rung.handle.metrics.get().frames)
        .filter((frames) => frames.length > 0);
      publish({
        inFlightFrames:
          frameSets.length > 1
            ? mergeMetricFramesAcrossCells(frameSets)
            : frameSets[0],
        inFlightRuns: live.reduce(
          (total, rung) =>
            total + (rung.handle.progress.get()?.completedRuns ?? 0),
          0,
        ),
        runTarget: live.at(-1)!.target,
        progress: first.handle.progress.get(),
        computing: true,
      });
    };
    // Loop-level, so both live rungs share one cadence; a trailing tick reads
    // current state, so one landing after a fold publishes cache + the
    // remaining rung — never double.
    const livePublish = createThrottle(
      publishAllLive,
      options.publishThrottleMs ?? 0,
    );

    /** The fold chain: what the cache will hold once ordered folds land. */
    let chainSnapshot = snapshotFor(key);
    let nextFrom = chainSnapshot.runsCompleted;

    const startNext = async (): Promise<boolean> => {
      const target = getNextRunTarget(nextFrom, runCount);
      if (target === null) {
        return false;
      }
      if (live.length === 0) {
        publish({ runTarget: target, computing: true });
      }
      const rung = await startRung(
        loopGeneration,
        nextFrom,
        target,
        abortSet,
        livePublish.call,
      );
      if (rung === null) {
        return false;
      }
      nextFrom = target;
      live.push(rung);
      return true;
    };

    const drainLive = () => {
      for (const rung of live.splice(0)) {
        rung.abort();
        rung.detach();
        rung.handle.dispose();
      }
    };

    const started = await startNext();
    if (!started) {
      releaseCompute();
      if (!isStale(loopGeneration) && !disposed && !failed) {
        publish({ runTarget: null, computing: false });
      }
      return;
    }

    while (live.length > 0) {
      const current = live[0]!;

      // Pipeline: once the current rung streams, start its successor.
      if (live.length === 1 && !failed) {
        const first = await Promise.race([
          current.streamed.then(() => "streamed" as const),
          current.done.then(() => "done" as const),
        ]);
        if (first === "streamed" && !isStale(loopGeneration) && !isFailed()) {
          await startNext();
        }
      }

      const outcome = await current.done;
      current.detach();
      const finishedFrames = current.handle.metrics.get().frames;
      current.handle.dispose();
      live.shift();

      if (outcome !== "complete") {
        // A stopped rung breaks the fold chain: its started successor's runs
        // can never fold without a gap, so they are discarded.
        drainLive();
        break;
      }

      // Fold in order, even when the user has moved on — completed runs are
      // never thrown away.
      chainSnapshot = {
        runsCompleted: current.target,
        metricFrames: mergeMetricFramesAcrossCells([
          chainSnapshot.metricFrames,
          finishedFrames,
        ]),
      };
      cache.set(key, chainSnapshot);
      // Reflect the fold (runsCompleted advanced) without waiting for the
      // successor's next tick; with no successor the exit publish covers it.
      livePublish.call();

      if (disposed || isStale(loopGeneration) || failed) {
        drainLive();
        break;
      }
      if (live.length === 0 && !(await startNext())) {
        break;
      }
    }

    livePublish.cancel();
    releaseCompute();
    if (!isStale(loopGeneration) && !disposed) {
      // The session idles — after finishing the ladder or after a failure;
      // either way leave the last good frames up rather than a spinner.
      publish({ runTarget: null, computing: false });
    }
  };

  const restart = () => {
    generation += 1;
    abortCurrent?.();
    abortCurrent = null;
    void refineLoop(generation);
  };

  restart();

  /**
   * Brings one point up to at least `minRuns` finished runs on the
   * background lane, reusing the navigator's cached runs. Seeds follow the
   * ladder-position rule, so a point sampled here and later visited by the
   * navigator resumes the identical run sequence.
   */
  const sampleCellRuns = async (
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

    let handle: MonteCarloExperiment;
    try {
      handle = await instantiateBatch({
        parameterValues: sweepCellValues(axes, position),
        seed: sweepBatchSeed(seed, snapshot.runsCompleted),
        runCount: target - snapshot.runsCompleted,
        background: true,
        signal: backgroundSignal,
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

    const unregister = registry.register(
      "refine",
      target - snapshot.runsCompleted,
      handle,
    );
    backgroundHandles.add(handle);
    const { event, frames } = await runExperimentToCompletion(handle);
    backgroundHandles.delete(handle);
    unregister();
    if (event.type !== "complete" || isDisposed()) {
      return null;
    }
    // The navigator may have refined this point further meanwhile; the
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

  /**
   * Samples many cells as ONE batch: every cell's values become per-run
   * draws (`runsPerCell` runs each) and the per-run metric values the CPU
   * workers report are grouped back into per-cell means. Valid only for
   * cells sharing one initial marking; `sampleCells` checks.
   */
  const sampleCellBatch = async (
    positions: readonly Readonly<Record<string, number>>[],
    runsPerCell: number,
    onPartial?: SampleCellsPartialListener,
  ): Promise<CellMeans | null> => {
    const { draws, runSeeds } = layoutCellBatch(
      axes,
      seed,
      positions,
      runsPerCell,
    );
    let handle: MonteCarloExperiment;
    try {
      handle = await instantiateBatch({
        parameterValues: sweepCellValues(axes, positions[0]!),
        draws,
        seed,
        runCount: runSeeds.length,
        background: true,
        requiresRunResults: true,
        foregroundActive: isForegroundComputing(),
        runSeeds,
        signal: backgroundSignal,
      });
    } catch {
      // A refused batch is a hole in the surface, not a failed sweep.
      return null;
    }
    if (isDisposed()) {
      handle.dispose();
      return null;
    }

    const means = (results: ExperimentCompletion["runResults"]) =>
      groupCellMeans(results, positions.length, runsPerCell);
    const unregister = registry.register("surface", runSeeds.length, handle);
    backgroundHandles.add(handle);
    const { event, runResults } = await runExperimentToCompletion(handle, {
      // CPU workers report per-run values as each shard completes, so a
      // sharded chunk paints its cells in slices instead of all at once.
      onRunResults:
        onPartial === undefined
          ? undefined
          : (results) => {
              if (isDisposed()) {
                return;
              }
              const partial = means(results);
              if (partial.some((cell) => cell !== null)) {
                onPartial(partial);
              }
            },
    });
    backgroundHandles.delete(handle);
    unregister();
    if (event.type !== "complete" || isDisposed()) {
      return null;
    }
    return means(runResults);
  };

  return {
    whenSelectionStreamed() {
      if (disposed || failed || streamedGeneration === generation) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        streamedWaiters.push(resolve);
      });
    },
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
    async sampleCells(positions, runsPerCell, onPartial) {
      if (disposed || failed || positions.length === 0) {
        return null;
      }
      const firstKey = initialMarkingKey(sweepCellValues(axes, positions[0]!));
      const sharedMarking =
        firstKey !== null &&
        positions.every(
          (position) =>
            initialMarkingKey(sweepCellValues(axes, position)) === firstKey,
        );
      if (sharedMarking) {
        return sampleCellBatch(positions, runsPerCell, onPartial);
      }
      const partial: (Readonly<Record<string, number>> | null)[] =
        positions.map(() => null);
      return Promise.all(
        positions.map(async (position, index) => {
          const snapshot = await sampleCellRuns(position, runsPerCell);
          if (snapshot === null) {
            return null;
          }
          // Read from the cell's merged frames, which also serve the
          // navigator's cache; the batched path averages per-run terminal
          // values, which differ only for runs that end at different times.
          const cellMeans = snapshotMeans(snapshot.metricFrames);
          partial[index] = cellMeans;
          onPartial?.([...partial]);
          return cellMeans;
        }),
      );
    },
    dispose() {
      disposed = true;
      generation += 1;
      markSelectionStreamed();
      for (const handle of backgroundHandles) {
        handle.cancel();
      }
      backgroundHandles.clear();
      registry.clear();
      abortCurrent?.();
      abortCurrent = null;
    },
  };
}
