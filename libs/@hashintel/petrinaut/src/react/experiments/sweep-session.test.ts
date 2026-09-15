import { describe, expect, it, vi } from "vitest";

import { createSweepSession, sweepBatchSeed } from "./sweep-session";
import { sweepCellKey, sweepCellValues } from "./sweep-session/selection-draws";

import type { ExperimentParameterAxis } from "./parameter-grid";
import type {
  CreateSweepSessionOptions,
  SweepRunDraws,
  SweepSelection,
  SweepSessionUpdate,
} from "./sweep-session";
import type {
  MonteCarloExperiment,
  MonteCarloExperimentEvent,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloWorkerProgress,
} from "@hashintel/petrinaut-core";

/** Positions 0..2 map to values 0, 1, 2. */
const X_AXIS: ExperimentParameterAxis = {
  identifier: "x",
  min: 0,
  max: 2,
  stepCount: 2,
  integer: false,
};

/** Positions 0..1 map to values 10, 20. */
const Y_AXIS: ExperimentParameterAxis = {
  identifier: "y",
  min: 10,
  max: 20,
  stepCount: 1,
  integer: false,
};

const AXES = [X_AXIS, Y_AXIS];

const point = (x: number, y: number): SweepSelection => ({
  x: { from: x, to: x },
  y: { from: y, to: y },
});

function frame(
  runSampleCount: number,
  bins: readonly (readonly [number, number])[],
): MonteCarloUserDefinedMetricFrame {
  return {
    metricId: "m",
    label: "M",
    outputType: "distribution",
    frameNumber: 0,
    time: 0,
    bins,
    value: null,
    frameValue: null,
    timeValue: null,
    runSampleCount,
    timeSampleCount: runSampleCount,
  };
}

/** A hand-driven experiment handle: the test decides when batches finish. */
function makeFakeBatch(request: {
  parameterValues: Readonly<Record<string, number>>;
  draws?: SweepRunDraws;
  seed: number;
  runCount: number;
}) {
  let metricListeners: ((value: {
    frames: readonly MonteCarloUserDefinedMetricFrame[];
    latestByMetricId: Readonly<
      Record<string, MonteCarloUserDefinedMetricFrame>
    >;
  }) => void)[] = [];
  let eventListeners: ((event: MonteCarloExperimentEvent) => void)[] = [];
  let progressListeners: ((value: MonteCarloWorkerProgress | null) => void)[] =
    [];
  let frames: readonly MonteCarloUserDefinedMetricFrame[] = [];
  let progress: MonteCarloWorkerProgress | null = null;
  let cancelled = false;
  let started = false;
  let runResults = new Map<number, Readonly<Record<string, number>>>();
  let runResultsListeners: (() => void)[] = [];

  const handle: MonteCarloExperiment = {
    status: { get: () => "Running", subscribe: () => () => {} },
    progress: {
      get: () => progress,
      subscribe: (listener) => {
        progressListeners.push(listener);
        return () => {
          progressListeners = progressListeners.filter(
            (entry) => entry !== listener,
          );
        };
      },
    },
    metrics: {
      get: () => ({ frames, latestByMetricId: {} }),
      subscribe: (listener) => {
        metricListeners.push(listener);
        return () => {
          metricListeners = metricListeners.filter(
            (entry) => entry !== listener,
          );
        };
      },
    },
    runResults: {
      get: () => runResults,
      subscribe: (listener) => {
        const notify = () => listener(runResults);
        runResultsListeners.push(notify);
        return () => {
          runResultsListeners = runResultsListeners.filter(
            (entry) => entry !== notify,
          );
        };
      },
    },
    events: {
      subscribe: (listener) => {
        eventListeners.push(listener);
        return () => {
          eventListeners = eventListeners.filter((entry) => entry !== listener);
        };
      },
    },
    start: () => {
      started = true;
    },
    cancel: () => {
      cancelled = true;
    },
    dispose: () => {},
  };

  return {
    request,
    handle,
    setRunResults(next: ReadonlyMap<number, Readonly<Record<string, number>>>) {
      runResults = new Map(next);
      for (const notify of runResultsListeners) {
        notify();
      }
    },
    get cancelled() {
      return cancelled;
    },
    get started() {
      return started;
    },
    stream(nextFrames: readonly MonteCarloUserDefinedMetricFrame[]) {
      if (!started) {
        throw new Error("batch streamed before start()");
      }
      frames = nextFrames;
      progress = {
        activeRuns: 0,
        advancedRuns: request.runCount,
        allFinished: false,
        completedRuns: request.runCount,
        erroredRuns: 0,
        frameNumber: 0,
        runCount: request.runCount,
        time: 0,
      };
      for (const listener of metricListeners) {
        listener({ frames, latestByMetricId: {} });
      }
    },
    /** A progress-only tick: runs advanced, no new frames. */
    tick(completedRuns: number) {
      if (!started) {
        throw new Error("batch ticked before start()");
      }
      progress = {
        activeRuns: request.runCount - completedRuns,
        advancedRuns: request.runCount,
        allFinished: false,
        completedRuns,
        erroredRuns: 0,
        frameNumber: 1,
        runCount: request.runCount,
        time: 1,
      };
      for (const listener of progressListeners) {
        listener(progress);
      }
    },
    complete() {
      if (!started) {
        throw new Error("batch completed before start()");
      }
      for (const listener of eventListeners) {
        listener({
          type: "complete",
          progress: {
            activeRuns: 0,
            advancedRuns: request.runCount,
            allFinished: true,
            completedRuns: request.runCount,
            erroredRuns: 0,
            frameNumber: 0,
            runCount: request.runCount,
            time: 0,
          },
        });
      }
    },
    error(message: string) {
      for (const listener of eventListeners) {
        listener({ type: "error", message, itemId: null });
      }
    },
  };
}

function makeHarness(
  runCount: number,
  initialSelection?: SweepSelection,
  options: Partial<
    Pick<CreateSweepSessionOptions, "startComputing" | "axes">
  > = {},
) {
  const batches: ReturnType<typeof makeFakeBatch>[] = [];
  const updates: SweepSessionUpdate[] = [];
  const onError = vi.fn();

  const session = createSweepSession({
    axes: AXES,
    runCount,
    seed: 42,
    ...(initialSelection ? { initialSelection } : {}),
    ...options,
    instantiateBatch: (request) => {
      const batch = makeFakeBatch(request);
      batches.push(batch);
      return Promise.resolve(batch.handle);
    },
    onUpdate: (update) => updates.push(update),
    onError,
  });

  const settle = async () => {
    // Instantiation resolves through microtasks; the flush count covers the
    // longest chain (the pipelined loop's startNext -> startRung -> draws ->
    // instantiate) with headroom, so adding an await does not break every
    // test again.
    for (let flush = 0; flush < 12; flush++) {
      await Promise.resolve();
    }
  };

  return {
    session,
    batches,
    updates,
    /** The batches the last update listed as computing. */
    liveBatches: () => updates.at(-1)?.batches ?? [],
    onError,
    settle,
  };
}

describe("sweepCellValues / sweepCellKey / sweepBatchSeed", () => {
  it("maps positions to concrete values, clamped to the axis", () => {
    expect(sweepCellValues(AXES, { x: 2, y: 5 })).toEqual({ x: 2, y: 20 });
    expect(sweepCellValues(AXES, {})).toEqual({ x: 0, y: 10 });
  });

  it("keys cells by positions in axis order", () => {
    expect(sweepCellKey(AXES, { y: 1, x: 2 })).toBe("x=2|y=1");
  });

  it("keeps the base seed verbatim for the first batch", () => {
    expect(sweepBatchSeed(42, 0)).toBe(42);
    expect(sweepBatchSeed(42, 8)).not.toBe(42);
  });
});

describe("createSweepSession", () => {
  it("climbs the ladder on a point selection, folding batches into the cache", async () => {
    const { session, batches, updates, settle } = makeHarness(25, point(0, 0));
    await settle();

    expect(batches).toHaveLength(1);
    expect(batches[0]!.request).toMatchObject({
      parameterValues: { x: 0, y: 10 },
      seed: 42,
      runCount: 8,
    });

    batches[0]!.stream([frame(8, [[1, 8]])]);
    batches[0]!.complete();
    await settle();

    // Second rung: 8 -> 25, so a 17-run batch with the derived seed.
    expect(batches).toHaveLength(2);
    expect(batches[1]!.request.runCount).toBe(17);
    expect(batches[1]!.request.seed).toBe(sweepBatchSeed(42, 8));

    batches[1]!.stream([frame(17, [[1, 17]])]);
    batches[1]!.complete();
    await settle();

    // Saturated: no third batch, and the final update merges both batches.
    expect(batches).toHaveLength(2);
    const last = updates.at(-1)!;
    expect(last.computing).toBe(false);
    expect(last.runTarget).toBeNull();
    expect(last.runsCompleted).toBe(25);
    expect(last.metricFrames[0]).toMatchObject({ bins: [[1, 25]] });
    session.dispose();
  });

  it("runs a range selection as one experiment with per-run drawn values", async () => {
    const { session, batches, updates, settle } = makeHarness(25);
    await settle();

    // The default full selection is one batch: 8 runs, base seed, one
    // per-run parameter draw per ranged axis, midpoint values for the
    // scenario compile.
    expect(batches).toHaveLength(1);
    const request = batches[0]!.request;
    expect(request.seed).toBe(42);
    expect(request.runCount).toBe(8);
    expect(request.parameterValues).toEqual({ x: 1, y: 15 });
    expect(request.draws!.identifiers).toEqual(["x", "y"]);
    expect(request.draws!.values).toHaveLength(16);

    const drawColumn = (draws: NonNullable<typeof request.draws>, i: number) =>
      Array.from(
        { length: draws.values.length / 2 },
        (_, run) => draws.values[run * 2 + i]!,
      );
    const xDraws = drawColumn(request.draws!, 0);
    const yDraws = drawColumn(request.draws!, 1);
    // Draws stay inside the selected value intervals and spread across them.
    expect(Math.min(...xDraws)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xDraws)).toBeLessThanOrEqual(2);
    expect(Math.max(...xDraws) - Math.min(...xDraws)).toBeGreaterThan(1);
    expect(Math.min(...yDraws)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...yDraws)).toBeLessThanOrEqual(20);

    batches[0]!.stream([frame(8, [[1, 8]])]);
    batches[0]!.complete();
    await settle();

    // The next rung extends the same sequence: runs 8..24, derived seed.
    expect(batches).toHaveLength(2);
    const second = batches[1]!.request;
    expect(second.runCount).toBe(17);
    expect(second.seed).toBe(sweepBatchSeed(42, 8));
    expect(second.draws!.values).toHaveLength(34);
    // Prefix stability: the second batch continues at global index 8, so its
    // first draw differs from the first batch's first draw.
    expect(second.draws!.values[0]).not.toBe(request.draws!.values[0]);

    const last = updates.at(-1)!;
    expect(last.runsCompleted).toBe(8);
    session.dispose();
  });

  it("rounds a ranged integer axis's midpoint to an integer", async () => {
    /** Positions 0..3 map to the integers 10..13. */
    const countAxis: ExperimentParameterAxis = {
      identifier: "n",
      min: 10,
      max: 13,
      stepCount: 3,
      integer: true,
    };
    const { session, batches, settle } = makeHarness(
      25,
      { n: { from: 0, to: 1 } },
      { axes: [countAxis] },
    );
    await settle();

    // The endpoints 10 and 11 average to 10.5, which no integer parameter
    // accepts; the compile gets 11.
    expect(batches).toHaveLength(1);
    expect(batches[0]!.request.parameterValues.n).toBe(11);
    session.dispose();
  });

  it("sends no per-run values for a point selection", async () => {
    const { session, batches, settle } = makeHarness(25, point(1, 1));
    await settle();

    expect(batches).toHaveLength(1);
    expect(batches[0]!.request.draws).toBeUndefined();
    expect(batches[0]!.request.parameterValues).toEqual({ x: 1, y: 20 });
    session.dispose();
  });

  it("restarts on the new selection when it changes", async () => {
    const { session, batches, updates, settle } = makeHarness(25, point(0, 0));
    await settle();
    batches[0]!.stream([frame(4, [[1, 4]])]);

    session.setSelection(point(1, 0));
    await settle();

    // The first batch was cancelled; its in-flight frames are discarded.
    expect(batches[0]!.cancelled).toBe(true);
    expect(batches).toHaveLength(2);
    expect(batches[1]!.request.parameterValues).toEqual({ x: 1, y: 10 });
    expect(batches[1]!.request).toMatchObject({ seed: 42, runCount: 8 });

    const last = updates.at(-1)!;
    expect(last.runsCompleted).toBe(0);
    session.dispose();
  });

  it("resumes a revisited range from its ladder position", async () => {
    const rangeSelection = { x: { from: 0, to: 2 }, y: { from: 0, to: 0 } };
    const { session, batches, settle } = makeHarness(100, rangeSelection);
    await settle();
    batches[0]!.stream([frame(8, [[2, 8]])]);
    batches[0]!.complete();
    await settle();
    expect(batches).toHaveLength(2); // second rung of the range running

    session.setSelection(point(1, 0));
    await settle();
    expect(batches).toHaveLength(3);

    session.setSelection(rangeSelection);
    await settle();

    // Back on the range: its 8 finished runs survive, so the new batch
    // starts at the second rung with the same drawn sequence.
    const resumed = batches.at(-1)!;
    expect(resumed.request.runCount).toBe(17);
    expect(resumed.request.seed).toBe(sweepBatchSeed(42, 8));
    expect(resumed.request.draws!.values[0]).toBe(
      batches[1]!.request.draws!.values[0],
    );
    session.dispose();
  });

  it("resumes a revisited point from its ladder position", async () => {
    const { session, batches, settle } = makeHarness(100, point(0, 0));
    await settle();
    batches[0]!.stream([frame(8, [[2, 8]])]);
    batches[0]!.complete();
    await settle();
    expect(batches).toHaveLength(2); // second rung of {x:0,y:0} running

    session.setSelection(point(1, 0));
    await settle();
    expect(batches).toHaveLength(3);

    session.setSelection(point(0, 0));
    await settle();

    // Back on the first point: its 8 finished runs survive, so the new batch
    // starts at the second rung, not the first.
    const resumed = batches.at(-1)!;
    expect(resumed.request.parameterValues).toEqual({ x: 0, y: 10 });
    expect(resumed.request.runCount).toBe(17);
    expect(resumed.request.seed).toBe(sweepBatchSeed(42, 8));
    session.dispose();
  });

  it("keys distinct selections separately in the cache", async () => {
    const { session, batches, settle } = makeHarness(8, point(0, 0));
    await settle();
    batches[0]!.stream([frame(8, [[3, 8]])]);
    batches[0]!.complete();
    await settle();

    // Widening to a range is a different selection: it computes fresh
    // rather than borrowing the point's runs.
    session.setSelection({ x: { from: 0, to: 1 }, y: { from: 0, to: 0 } });
    await settle();

    const rangeBatch = batches.at(-1)!;
    expect(rangeBatch.request.runCount).toBe(8);
    expect(rangeBatch.request.seed).toBe(42);
    expect(rangeBatch.request.draws!.values).toHaveLength(
      8 * rangeBatch.request.draws!.identifiers.length,
    );
    session.dispose();
  });

  it("stops and reports when a batch errors", async () => {
    const { session, batches, updates, onError, settle } = makeHarness(
      25,
      point(0, 0),
    );
    await settle();

    batches[0]!.error("device lost");
    await settle();

    expect(onError).toHaveBeenCalledWith("device lost");
    expect(batches).toHaveLength(1);
    expect(updates.at(-1)!.computing).toBe(false);
    expect(updates.at(-1)!.failed).toBe(true);
    session.dispose();
  });

  it("scopes a failure to its selection: the next one climbs the full ladder", async () => {
    const { session, batches, updates, settle } = makeHarness(25, point(0, 0));
    await settle();
    batches[0]!.error("device lost");
    await settle();
    expect(updates.at(-1)!.failed).toBe(true);

    const arrival = session.navigateTo(point(1, 0));
    await settle();
    expect(batches).toHaveLength(2);
    batches[1]!.stream([frame(8, [[1, 8]])]);
    batches[1]!.complete();
    await settle();
    // The second rung follows: the earlier failure does not stop this ladder.
    expect(batches).toHaveLength(3);
    batches[2]!.stream([frame(17, [[1, 17]])]);
    batches[2]!.complete();
    await settle();

    expect(await arrival).toMatchObject({
      position: { x: 1, y: 0 },
      runsCompleted: 25,
    });
    expect(updates.at(-1)).toMatchObject({
      computing: false,
      failed: false,
      runsCompleted: 25,
    });
    session.dispose();
  });

  it("ignores a stale rung's error once the selection has moved on", async () => {
    const { session, batches, updates, onError, settle } = makeHarness(
      25,
      point(0, 0),
    );
    await settle();
    batches[0]!.stream([frame(8, [[1, 8]])]);
    // No settle: the pipelined second rung is still starting when the
    // selection moves, so the first rung's events reach a stale loop.
    const arrival = session.navigateTo(point(1, 0));
    batches[0]!.error("device lost");
    await settle();

    expect(onError).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ computing: true, failed: false });
    // The new selection's ladder is the one computing.
    expect(batches.at(-1)!.request.parameterValues).toEqual({ x: 1, y: 10 });
    session.dispose();
    expect(await arrival).toBeNull();
  });

  it("ends a session idle on dispose, whatever was computing", async () => {
    const { session, batches, updates, settle } = makeHarness(25, point(0, 0));
    await settle();
    batches[0]!.stream([frame(4, [[1, 4]])]);
    await settle();
    // The successor rung started on the first frames: the ladder aims at 25.
    expect(updates.at(-1)).toMatchObject({ computing: true, runTarget: 25 });
    expect(updates.at(-1)!.progress).not.toBeNull();

    session.dispose();
    expect(updates.at(-1)).toMatchObject({
      computing: false,
      runTarget: null,
      progress: null,
      batches: [],
    });
    const published = updates.length;
    await settle();
    expect(updates).toHaveLength(published);
  });
});

describe("batches", () => {
  it("lists the live rungs on every update and drops them as they finish", async () => {
    const { session, batches, liveBatches, settle } = makeHarness(
      25,
      point(0, 0),
    );
    await settle();
    expect(liveBatches()).toMatchObject([
      { kind: "selection", runCount: 8, completedRuns: 0 },
    ]);

    // The pipelined successor joins the list once the first rung streams.
    batches[0]!.stream([frame(8, [[1, 8]])]);
    await settle();
    expect(liveBatches()).toMatchObject([
      { kind: "selection", runCount: 8, completedRuns: 8 },
      { kind: "selection", runCount: 17, completedRuns: 0 },
    ]);
    expect(new Set(liveBatches().map((batch) => batch.id)).size).toBe(2);

    batches[0]!.complete();
    await settle();
    expect(liveBatches()).toHaveLength(1);

    session.dispose();
    expect(liveBatches()).toEqual([]);
  });

  it("keeps the merged frames' identity on a progress-only tick with two rungs live", async () => {
    const { session, batches, updates, liveBatches, settle } = makeHarness(
      25,
      point(0, 0),
    );
    await settle();
    batches[0]!.stream([frame(8, [[1, 8]])]);
    await settle();
    batches[1]!.stream([frame(17, [[2, 17]])]);
    await settle();
    const merged = updates.at(-1)!.metricFrames;
    expect(merged[0]).toMatchObject({ runSampleCount: 25 });

    const published = updates.length;
    batches[1]!.tick(5);
    await settle();
    expect(updates.length).toBeGreaterThan(published);
    expect(updates.at(-1)!.metricFrames).toBe(merged);
    expect(liveBatches()[1]).toMatchObject({ runCount: 17, completedRuns: 5 });
    session.dispose();
  });
});

describe("pipelined ladder rungs", () => {
  it("starts the next rung once the current one streams, before it completes", async () => {
    const { session, batches, settle } = makeHarness(25, point(0, 0));
    await settle();
    expect(batches).toHaveLength(1);

    batches[0]!.stream([frame(8, [[1, 8]])]);
    await settle();

    // Rung 2 (runs 8..24) is already in flight while rung 1 still computes.
    expect(batches).toHaveLength(2);
    expect(batches[1]!.started).toBe(true);
    expect(batches[1]!.request.runCount).toBe(17);
    expect(batches[1]!.request.seed).toBe(sweepBatchSeed(42, 8));
    session.dispose();
  });

  it("folds out-of-order completions in order", async () => {
    const { session, batches, updates, settle } = makeHarness(25, point(0, 0));
    await settle();
    batches[0]!.stream([frame(8, [[1, 8]])]);
    await settle();

    // The successor finishes first; its fold waits for rung 1.
    batches[1]!.stream([frame(17, [[2, 17]])]);
    batches[1]!.complete();
    await settle();
    expect(updates.at(-1)!.runsCompleted).toBe(0);

    batches[0]!.complete();
    await settle();
    expect(updates.at(-1)!.runsCompleted).toBe(25);
    expect(updates.at(-1)!.computing).toBe(false);
    session.dispose();
  });

  it("a selection change aborts both live rungs", async () => {
    const { session, batches, settle } = makeHarness(25, point(0, 0));
    await settle();
    batches[0]!.stream([frame(8, [[1, 8]])]);
    await settle();
    expect(batches).toHaveLength(2);

    session.setSelection(point(1, 0));
    await settle();

    expect(batches[0]!.cancelled).toBe(true);
    expect(batches[1]!.cancelled).toBe(true);
    // The new selection's own first rung is in flight.
    expect(batches).toHaveLength(3);
    expect(batches[2]!.request.parameterValues).toEqual({ x: 1, y: 10 });
    session.dispose();
  });
});

describe("starting idle", () => {
  it("computes nothing until a selection arrives, publishing once as idle", async () => {
    const { session, batches, updates, settle } = makeHarness(25, undefined, {
      startComputing: false,
    });
    await settle();
    expect(batches).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      computing: false,
      runTarget: null,
      runsCompleted: 0,
      visited: [],
    });

    session.setSelection(point(1, 0));
    await settle();
    expect(batches).toHaveLength(1);
    expect(batches[0]!.request.parameterValues).toEqual({ x: 1, y: 10 });
    session.dispose();
  });
});

describe("navigateTo", () => {
  it("stops the ladder at the cap, resolves with the point's values and publishes it as visited", async () => {
    const { session, batches, updates, settle } = makeHarness(100, point(0, 0));
    await settle();
    expect(batches).toHaveLength(1);

    const arrival = session.navigateTo(point(2, 1), { runCap: 8 });
    await settle();
    // The first point's rung was aborted; the trial's rung runs at the cap.
    expect(batches).toHaveLength(2);
    expect(batches[1]!.request).toMatchObject({
      parameterValues: { x: 2, y: 20 },
      seed: 42,
      runCount: 8,
    });

    batches[1]!.stream([frame(8, [[5, 8]])]);
    await settle();
    // No successor rung: the cap is the top of the ladder.
    expect(batches).toHaveLength(2);
    batches[1]!.complete();
    await settle();

    expect(await arrival).toEqual({
      position: { x: 2, y: 1 },
      runsCompleted: 8,
      means: { m: 5 },
      sampleCounts: { m: 8 },
    });
    expect(updates.at(-1)).toMatchObject({
      computing: false,
      runTarget: null,
      runsCompleted: 8,
    });
    expect(updates.at(-1)!.visited).toEqual([
      {
        position: { x: 2, y: 1 },
        runsCompleted: 8,
        means: { m: 5 },
        sampleCounts: { m: 8 },
      },
    ]);

    // A plain selection of the same point lifts the cap: the ladder resumes.
    session.setSelection(point(2, 1));
    await settle();
    expect(batches).toHaveLength(3);
    expect(batches[2]!.request).toMatchObject({
      runCount: 17,
      seed: sweepBatchSeed(42, 8),
    });
    session.dispose();
  });

  it("resolves a revisited point from the cache without a new batch", async () => {
    const { session, batches, settle } = makeHarness(100, point(0, 0), {
      startComputing: false,
    });
    const first = session.navigateTo(point(1, 1), { runCap: 8 });
    await settle();
    batches[0]!.stream([frame(8, [[2, 8]])]);
    batches[0]!.complete();
    await settle();
    expect((await first)?.runsCompleted).toBe(8);

    void session.navigateTo(point(0, 0), { runCap: 8 });
    await settle();
    const again = session.navigateTo(point(1, 1), { runCap: 8 });
    await settle();
    expect(await again).toMatchObject({ runsCompleted: 8, means: { m: 2 } });
    expect(
      batches.filter((batch) => batch.request.parameterValues.x === 1),
    ).toHaveLength(1);
    session.dispose();
  });

  it("resolves null when another navigation supersedes it, and on dispose", async () => {
    const { session, settle } = makeHarness(100, point(0, 0), {
      startComputing: false,
    });
    const superseded = session.navigateTo(point(1, 0), { runCap: 8 });
    await settle();
    const pending = session.navigateTo(point(2, 0), { runCap: 8 });
    await settle();
    expect(await superseded).toBeNull();

    session.dispose();
    expect(await pending).toBeNull();
  });

  it("rejects with the batch's reason when its own point fails", async () => {
    const { session, batches, updates, settle } = makeHarness(
      100,
      point(0, 0),
      {
        startComputing: false,
      },
    );
    const arrival = session.navigateTo(point(2, 0), { runCap: 8 });
    await settle();
    expect(batches).toHaveLength(1);

    batches[0]!.error("device lost");
    await expect(arrival).rejects.toThrow("device lost");
    await settle();
    expect(updates.at(-1)).toMatchObject({ computing: false, failed: true });
    session.dispose();
  });
});
