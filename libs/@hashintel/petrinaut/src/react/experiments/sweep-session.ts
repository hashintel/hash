/**
 * Progressive computation of one parameter-sweep experiment.
 *
 * The session computes exactly what is selected and restarts the moment the
 * selection changes. A **point** selection runs the experiment at that
 * value. A **range** selection runs one stochastic experiment over the
 * ranges: every run draws its own value for each ranged parameter,
 * low-discrepancy across the selected intervals (`sweepRunFraction`), so the
 * metric stream is the live distribution over the region. Nothing computes
 * until something selects: the navigator's controls, a Surface pick, or an
 * optimizer navigating trial by trial through `navigateTo`.
 *
 * Either kind climbs `EXPERIMENT_RUN_LADDER` in batches, up to the
 * experiment's run count or the run cap a navigation asked for. Finished
 * batches fold into a cache keyed by the whole selection (a point is a
 * degenerate range), so revisiting an earlier selection restores its runs
 * and resumes from its ladder position. Every point that folded is a
 * visited cell the session publishes with its per-metric values; the
 * Surface draws those.
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
import {
  axisValueAt,
  fullSweepSelection,
  getNextRunTarget,
  mergeMetricFramesAcrossCells,
  normalizeSweepSelection,
  selectionMidpoint,
} from "./parameter-grid";
import { createThrottle } from "./shared/throttle";
import { sweepCellObjective } from "./sweep-cell-objective";
import {
  sweepBatchSeed,
  sweepRangeDraws,
  sweepSelectionKey,
} from "./sweep-session/selection-draws";

import type { ExperimentParameterAxis, SweepSelection } from "./parameter-grid";
import type { BatchStatus } from "./shared/batch-registry";
import type { SweepRunDraws } from "./sweep-session/selection-draws";
import type {
  MonteCarloExperiment,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloWorkerProgress,
} from "@hashintel/petrinaut-core";

export type { SweepSelection } from "./parameter-grid";
export {
  sweepBatchSeed,
  sweepSelectionKey,
} from "./sweep-session/selection-draws";
export type { SweepRunDraws } from "./sweep-session/selection-draws";

/**
 * One rung of the selection's ladder currently computing, for the host's
 * activity display. A sweep runs no other kind of batch.
 */
export type SweepBatchStatus = BatchStatus<{ kind: "selection" }>;

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

/** Finished batches of one selection, merged. */
export type SweepCellSnapshot = {
  runsCompleted: number;
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
};

/** A point the session has computed: its quantized position and what the finished runs measured. */
export type SweepVisitedCell = {
  position: Readonly<Record<string, number>>;
  runsCompleted: number;
  /** Each metric's value over the finished runs (`sweepCellObjective`). */
  means: Readonly<Record<string, number>>;
};

/** What the session streams to its owner on every meaningful change. */
export type SweepSessionUpdate = {
  selection: SweepSelection;
  /** The selection's cache key: one string per distinct selection. */
  selectionKey: string;
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
  /**
   * A batch of this selection failed; the session computes nothing more for
   * it until the selection moves.
   */
  failed: boolean;
  /**
   * Every point computed so far, in the order first visited. A new array
   * only when a batch folds, so a consumer can key on its identity.
   */
  visited: readonly SweepVisitedCell[];
  /** The ladder rungs computing right now, oldest first; empty when idle. */
  batches: readonly SweepBatchStatus[];
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
  signal: AbortSignal;
}) => Promise<MonteCarloExperiment>;

export type CreateSweepSessionOptions = {
  axes: readonly ExperimentParameterAxis[];
  /** Maximum runs per selection — the top of the ladder. */
  runCount: number;
  seed: number;
  /** Starting selection; the whole space when omitted. */
  initialSelection?: SweepSelection;
  /**
   * Whether the starting selection computes at once. Off, the session
   * publishes once as idle and waits for a selection. Defaults to on.
   */
  startComputing?: boolean;
  instantiateBatch: InstantiateSweepBatch;
  onUpdate: (update: SweepSessionUpdate) => void;
  /**
   * Coalesces in-flight publishes: after a leading publish, further store
   * ticks inside this window fold into one trailing publish. 0 (the
   * default) publishes on every tick. Terminal publishes (batch end,
   * saturation, errors) are never delayed.
   */
  publishThrottleMs?: number;
  /** A failed batch stops its selection's compute; the owner decides how to surface it. */
  onError: (message: string) => void;
};

export type SweepNavigateOptions = {
  /**
   * The ladder stops at this many runs for the selection instead of the
   * experiment's run count. A later `setSelection` lifts the cap.
   */
  runCap?: number;
};

export type SweepSession = {
  /** Moves the selection; compute follows it up to the experiment's run count. */
  setSelection: (selection: SweepSelection) => void;
  /**
   * Moves the selection and resolves once it has the runs asked for: the
   * cap, or the run count without one. Resolves with the finished runs'
   * values, or null when another navigation superseded this one or the
   * session was disposed; rejects with the batch's reason when a batch of
   * the selection fails.
   */
  navigateTo: (
    selection: SweepSelection,
    options?: SweepNavigateOptions,
  ) => Promise<SweepVisitedCell | null>;
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

/** A point selection's position per axis; null for a selection with a range. */
const selectionPoint = (
  axes: readonly ExperimentParameterAxis[],
  selection: SweepSelection,
): Readonly<Record<string, number>> | null => {
  const position: Record<string, number> = {};
  for (const axis of axes) {
    const range = selection[axis.identifier]!;
    if (range.from !== range.to) {
      return null;
    }
    position[axis.identifier] = range.from;
  }
  return position;
};

type NavigationWaiter = {
  generation: number;
  /** Finished runs the waiter needs; the ladder's top when it cannot reach them. */
  minRuns: number;
  resolve: (cell: SweepVisitedCell | null) => void;
  reject: (error: Error) => void;
};

/** A selection nothing has folded for yet; one instance, so live merges over it hit their cache. */
const EMPTY_SNAPSHOT: SweepCellSnapshot = {
  runsCompleted: 0,
  metricFrames: [],
};

/** What a selection's finished runs measured, as the visited cell at `position`. */
const cellFor = (
  position: Readonly<Record<string, number>>,
  snapshot: SweepCellSnapshot,
): SweepVisitedCell => ({
  position,
  runsCompleted: snapshot.runsCompleted,
  means: snapshotMeans(snapshot.metricFrames),
});

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
  /** Where the ladder stops for the current selection; null is the run count. */
  let runCap: number | null = null;
  let disposed = false;
  /**
   * The generation whose batch failed, with the batch's reason. A later
   * selection is a new generation, so it computes afresh; a stale rung's
   * late error cannot poison it either.
   */
  let failure: { generation: number; message: string } | null = null;
  /** Increments per selection change; a stale loop sees it and stops. */
  let generation = 0;
  let abortCurrent: (() => void) | null = null;
  /** Generation whose refine loop runs; null once it went idle or failed. */
  let activeLoop: number | null = null;

  /** Points computed so far, first visit first; replaced, never mutated. */
  let visited: readonly SweepVisitedCell[] = [];
  const visitedIndex = new Map<string, number>();
  const recordVisit = (key: string, cell: SweepVisitedCell) => {
    const index = visitedIndex.get(key);
    const next = [...visited];
    if (index === undefined) {
      visitedIndex.set(key, next.length);
      next.push(cell);
    } else {
      next[index] = cell;
    }
    visited = next;
  };

  let waiters: NavigationWaiter[] = [];
  /** Removes and returns the waiters of `waiterGeneration` that `matches`. */
  const takeWaiters = (
    waiterGeneration: number,
    matches: (waiter: NavigationWaiter) => boolean,
  ): NavigationWaiter[] => {
    const taken: NavigationWaiter[] = [];
    waiters = waiters.filter((waiter) => {
      if (waiter.generation === waiterGeneration && matches(waiter)) {
        taken.push(waiter);
        return false;
      }
      return true;
    });
    return taken;
  };
  /**
   * Resolves the waiters of `loopGeneration` that `cell` satisfies — all of
   * them when the ladder is done — with the cell, or null before any run
   * finished.
   */
  const settleWaiters = (
    loopGeneration: number,
    cell: SweepVisitedCell,
    ladderDone: boolean,
  ) => {
    const settled = takeWaiters(
      loopGeneration,
      (waiter) => ladderDone || cell.runsCompleted >= waiter.minRuns,
    );
    for (const waiter of settled) {
      waiter.resolve(cell.runsCompleted === 0 ? null : cell);
    }
  };
  /** Rejects every waiter of a generation whose batch failed with the reason. */
  const rejectWaiters = (loopGeneration: number, error: Error) => {
    for (const waiter of takeWaiters(loopGeneration, () => true)) {
      waiter.reject(error);
    }
  };
  /** Resolves every waiter of a generation that will never compute again with null. */
  const abandonWaiters = (staleGeneration: number) => {
    for (const waiter of takeWaiters(staleGeneration, () => true)) {
      waiter.resolve(null);
    }
  };

  const snapshotFor = (key: string): SweepCellSnapshot =>
    cache.get(key) ?? EMPTY_SNAPSHOT;

  /**
   * The last live merge, keyed by every input's identity: progress ticks
   * re-publish the same frame arrays, and re-merging every cached frame
   * against every in-flight frame per tick was the hottest main-thread cost.
   * One three-way merge over the cache and each live rung's frames.
   */
  let mergeCache: {
    cached: readonly MonteCarloUserDefinedMetricFrame[];
    frameSets: readonly (readonly MonteCarloUserDefinedMetricFrame[])[];
    result: readonly MonteCarloUserDefinedMetricFrame[];
  } | null = null;
  const mergeLive = (
    cached: readonly MonteCarloUserDefinedMetricFrame[],
    frameSets: readonly (readonly MonteCarloUserDefinedMetricFrame[])[],
  ): readonly MonteCarloUserDefinedMetricFrame[] => {
    if (
      mergeCache === null ||
      mergeCache.cached !== cached ||
      mergeCache.frameSets.length !== frameSets.length ||
      mergeCache.frameSets.some((frames, i) => frames !== frameSets[i])
    ) {
      mergeCache = {
        cached,
        frameSets,
        result: mergeMetricFramesAcrossCells([cached, ...frameSets]),
      };
    }
    return mergeCache.result;
  };

  /**
   * One in-flight ladder batch. Rungs cover disjoint run ranges with
   * prefix-stable draws and seeds, so a successor can compute while its
   * predecessor is still running; only the FOLD into the cache is ordered.
   */
  type LadderRung = {
    /** Unique within the session, in start order. */
    id: number;
    from: number;
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
  let rungSequence = 0;
  /** The current refine loop's in-flight rungs, oldest first; empty between loops. */
  let liveRungs: readonly LadderRung[] = [];

  const publish = (update: {
    inFlightFrameSets?: readonly (readonly MonteCarloUserDefinedMetricFrame[])[];
    inFlightRuns?: number;
    runTarget: number | null;
    progress?: MonteCarloWorkerProgress | null;
    computing: boolean;
  }) => {
    if (disposed) {
      return;
    }
    const selectionKey = sweepSelectionKey(axes, selection);
    const snapshot = snapshotFor(selectionKey);
    const frameSets = update.inFlightFrameSets ?? [];
    onUpdate({
      selection,
      selectionKey,
      metricFrames:
        frameSets.length > 0
          ? mergeLive(snapshot.metricFrames, frameSets)
          : snapshot.metricFrames,
      runsSampled: snapshot.runsCompleted + (update.inFlightRuns ?? 0),
      runsCompleted: snapshot.runsCompleted,
      runTarget: update.runTarget,
      progress: update.progress ?? null,
      computing: update.computing,
      failed: failure?.generation === generation,
      visited,
      // A session that stopped computing has no live rung, whatever a loop
      // still has to drain.
      batches: update.computing
        ? liveRungs.map((rung) => ({
            kind: "selection" as const,
            id: rung.id,
            runCount: rung.target - rung.from,
            completedRuns: rung.handle.progress.get()?.completedRuns ?? 0,
          }))
        : [],
    });
  };

  // Reads go through a function so the narrowing-based lint cannot claim the
  // state is constant: it changes inside closures the checker treats as opaque.
  const isFailed = (loopGeneration: number): boolean =>
    failure?.generation === loopGeneration;

  /** A batch of `loopGeneration` failed: the loop stops and the owner hears why. */
  const fail = (loopGeneration: number, message: string) => {
    failure = { generation: loopGeneration, message };
    onError(message);
  };

  /** Whether `loopGeneration` still owns the session's compute slot. */
  const isStale = (loopGeneration: number): boolean =>
    disposed || loopGeneration !== generation;

  /** The top of the ladder for the current selection. */
  const ladderTop = (): number =>
    runCap === null ? runCount : Math.min(runCount, runCap);

  /**
   * Starts one ladder batch for runs `[from, target)` of the current
   * selection. Returns null when the batch was superseded (abort, stale
   * generation) or failed — failure marks the generation failed and
   * publishes.
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
      fail(
        loopGeneration,
        error instanceof Error ? error.message : "Failed to draw a batch",
      );
      publish({ runTarget: target, computing: false });
      return null;
    }

    // The value at a point axis, the range midpoint otherwise — taken in
    // value space so a coarse axis does not round it onto an endpoint. An
    // integer axis's midpoint rounds, since the scenario compiles an
    // integer parameter from it; a real one drops the float artifacts of
    // the average.
    const parameterValues: Record<string, number> = {};
    for (const axis of axes) {
      const range = selection[axis.identifier]!;
      if (range.from === range.to) {
        parameterValues[axis.identifier] = axisValueAt(axis, range.from);
        continue;
      }
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
      if (isStale(loopGeneration) || isAbortError(error)) {
        return null;
      }
      fail(
        loopGeneration,
        error instanceof Error ? error.message : "Failed to start a batch",
      );
      publish({ runTarget: target, computing: false });
      return null;
    }
    if (isStale(loopGeneration)) {
      abortSet.delete(abortEntry);
      handle.dispose();
      return null;
    }

    let resolveDone: (outcome: "complete" | "stopped") => void = () => {};
    const done = new Promise<"complete" | "stopped">((resolve) => {
      resolveDone = resolve;
    });
    let resolveStreamed: () => void = () => {};
    const streamed = new Promise<void>((resolve) => {
      resolveStreamed = resolve;
    });
    void done.then(() => resolveStreamed());

    const unsubscribeMetrics = handle.metrics.subscribe(({ frames }) => {
      if (frames.length > 0) {
        resolveStreamed();
      }
      onLiveTick();
    });
    const unsubscribeProgress = handle.progress.subscribe(() => onLiveTick());
    const unsubscribeEvents = handle.events.subscribe((event) => {
      if (event.type === "complete") {
        resolveDone("complete");
      } else if (event.type === "cancelled") {
        resolveDone("stopped");
      } else {
        fail(loopGeneration, event.message);
        resolveDone("stopped");
      }
    });
    const detach = () => {
      unsubscribeMetrics();
      unsubscribeProgress();
      unsubscribeEvents();
      abortSet.delete(abortEntry);
    };
    // Aborting a started handle's signal would tear its transports down
    // before any terminal event; cancel through the handle instead, and
    // resolve `done` here because a torn-down transport never reports back.
    abortRung = () => {
      handle.cancel();
      resolveDone("stopped");
    };

    handle.start();
    rungSequence += 1;
    return {
      id: rungSequence,
      from,
      target,
      handle,
      done,
      streamed,
      abort: abortRung,
      detach,
    };
  };

  /**
   * Climbs the ladder for the current selection, pipelined: the next rung
   * starts as soon as the current one streams its first frames, and finished
   * rungs fold into the cache in order (a stopped rung drains its successor,
   * so no gap ever enters the cache). At most two rungs are in flight,
   * bounding what a selection change throws away.
   */
  const refineLoop = async (loopGeneration: number): Promise<void> => {
    activeLoop = loopGeneration;
    const releaseCompute = () => {
      if (activeLoop === loopGeneration) {
        activeLoop = null;
      }
    };
    const key = sweepSelectionKey(axes, selection);
    const point = selectionPoint(axes, selection);
    /** Where the selection's cell sits: the point, or the midpoint of the ranges. */
    const position =
      point ??
      Object.fromEntries(
        axes.map((axis) => [
          axis.identifier,
          Math.round(selectionMidpoint(selection, axis)),
        ]),
      );
    const live: LadderRung[] = [];
    liveRungs = live;
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
      publish({
        inFlightFrameSets: live
          .map((rung) => rung.handle.metrics.get().frames)
          .filter((frames) => frames.length > 0),
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
      const target = getNextRunTarget(nextFrom, ladderTop());
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
      // The rung joins the batches list at once rather than on its first tick.
      livePublish.call();
      return true;
    };

    const drainLive = () => {
      for (const rung of live.splice(0)) {
        rung.abort();
        rung.detach();
        rung.handle.dispose();
      }
    };
    /** The loop is over: a later loop's rungs are the live ones now. */
    const releaseLive = () => {
      if (liveRungs === live) {
        liveRungs = [];
      }
    };
    /**
     * The ladder stopped for this loop's waiters: rejected with the failure
     * that stopped it, else resolved with what the selection has.
     */
    const concludeWaiters = () => {
      if (failure?.generation === loopGeneration) {
        rejectWaiters(loopGeneration, new Error(failure.message));
      } else {
        settleWaiters(loopGeneration, cellFor(position, chainSnapshot), true);
      }
    };

    const started = await startNext();
    if (!started) {
      releaseCompute();
      releaseLive();
      if (isStale(loopGeneration)) {
        return;
      }
      if (!isFailed(loopGeneration)) {
        publish({ runTarget: null, computing: false });
      }
      concludeWaiters();
      return;
    }

    while (live.length > 0) {
      const current = live[0]!;

      // Pipeline: once the current rung streams, start its successor.
      if (live.length === 1 && !isFailed(loopGeneration)) {
        const first = await Promise.race([
          current.streamed.then(() => "streamed" as const),
          current.done.then(() => "done" as const),
        ]);
        if (
          first === "streamed" &&
          !isStale(loopGeneration) &&
          !isFailed(loopGeneration)
        ) {
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
      const cell = cellFor(position, chainSnapshot);
      if (point !== null) {
        recordVisit(key, cell);
      }
      // Reflect the fold (runsCompleted advanced) without waiting for the
      // successor's next tick; with no successor the exit publish covers it.
      livePublish.call();
      if (!isStale(loopGeneration)) {
        settleWaiters(loopGeneration, cell, false);
      }

      if (isStale(loopGeneration) || isFailed(loopGeneration)) {
        drainLive();
        break;
      }
      if (live.length === 0 && !(await startNext())) {
        break;
      }
    }

    livePublish.cancel();
    releaseCompute();
    releaseLive();
    if (!isStale(loopGeneration)) {
      // The session idles — after finishing the ladder or after a failure;
      // either way leave the last good frames up rather than a spinner.
      publish({ runTarget: null, computing: false });
      concludeWaiters();
    }
  };

  const restart = () => {
    const stale = generation;
    generation += 1;
    abortCurrent?.();
    abortCurrent = null;
    abandonWaiters(stale);
    void refineLoop(generation);
  };

  /** Adopts `next` as the selection; true when it differs from the current one. */
  const adopt = (next: SweepSelection): boolean => {
    const normalized = normalizeSweepSelection(axes, next);
    const changed = axes.some((axis) => {
      const current = selection[axis.identifier]!;
      const incoming = normalized[axis.identifier]!;
      return current.from !== incoming.from || current.to !== incoming.to;
    });
    selection = normalized;
    return changed;
  };

  /**
   * Adopts `next` as the selection with `cap` as its ladder's stop (null is
   * the run count), and restarts compute when either changed or nothing runs.
   */
  const move = (next: SweepSelection, cap: number | null) => {
    const changed = adopt(next);
    const capChanged = cap !== runCap;
    runCap = cap;
    if (changed || capChanged || activeLoop === null) {
      restart();
    }
  };

  if (options.startComputing ?? true) {
    restart();
  } else {
    publish({ runTarget: null, computing: false });
  }

  return {
    setSelection(next) {
      if (disposed) {
        return;
      }
      move(next, null);
    },
    navigateTo(next, navigateOptions = {}) {
      if (disposed) {
        return Promise.resolve(null);
      }
      move(next, navigateOptions.runCap ?? null);
      return new Promise<SweepVisitedCell | null>((resolve, reject) => {
        waiters.push({ generation, minRuns: ladderTop(), resolve, reject });
      });
    },
    dispose() {
      // The owner's last frame reads idle: nothing computes once disposed.
      publish({ runTarget: null, computing: false });
      disposed = true;
      const stale = generation;
      generation += 1;
      abortCurrent?.();
      abortCurrent = null;
      abandonWaiters(stale);
      for (const waiter of waiters) {
        waiter.resolve(null);
      }
      waiters = [];
    },
  };
}
