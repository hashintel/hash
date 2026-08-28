import { describe, expect, it, vi } from "vitest";

import {
  createSweepSession,
  sweepBatchSeed,
  sweepCellKey,
  sweepCellValues,
} from "./sweep-session";

import type { ExperimentParameterAxis } from "./parameter-grid";
import type { SweepSelection, SweepSessionUpdate } from "./sweep-session";
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
  seed: number;
  runCount: number;
  background?: boolean;
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
    runResults: { get: () => new Map(), subscribe: () => () => {} },
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

function makeHarness(runCount: number, initialSelection?: SweepSelection) {
  const batches: ReturnType<typeof makeFakeBatch>[] = [];
  const updates: SweepSessionUpdate[] = [];
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
    onUpdate: (update) => updates.push(update),
    onError,
  });

  const settle = async () => {
    // Instantiation resolves through microtasks; three flushes cover the chain.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  return { session, batches, updates, onError, settle };
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
    expect(last.cellsInRegion).toBe(1);
    expect(last.metricFrames[0]).toMatchObject({ bins: [[1, 25]] });
    session.dispose();
  });

  it("levels every cell of the default full region at the first rung", async () => {
    const { session, batches, updates, settle } = makeHarness(8);

    // 3 x-positions × 2 y-positions = 6 cells, each one 8-run batch at the
    // first rung, all with the base seed — common random numbers across the
    // region.
    const seenCells = new Set<string>();
    for (let index = 0; index < 6; index++) {
      await settle();
      const batch = batches.at(-1)!;
      expect(batch.request.seed).toBe(42);
      expect(batch.request.runCount).toBe(8);
      seenCells.add(
        `${batch.request.parameterValues.x},${batch.request.parameterValues.y}`,
      );
      batch.stream([frame(8, [[1, 8]])]);
      batch.complete();
    }
    await settle();

    expect(batches).toHaveLength(6);
    expect(seenCells.size).toBe(6);

    const last = updates.at(-1)!;
    expect(last.computing).toBe(false);
    expect(last.cellsInRegion).toBe(6);
    expect(last.cellsSampled).toBe(6);
    expect(last.runsCompleted).toBe(48);
    // The merged region view sums every cell's bins.
    expect(last.metricFrames[0]).toMatchObject({ bins: [[1, 48]] });
    session.dispose();
  });

  it("restarts on the new region when the selection changes", async () => {
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
    expect(last.activeCellValues).toEqual({ x: 1, y: 10 });
    expect(last.runsCompleted).toBe(0);
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

  it("shows cached cells of a widened region immediately", async () => {
    const { session, batches, updates, settle } = makeHarness(8, point(0, 0));
    await settle();
    batches[0]!.stream([frame(8, [[3, 8]])]);
    batches[0]!.complete();
    await settle();

    // Widen x to cover positions 0..1: the cached point contributes to the
    // merged view straight away, before the new cell finishes.
    session.setSelection({ x: { from: 0, to: 1 }, y: { from: 0, to: 0 } });
    await settle();

    const during = updates.at(-1)!;
    expect(during.cellsInRegion).toBe(2);
    expect(during.cellsSampled).toBe(1);
    expect(during.runsCompleted).toBe(8);
    expect(during.metricFrames[0]).toMatchObject({ bins: [[3, 8]] });
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

  it("samples background cells up the same seed ladder, one at a time", async () => {
    const { session, batches, settle } = makeHarness(100, point(0, 0));
    await settle();
    expect(batches).toHaveLength(1); // the navigator's own first rung

    const first = session.sampleCell({ x: 2, y: 1 }, 8);
    const second = session.sampleCell({ x: 1, y: 1 }, 8);
    await settle();

    // Serialized: the second background batch waits for the first.
    expect(batches).toHaveLength(2);
    expect(batches[1]!.request).toMatchObject({
      parameterValues: { x: 2, y: 20 },
      seed: 42,
      runCount: 8,
      background: true,
    });

    batches[1]!.stream([frame(8, [[5, 8]])]);
    batches[1]!.complete();
    await expect(first).resolves.toMatchObject({ runsCompleted: 8 });
    await settle();

    expect(batches).toHaveLength(3);
    batches[2]!.stream([frame(8, [[6, 8]])]);
    batches[2]!.complete();
    await expect(second).resolves.toMatchObject({ runsCompleted: 8 });

    // Sampled cells are readable like navigator-visited ones.
    expect(session.getCell({ x: 2, y: 1 })).toMatchObject({
      runsCompleted: 8,
    });
    session.dispose();
  });

  it("resolves a sampled cell from cache when it is already deep enough", async () => {
    const { session, batches, settle } = makeHarness(25, point(0, 0));
    await settle();
    batches[0]!.stream([frame(8, [[1, 8]])]);
    batches[0]!.complete();
    await settle();

    // The navigator already took {x:0,y:0} to 8 runs; sampling it is free.
    await expect(session.sampleCell({ x: 0, y: 0 }, 8)).resolves.toMatchObject({
      runsCompleted: 8,
    });
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
