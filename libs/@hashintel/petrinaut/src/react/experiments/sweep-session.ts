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
 * A range batch carries per-run parameter values (`runs`); the CPU pool
 * applies them per run and the WebGPU backend uploads them to a per-run
 * parameter buffer, so points and ranges are equally backend-eligible.
 *
 * Determinism: a batch covering runs `[from, target)` derives its base seed
 * as `deriveRunSeed(seed, from)` (the first batch keeps `seed` verbatim), and
 * a run's parameter draw depends only on its global index and the selected
 * range. The same rung therefore uses the same seeds in every selection —
 * common random numbers — and re-running a cancelled rung repeats it exactly.
 */
import { deriveRunSeed } from "@hashintel/petrinaut-core";

import { createCooperativeYielder } from "./cooperative-yield";
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
   * Per-run parameter draws for the batch's runs, present only when some
   * axis has a non-degenerate range. The CPU pool applies them per run; the
   * WebGPU backend reads them from a per-run parameter buffer.
   */
  draws?: SweepRunDraws;
  /** Base seed for this batch (already derived from the batch's run range). */
  seed: number;
  /** Runs this batch adds on top of the selection's finished batches. */
  runCount: number;
  /**
   * A surface-sampling batch rather than the navigator's. Hosts give these a
   * single worker so the navigator's batch keeps the cores.
   */
  background?: boolean;
  /**
   * The batch's consumer reads per-run metric values (`runResults`), which
   * only the CPU workers report — hosts route such a batch to the CPU lane
   * even when the experiment's chosen backend is the GPU.
   */
  requiresRunResults?: boolean;
  /**
   * Whether the session's own refine ladder was computing when this
   * background batch was requested. Hosts use it to size the batch: while
   * the foreground is busy on the CPU pool a background batch stays on one
   * worker, and once the ladder idles (or computes elsewhere, e.g. the GPU)
   * the same batch may shard across the now-free pool.
   */
  foregroundActive?: boolean;
  /**
   * Explicit per-run seeds (one per run, aligned with `draws`). Batched
   * surface cells pin these so a cell's runs use the same seeds regardless
   * of which chunk (and chunk slot) sampled it — and the same seeds the
   * per-cell ladder's first batch would use.
   */
  runSeeds?: readonly number[];
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
  /**
   * Samples many cells as one batch and returns each cell's per-metric mean,
   * index-aligned with `positions` (null for a cell with no finished runs).
   * Requires a marking the swept parameters do not shape — the host decides;
   * see `sampleCellsBatch`. Resolves null when the session is disposed or
   * the batch is refused.
   */
  sampleCells: (
    positions: readonly Readonly<Record<string, number>>[],
    runsPerCell: number,
  ) => Promise<readonly (Readonly<Record<string, number>> | null)[] | null>;
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

/** An error the batch machinery recognizes as a deliberate abort. */
function abortError(): Error {
  const error = new Error("The batch was aborted.");
  error.name = "AbortError";
  return error;
}

/**
 * One batch's per-run draws: one column per ranged axis, one typed array of
 * run-major values. A record per run was the second-largest main-thread cost
 * of instantiating a million-run batch; the array form is written once and
 * translated without materializing anything per run.
 */
export type SweepRunDraws = {
  /** The drawn identifiers (ranged axes), in axis order. */
  identifiers: readonly string[];
  /** `values[run * identifiers.length + i]` is `identifiers[i]`'s draw. */
  values: Float64Array;
};

/**
 * Per-run parameter draws for a range selection's batch covering global run
 * indices `[from, target)`, or undefined when every axis is a point. Each
 * ranged axis draws continuously inside its selected value interval — the
 * quantized positions bound the interval, they do not grid it — via the
 * axis's own seed-shifted low-discrepancy sequence, prefix-stable in the
 * run index.
 */
export async function sweepRangeDraws(
  seed: number,
  axes: readonly ExperimentParameterAxis[],
  selection: SweepSelection,
  from: number,
  target: number,
  signal?: { readonly aborted: boolean },
): Promise<SweepRunDraws | undefined> {
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

  const runCount = target - from;
  const width = ranged.length;
  const values = new Float64Array(runCount * width);
  const yielder = createCooperativeYielder();
  for (let localIndex = 0; localIndex < runCount; localIndex++) {
    if (localIndex % 4096 === 0) {
      // Yielding lets a selection change land mid-build; a superseded batch
      // must stop here rather than finish millions of draws nobody wants.
      // Checked independently of the yield, which a hidden document skips.
      if (signal?.aborted) {
        throw abortError();
      }
      if (yielder.shouldYield()) {
        await yielder.yieldNow();
      }
    }
    const globalIndex = from + localIndex;
    for (let column = 0; column < width; column++) {
      const { axis, axisIndex, low, high } = ranged[column]!;
      const raw =
        low + sweepRunFraction(seed, globalIndex, axisIndex) * (high - low);
      // `toPrecision(12)` matches what the record form stringified, so a
      // draw is the same number either way and cached rungs stay valid.
      values[localIndex * width + column] = axis.integer
        ? Math.round(raw)
        : Number(raw.toPrecision(12));
    }
  }
  return { identifiers: ranged.map((entry) => entry.axis.identifier), values };
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
  /**
   * Generation whose refine loop is currently between its first batch and
   * going idle; null when the ladder finished or failed. Background batches
   * read this to know whether the foreground owns the compute right now.
   */
  let computingGeneration: number | null = null;
  const isForegroundComputing = (): boolean =>
    computingGeneration === generation;

  const snapshotFor = (key: string): SweepCellSnapshot =>
    cache.get(key) ?? { runsCompleted: 0, metricFrames: [] };

  /**
   * The last live merge, keyed by both inputs' identities. Progress ticks
   * re-publish the same frame arrays, and the full re-merge — every cached
   * frame against every in-flight frame — was the sweep lane's hottest
   * main-thread cost.
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
    if (snapshot.runsCompleted + (update.inFlightRuns ?? 0) > 0) {
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
    } catch {
      // Only an abort escapes the draw build, and an abort means a restart
      // or a dispose already superseded this generation.
      abortSet.delete(abortEntry);
      return null;
    }

    let handle: MonteCarloExperiment;
    try {
      handle = await instantiateBatch({
        parameterValues: sweepSelectionMidValues(axes, selection),
        ...(draws === undefined ? {} : { draws }),
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
      if (event.type === "error" && !disposed) {
        failed = true;
        onError(event.message);
      }
      resolveDone("stopped");
    });

    abortRung = () => {
      abortController.abort();
      handle.cancel();
      resolveDone("stopped");
    };

    handle.start();

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
    // Leading-edge publish with trailing coalescing: with many shards each
    // message wave fires metrics and progress ticks back to back, and every
    // one re-rendered the whole drawer. Loop-level, so both live rungs share
    // one cadence; a trailing tick reads current state, so a tick landing
    // after a fold publishes cache + the remaining rung — never double.
    const throttleMs = options.publishThrottleMs ?? 0;
    // In an object so reads go through a property the narrowing-based lint
    // treats as opaque: the fields flip inside timer callbacks.
    const throttle: {
      timer: ReturnType<typeof setTimeout> | null;
      pending: boolean;
    } = { timer: null, pending: false };
    const publishLiveThrottled = () => {
      if (throttleMs === 0) {
        publishAllLive();
        return;
      }
      if (throttle.timer !== null) {
        throttle.pending = true;
        return;
      }
      publishAllLive();
      throttle.timer = setTimeout(() => {
        throttle.timer = null;
        if (throttle.pending) {
          throttle.pending = false;
          publishLiveThrottled();
        }
      }, throttleMs);
    };

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
        publishLiveThrottled,
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

      // Fold in order, even when the user has moved on — completed rays are
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
      publishLiveThrottled();

      if (disposed || isStale(loopGeneration) || failed) {
        drainLive();
        break;
      }
      if (live.length === 0 && !(await startNext())) {
        break;
      }
    }

    if (throttle.timer !== null) {
      clearTimeout(throttle.timer);
      throttle.timer = null;
    }
    throttle.pending = false;
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
   * Bounds background sampling to a few small batches in flight. Strictly
   * one at a time made the surface's four sampling lanes an illusion — every
   * cell serialized here regardless — and most of a cell's wall time is
   * batch setup rather than compute, so a small overlap pipelines it without
   * starving the navigator's own batch.
   */
  const BACKGROUND_BATCHES_IN_FLIGHT = 4;
  let backgroundActive = 0;
  const backgroundWaiters: (() => void)[] = [];
  const acquireBackgroundSlot = async (): Promise<void> => {
    if (backgroundActive < BACKGROUND_BATCHES_IN_FLIGHT) {
      backgroundActive += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      backgroundWaiters.push(resolve);
    });
    backgroundActive += 1;
  };
  const releaseBackgroundSlot = (): void => {
    backgroundActive -= 1;
    backgroundWaiters.shift()?.();
  };

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

  /**
   * Samples many cells as ONE batch: every cell's values become per-run
   * parameter draws (`runsPerCell` runs each), and the per-run metric values
   * the CPU workers report are grouped back into per-cell means. One batch
   * instantiation where the per-cell walk paid one per cell — but a single
   * initial marking: callers must only batch cells whose marking the swept
   * parameters do not shape (the host checks; a marking-shaping scenario
   * keeps the per-cell path).
   */
  const sampleCellsBatch = async (
    positions: readonly Readonly<Record<string, number>>[],
    runsPerCell: number,
  ): Promise<readonly (Readonly<Record<string, number>> | null)[] | null> => {
    if (disposed || failed || positions.length === 0) {
      return null;
    }
    const identifiers = axes.map((axis) => axis.identifier);
    const width = identifiers.length;
    const runCountTotal = positions.length * runsPerCell;
    const values = new Float64Array(runCountTotal * width);
    // Every cell pins the SAME seed sequence — the one the per-cell ladder's
    // first batch derives implicitly — so a cell's value is independent of
    // which chunk sampled it and matches the navigator's own runs.
    const cellSeeds = Array.from({ length: runsPerCell }, (_, run) =>
      deriveRunSeed(seed, run),
    );
    const runSeeds: number[] = [];
    for (const [cellIndex, position] of positions.entries()) {
      const cellValues = sweepCellValues(axes, position);
      for (let run = 0; run < runsPerCell; run++) {
        const base = (cellIndex * runsPerCell + run) * width;
        for (let column = 0; column < width; column++) {
          values[base + column] = cellValues[identifiers[column]!]!;
        }
        runSeeds.push(cellSeeds[run]!);
      }
    }

    const abortController = new AbortController();
    let handle: MonteCarloExperiment;
    try {
      handle = await instantiateBatch({
        parameterValues: sweepCellValues(axes, positions[0]!),
        draws: { identifiers, values },
        seed,
        runCount: runCountTotal,
        background: true,
        requiresRunResults: true,
        foregroundActive: isForegroundComputing(),
        runSeeds,
        signal: abortController.signal,
      });
    } catch {
      // A refused batch is a hole in the surface, not a failed sweep.
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
    const runResults = handle.runResults.get();
    handle.dispose();
    if (!completed || isDisposed()) {
      return null;
    }

    // Group per-run values back into per-cell means, per metric,
    // index-aligned with the requested positions.
    const accumulators = positions.map(
      (): Record<string, { sum: number; n: number }> => ({}),
    );
    for (const [runIndex, metricValues] of runResults) {
      const cell = accumulators[Math.floor(runIndex / runsPerCell)];
      if (!cell) {
        continue;
      }
      for (const [metricId, value] of Object.entries(metricValues)) {
        const entry = (cell[metricId] ??= { sum: 0, n: 0 });
        entry.sum += value;
        entry.n += 1;
      }
    }
    return accumulators.map((cell) => {
      const entries = Object.entries(cell);
      if (entries.length === 0) {
        return null;
      }
      return Object.fromEntries(
        entries.map(([metricId, { sum, n }]) => [metricId, sum / n]),
      );
    });
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
    async sampleCell(position, minRuns) {
      await acquireBackgroundSlot();
      try {
        return await runBackgroundBatch({ ...position }, minRuns);
      } finally {
        releaseBackgroundSlot();
      }
    },
    async sampleCells(positions, runsPerCell) {
      await acquireBackgroundSlot();
      try {
        return await sampleCellsBatch(positions, runsPerCell);
      } finally {
        releaseBackgroundSlot();
      }
    },
    dispose() {
      disposed = true;
      generation += 1;
      markSelectionStreamed();
      abortCurrent?.();
      abortCurrent = null;
    },
  };
}
