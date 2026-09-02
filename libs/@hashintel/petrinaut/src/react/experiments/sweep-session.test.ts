import { describe, expect, it, vi } from "vitest";

import { deriveRunSeed } from "@hashintel/petrinaut-core";

import {
  createSweepSession,
  sweepBatchSeed,
  sweepCellKey,
  sweepCellValues,
} from "./sweep-session";

import type { ExperimentParameterAxis } from "./parameter-grid";
import type {
  CreateSweepSessionOptions,
  SweepBatchStatus,
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
  background?: boolean;
  requiresRunResults?: boolean;
  foregroundActive?: boolean;
  runSeeds?: readonly number[];
}) {
  let metricListeners: ((value: {
    frames: readonly MonteCarloUserDefinedMetricFrame[];
    latestByMetricId: Readonly<
      Record<string, MonteCarloUserDefinedMetricFrame>
    >;
  }) => void)[] = [];
  let eventListeners: ((event: MonteCarloExperimentEvent) => void)[] = [];
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
      subscribe: () => () => {},
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
  options: Partial<Pick<CreateSweepSessionOptions, "initialMarkingKey">> = {},
) {
  const batches: ReturnType<typeof makeFakeBatch>[] = [];
  const updates: SweepSessionUpdate[] = [];
  /** Every published batch list; the last entry is the live one. */
  const batchLists: (readonly SweepBatchStatus[])[] = [];
  const onError = vi.fn();

  const session = createSweepSession({
    axes: AXES,
    runCount,
    seed: 42,
    ...(initialSelection ? { initialSelection } : {}),
    instantiateBatch: (request) => {
      const batch = makeFakeBatch(request);
      batches.push(batch);
      return Promise.resolve(batch.handle);
    },
    // Every cell shares one marking unless a test says otherwise.
    initialMarkingKey: options.initialMarkingKey ?? (() => "shared"),
    onUpdate: (update) => updates.push(update),
    onBatches: (list) => batchLists.push(list),
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
    liveBatches: () => batchLists.at(-1) ?? [],
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
    session.dispose();
  });

  it("samples cells one batch each when their markings differ, streaming each", async () => {
    // A marking the swept `x` shapes: no two cells of the chunk can share a
    // batch.
    const { session, batches, settle } = makeHarness(100, point(0, 0), {
      initialMarkingKey: (values) => `marking@${values.x}`,
    });
    await settle();
    expect(batches).toHaveLength(1); // the navigator's own first rung

    const partials: (readonly (Readonly<Record<string, number>> | null)[])[] =
      [];
    const result = session.sampleCells(
      [
        { x: 2, y: 1 },
        { x: 1, y: 1 },
      ],
      8,
      (cells) => partials.push(cells),
    );
    await settle();

    expect(batches).toHaveLength(3);
    expect(batches[1]!.request).toMatchObject({
      parameterValues: { x: 2, y: 20 },
      seed: 42,
      runCount: 8,
      background: true,
    });
    expect(batches[1]!.request.draws).toBeUndefined();
    expect(batches[2]!.request.parameterValues).toEqual({ x: 1, y: 20 });

    // Cells resolve independently and each one streams the chunk so far.
    batches[2]!.stream([frame(8, [[6, 8]])]);
    batches[2]!.complete();
    await settle();
    expect(partials.at(-1)).toEqual([null, { m: 6 }]);

    batches[1]!.stream([frame(8, [[5, 8]])]);
    batches[1]!.complete();
    expect(await result).toEqual([{ m: 5 }, { m: 6 }]);

    // Sampled cells are readable like navigator-visited ones.
    expect(session.getCell({ x: 2, y: 1 })).toMatchObject({
      runsCompleted: 8,
    });
    session.dispose();
  });

  it("resolves a per-cell sample from cache when it is already deep enough", async () => {
    // A non-compiling marking keeps the per-cell path.
    const { session, batches, settle } = makeHarness(25, point(0, 0), {
      initialMarkingKey: () => null,
    });
    await settle();
    batches[0]!.stream([frame(8, [[1, 8]])]);
    batches[0]!.complete();
    await settle();

    // The navigator already took {x:0,y:0} to 8 runs; sampling it is free.
    await expect(session.sampleCells([{ x: 0, y: 0 }], 8)).resolves.toEqual([
      { m: 1 },
    ]);
    expect(batches.filter((batch) => batch.request.background).length).toBe(0);
    session.dispose();
  });

  it("exposes finished cells to other readers", async () => {
    const { session, batches, settle } = makeHarness(8, point(0, 0));
    await settle();
    batches[0]!.stream([frame(8, [[3, 8]])]);
    batches[0]!.complete();
    await settle();

    expect(session.getCell({ x: 0, y: 0 })).toMatchObject({
      runsCompleted: 8,
    });
    expect(session.getCell({ x: 2, y: 1 })).toBeUndefined();
    session.dispose();
  });
});

describe("onBatches", () => {
  it("lists live batches selection-first and drops them as they finish", async () => {
    const { session, batches, liveBatches, settle } = makeHarness(
      25,
      point(0, 0),
    );
    await settle();
    expect(liveBatches()).toMatchObject([
      { kind: "selection", runCount: 8, completedRuns: 0 },
    ]);

    void session.sampleCells([{ x: 0, y: 0 }], 2);
    await settle();
    expect(liveBatches().map((batch) => batch.kind)).toEqual([
      "selection",
      "surface",
    ]);

    // The pipelined successor joins the list once the first rung streams.
    batches[0]!.stream([frame(8, [[1, 8]])]);
    await settle();
    expect(liveBatches().map((batch) => batch.kind)).toEqual([
      "selection",
      "selection",
      "surface",
    ]);

    batches[0]!.complete();
    await settle();
    expect(
      liveBatches().filter((batch) => batch.kind === "selection"),
    ).toHaveLength(1);

    session.dispose();
    expect(liveBatches()).toEqual([]);
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

describe("foregroundActive hint", () => {
  it("marks chunk batches by whether the refine ladder is computing", async () => {
    const { session, batches, settle } = makeHarness(8, point(0, 0));
    await settle();

    // The ladder's only rung is in flight: background chunks yield.
    void session.sampleCells([{ x: 0, y: 0 }], 2);
    await settle();
    expect(batches.at(-1)!.request.foregroundActive).toBe(true);

    batches[0]!.stream([frame(8, [[1, 8]])]);
    batches[0]!.complete();
    await settle();

    // The ladder reached its target and idles: chunks may go wide.
    void session.sampleCells([{ x: 1, y: 0 }], 2);
    await settle();
    expect(batches.at(-1)!.request.foregroundActive).toBe(false);
  });
});

describe("whenSelectionStreamed", () => {
  const trackResolved = (promise: Promise<void>) => {
    const state = { resolved: false };
    void promise.then(() => {
      state.resolved = true;
    });
    return state;
  };

  it("resolves when the current selection streams its first frames", async () => {
    const { session, batches, settle } = makeHarness(25, point(0, 0));
    await settle();

    const gate = trackResolved(session.whenSelectionStreamed());
    await settle();
    expect(gate.resolved).toBe(false);

    batches[0]!.stream([frame(8, [[1, 8]])]);
    await settle();
    expect(gate.resolved).toBe(true);
  });

  it("re-arms on a selection change and resolves for the new selection", async () => {
    const { session, batches, settle } = makeHarness(25, point(0, 0));
    await settle();
    batches[0]!.stream([frame(8, [[1, 8]])]);
    await settle();

    session.setSelection(point(1, 0));
    await settle();
    const gate = trackResolved(session.whenSelectionStreamed());
    await settle();
    expect(gate.resolved).toBe(false);

    batches.at(-1)!.stream([frame(8, [[2, 8]])]);
    await settle();
    expect(gate.resolved).toBe(true);
  });

  it("resolves immediately for a selection already sampled from cache", async () => {
    const { session, batches, settle } = makeHarness(8, point(0, 0));
    await settle();
    batches[0]!.stream([frame(8, [[1, 8]])]);
    batches[0]!.complete();
    await settle();

    // Move away and back: the cached selection publishes its runs at once.
    session.setSelection(point(1, 0));
    await settle();
    session.setSelection(point(0, 0));
    await settle();

    const gate = trackResolved(session.whenSelectionStreamed());
    await settle();
    expect(gate.resolved).toBe(true);
  });

  it("resolves on dispose so waiters never hang", async () => {
    const { session, settle } = makeHarness(25, point(0, 0));
    await settle();
    const gate = trackResolved(session.whenSelectionStreamed());
    session.dispose();
    await settle();
    expect(gate.resolved).toBe(true);
  });
});

describe("sampleCells", () => {
  const CELLS = [
    { x: 0, y: 0 },
    { x: 2, y: 1 },
  ];

  async function sampleTwoCells(runsPerCell: number) {
    const harness = makeHarness(1000);
    const resultPromise = harness.session.sampleCells(CELLS, runsPerCell);
    await harness.settle();
    // The navigator's own full-space batch is the other one.
    const chunk = harness.batches.find((batch) => batch.request.background)!;
    return { ...harness, chunk, resultPromise };
  }

  it("lays every cell out as per-run draws with pinned per-cell seeds", async () => {
    const { chunk } = await sampleTwoCells(2);

    expect(chunk.request).toMatchObject({
      parameterValues: { x: 0, y: 10 },
      seed: 42,
      runCount: 4,
      background: true,
      requiresRunResults: true,
    });
    expect(chunk.request.draws?.identifiers).toEqual(["x", "y"]);
    // Cell values repeated runsPerCell times, in cell order.
    expect([...chunk.request.draws!.values]).toEqual([
      0, 10, 0, 10, 2, 20, 2, 20,
    ]);
    // Every cell pins the SAME seed sequence — the one the per-cell ladder's
    // first batch derives — so values are chunk-layout-independent.
    const cellSeeds = [deriveRunSeed(42, 0), deriveRunSeed(42, 1)];
    expect(chunk.request.runSeeds).toEqual([...cellSeeds, ...cellSeeds]);
  });

  it("groups per-run results into index-aligned per-cell means", async () => {
    const { chunk, resultPromise, settle } = await sampleTwoCells(2);

    chunk.setRunResults(
      new Map([
        [0, { m: 1 }],
        [1, { m: 3 }],
        [2, { m: 10 }],
        [3, { m: 20 }],
      ]),
    );
    chunk.stream([frame(4, [[1, 4]])]);
    chunk.complete();
    await settle();

    expect(await resultPromise).toEqual([{ m: 2 }, { m: 15 }]);
  });

  it("streams partial per-cell means as shards complete", async () => {
    const harness = makeHarness(1000);
    const partials: (readonly (Readonly<Record<string, number>> | null)[])[] =
      [];
    const resultPromise = harness.session.sampleCells(CELLS, 2, (cells) =>
      partials.push(cells),
    );
    await harness.settle();
    const chunk = harness.batches.find((batch) => batch.request.background)!;

    // First shard lands: only cell 0's runs are in; cell 1 is still null.
    chunk.setRunResults(
      new Map([
        [0, { m: 1 }],
        [1, { m: 3 }],
      ]),
    );
    expect(partials.at(-1)).toEqual([{ m: 2 }, null]);

    // Second shard: both cells now carry means.
    chunk.setRunResults(
      new Map([
        [0, { m: 1 }],
        [1, { m: 3 }],
        [2, { m: 10 }],
        [3, { m: 20 }],
      ]),
    );
    expect(partials.at(-1)).toEqual([{ m: 2 }, { m: 15 }]);

    chunk.stream([frame(4, [[1, 4]])]);
    chunk.complete();
    await harness.settle();
    expect(await resultPromise).toEqual([{ m: 2 }, { m: 15 }]);
  });

  it("returns null for a cell with no finished runs", async () => {
    const { chunk, resultPromise, settle } = await sampleTwoCells(2);

    chunk.setRunResults(
      new Map([
        [0, { m: 1 }],
        [1, { m: 3 }],
      ]),
    );
    chunk.stream([frame(2, [[1, 2]])]);
    chunk.complete();
    await settle();

    expect(await resultPromise).toEqual([{ m: 2 }, null]);
  });
});
