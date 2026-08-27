import { describe, expect, it, vi } from "vitest";

import {
  createSweepSession,
  sweepBatchSeed,
  sweepCellKey,
  sweepSelectionValues,
} from "./sweep-session";

import type { SweepSessionUpdate } from "./sweep-session";
import type {
  MonteCarloExperiment,
  MonteCarloExperimentEvent,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloWorkerProgress,
} from "@hashintel/petrinaut-core";

const AXES = [
  { identifier: "x", values: [0, 1, 2] },
  { identifier: "y", values: [10, 20] },
];

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
    start: () => {},
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
    stream(nextFrames: readonly MonteCarloUserDefinedMetricFrame[]) {
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

function makeHarness(runCount: number) {
  const batches: ReturnType<typeof makeFakeBatch>[] = [];
  const updates: SweepSessionUpdate[] = [];
  const onError = vi.fn();

  const session = createSweepSession({
    axes: AXES,
    runCount,
    seed: 42,
    instantiateBatch: (request) => {
      const batch = makeFakeBatch(request);
      batches.push(batch);
      return Promise.resolve(batch.handle);
    },
    onUpdate: (update) => updates.push(update),
    onError,
  });

  const settle = async () => {
    // Instantiation resolves through microtasks; two flushes cover the chain.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  return { session, batches, updates, onError, settle };
}

describe("sweepSelectionValues / sweepCellKey / sweepBatchSeed", () => {
  it("maps value indices to concrete values, clamped to the axis", () => {
    expect(sweepSelectionValues(AXES, { x: 2, y: 5 })).toEqual({ x: 2, y: 20 });
    expect(sweepSelectionValues(AXES, {})).toEqual({ x: 0, y: 10 });
  });

  it("keys cells by values in axis order", () => {
    expect(sweepCellKey(AXES, { y: 20, x: 1 })).toBe("x=1|y=20");
  });

  it("keeps the base seed verbatim for the first batch", () => {
    expect(sweepBatchSeed(42, 0)).toBe(42);
    expect(sweepBatchSeed(42, 8)).not.toBe(42);
  });
});

describe("createSweepSession", () => {
  it("climbs the ladder on the initial selection, folding batches into the cache", async () => {
    const { session, batches, updates, settle } = makeHarness(25);
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

  it("restarts on the new combination when the selection changes", async () => {
    const { session, batches, updates, settle } = makeHarness(25);
    await settle();
    batches[0]!.stream([frame(4, [[1, 4]])]);

    session.setSelection({ x: 1, y: 0 });
    await settle();

    // The first batch was cancelled; its in-flight frames are discarded.
    expect(batches[0]!.cancelled).toBe(true);
    expect(batches).toHaveLength(2);
    expect(batches[1]!.request.parameterValues).toEqual({ x: 1, y: 10 });
    expect(batches[1]!.request).toMatchObject({ seed: 42, runCount: 8 });

    const last = updates.at(-1)!;
    expect(last.parameterValues).toEqual({ x: 1, y: 10 });
    expect(last.runsCompleted).toBe(0);
    session.dispose();
  });

  it("resumes a revisited combination from its ladder position", async () => {
    const { session, batches, settle } = makeHarness(100);
    await settle();
    batches[0]!.stream([frame(8, [[2, 8]])]);
    batches[0]!.complete();
    await settle();
    expect(batches).toHaveLength(2); // second rung of {x:0,y:10} running

    session.setSelection({ x: 1, y: 0 });
    await settle();
    expect(batches).toHaveLength(3);

    session.setSelection({ x: 0, y: 0 });
    await settle();

    // Back on the first combination: its 8 finished runs survive, so the new
    // batch starts at the second rung, not the first.
    const resumed = batches.at(-1)!;
    expect(resumed.request.parameterValues).toEqual({ x: 0, y: 10 });
    expect(resumed.request.runCount).toBe(17);
    expect(resumed.request.seed).toBe(sweepBatchSeed(42, 8));
    session.dispose();
  });

  it("stops and reports when a batch errors", async () => {
    const { session, batches, updates, onError, settle } = makeHarness(25);
    await settle();

    batches[0]!.error("device lost");
    await settle();

    expect(onError).toHaveBeenCalledWith("device lost");
    expect(batches).toHaveLength(1);
    expect(updates.at(-1)!.computing).toBe(false);
    session.dispose();
  });

  it("exposes finished cells to other readers", async () => {
    const { session, batches, settle } = makeHarness(8);
    await settle();
    batches[0]!.stream([frame(8, [[3, 8]])]);
    batches[0]!.complete();
    await settle();

    expect(session.getCell({ x: 0, y: 10 })).toMatchObject({
      runsCompleted: 8,
    });
    expect(session.getCell({ x: 2, y: 20 })).toBeUndefined();
    session.dispose();
  });
});
