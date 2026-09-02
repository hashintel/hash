import { describe, expect, it, vi } from "vitest";

import { compileHirArtifacts } from "../../../hir/compile";
import { createInProcessMonteCarloWorker } from "../worker/in-process-worker";
import { createMonteCarloExperiment } from "./experiment";

import type { WorkerLike } from "../../../environment";
import type { HirMetricArtifact } from "../../../hir/instantiate";
import type { SDCPN } from "../../../types/sdcpn";
import type { SimulationTransport } from "../../api";
import type { MonteCarloUserDefinedMetricFrame } from "../metrics";
import type {
  MonteCarloToMainMessage,
  MonteCarloToWorkerMessage,
  MonteCarloWorkerProgress,
} from "../worker/messages";

const empty = (): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
});

/** Compiles a metric body to its HIR buffer artifact (expression specs are
 * artifact-only at runtime). */
function metricArtifact(
  code: string,
  sdcpn: SDCPN = empty(),
): HirMetricArtifact {
  const { artifacts, failures } = compileHirArtifacts({
    ...sdcpn,
    metrics: [{ id: "__test__", name: "test", code }],
  });
  const artifact = artifacts.metrics.__test__;
  if (!artifact) {
    throw new Error(
      `Metric did not compile: ${JSON.stringify(failures, null, 2)}`,
    );
  }
  return artifact;
}

function makeProgress(
  overrides: Partial<MonteCarloWorkerProgress> = {},
): MonteCarloWorkerProgress {
  return {
    activeRuns: 1,
    advancedRuns: 1,
    allFinished: false,
    completedRuns: 0,
    erroredRuns: 0,
    frameNumber: 1,
    runCount: 1,
    time: 1,
    ...overrides,
  };
}

function makeMetricFrame(
  frameNumber: number,
): MonteCarloUserDefinedMetricFrame {
  return {
    metricId: "constant",
    label: "Constant",
    outputType: "scalar",
    frameNumber,
    time: frameNumber,
    value: frameNumber,
    frameValue: frameNumber,
    timeValue: null,
    runSampleCount: 1,
    timeSampleCount: frameNumber + 1,
    runAggregate: {
      count: 1,
      sum: frameNumber,
      min: frameNumber,
      max: frameNumber,
      last: frameNumber,
    },
    aggregateRuns: "mean",
    aggregateTime: "none",
  };
}

function makeMockTransport() {
  const sent: MonteCarloToWorkerMessage[] = [];
  const listeners = new Set<(message: unknown) => void>();
  let terminated = false;

  const transport: SimulationTransport = {
    send(message) {
      sent.push(message as MonteCarloToWorkerMessage);
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    terminate() {
      terminated = true;
      listeners.clear();
    },
  };

  return {
    transport,
    sent,
    isTerminated: () => terminated,
    simulate(message: MonteCarloToMainMessage) {
      for (const listener of listeners) {
        listener(message);
      }
    },
  };
}

function createExperimentWithMockTransport(mock: {
  transport: SimulationTransport;
}) {
  return createMonteCarloExperiment({
    transport: mock.transport,
    sdcpn: empty(),
    initialMarking: {},
    parameterValues: {},
    seed: 1,
    dt: 1,
    maxTime: 10,
    runCount: 1,
  });
}

/**
 * Drives a sharded experiment through fake workers, one mock transport per
 * shard, so shard fan-out and metric merging can be exercised without threads.
 */
function createShardedExperiment(options: {
  runCount: number;
  shardCount: number;
}) {
  const mocks: ReturnType<typeof makeMockTransport>[] = [];

  const promise = createMonteCarloExperiment({
    createWorker: () => {
      const mock = makeMockTransport();
      mocks.push(mock);
      // The real factory returns a Worker; the transport only needs the
      // message plumbing, which the mock transport provides directly.
      const worker: WorkerLike = {
        postMessage: (message) => {
          mock.transport.send(message);
        },
        addEventListener: (_type, listener) => {
          mock.transport.onMessage((message) => {
            listener({ data: message });
          });
        },
        terminate: () => {
          mock.transport.terminate();
        },
      };
      return worker;
    },
    sdcpn: empty(),
    initialMarking: {},
    parameterValues: {},
    seed: 1,
    dt: 1,
    maxTime: 10,
    runCount: options.runCount,
    shardCount: options.shardCount,
  });

  return { promise, mocks };
}

/** Awaits the worker-transport factory's internal promise resolution. */
const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("createMonteCarloExperiment run results", () => {
  it("slices explicit run configs to each shard's global range", async () => {
    const mocks: ReturnType<typeof makeMockTransport>[] = [];
    void createMonteCarloExperiment({
      createWorker: () => {
        const mock = makeMockTransport();
        mocks.push(mock);
        const worker: WorkerLike = {
          postMessage: (message) => {
            mock.transport.send(message);
          },
          addEventListener: (_type, listener) => {
            mock.transport.onMessage((message) => {
              listener({ data: message });
            });
          },
          terminate: () => {
            mock.transport.terminate();
          },
        };
        return worker;
      },
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 1,
      maxTime: 10,
      runCount: 5,
      shardCount: 2,
      runs: [10, 11, 12, 13, 14].map((seed) => ({ seed })),
    });
    await flushMicrotasks();

    expect(
      mocks.map((mock) => {
        const init = mock.sent.find((message) => message.type === "init");
        return init?.type === "init" ? init.runs?.map((run) => run.seed) : null;
      }),
    ).toStrictEqual([
      [10, 11, 12],
      [13, 14],
    ]);
  });

  it("rejects a runs list whose length differs from runCount", async () => {
    await expect(
      createMonteCarloExperiment({
        createWorker: () => {
          throw new Error("must not be called");
        },
        sdcpn: empty(),
        initialMarking: {},
        parameterValues: {},
        seed: 1,
        dt: 1,
        maxTime: 10,
        runCount: 3,
        runs: [{ seed: 1 }],
      }),
    ).rejects.toThrow("3 runs");
  });

  it("rejects a short runs list on the local path too", async () => {
    await expect(
      createMonteCarloExperiment({
        sdcpn: empty(),
        initialMarking: {},
        parameterValues: {},
        seed: 1,
        dt: 1,
        maxTime: 10,
        runCount: 3,
        runs: [{ seed: 1 }],
        metricSpecs: [],
      }),
    ).rejects.toThrow("3 runs");
  });

  it("stops an in-process worker's compute loop when the experiment is disposed", async () => {
    const handle = await createMonteCarloExperiment({
      createWorker: createInProcessMonteCarloWorker,
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 0.001,
      maxTime: 1_000,
      runCount: 1,
      metricSpecs: [],
    });
    // The core compiles against no host types, so the host timer is reached
    // structurally, as the worker itself does.
    const host = globalThis as unknown as {
      setTimeout: (handler: () => void, timeout?: number) => unknown;
    };
    const wait = (ms: number) =>
      new Promise<void>((resolve) => host.setTimeout(resolve, ms));
    handle.start();
    await wait(20);
    handle.dispose();

    const timers = vi.spyOn(host, "setTimeout");
    await wait(20);
    const scheduledAfterDispose = timers.mock.calls.length;
    await wait(20);
    const scheduledLater = timers.mock.calls.length;
    timers.mockRestore();
    // Only this test's own wait was scheduled; the batch loop is quiet.
    expect(scheduledLater - scheduledAfterDispose).toBe(1);
  });

  it("collects per-run final values across in-process worker shards", async () => {
    const experiment = await createMonteCarloExperiment({
      createWorker: createInProcessMonteCarloWorker,
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 1,
      maxTime: 2,
      runCount: 3,
      shardCount: 2,
      runs: [{ seed: 7 }, { seed: 8 }, { seed: 9 }],
      metricSpecs: [
        {
          kind: "expression",
          id: "objective",
          label: "Objective",
          sampleRuns: "all",
          code: "return 42;",
          artifact: metricArtifact("return 42;"),
        },
      ],
    });

    const complete = new Promise<void>((resolve) => {
      experiment.events.subscribe((event) => {
        if (event.type === "complete") {
          resolve();
        }
      });
    });
    experiment.start();
    await complete;

    expect(experiment.status.get()).toBe("Complete");
    expect([...experiment.runResults.get().entries()]).toStrictEqual([
      [0, { objective: 42 }],
      [1, { objective: 42 }],
      [2, { objective: 42 }],
    ]);
    experiment.dispose();
  });

  it("keeps each run's own final value on the local path", async () => {
    const experiment = await createMonteCarloExperiment({
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 1,
      maxTime: 2,
      runCount: 2,
      metrics: [
        {
          id: "run-index",
          label: "Run index",
          sampleRuns: "all",
          measure: ({ runIndex }) => runIndex,
        },
      ],
    });

    const complete = new Promise<void>((resolve) => {
      experiment.events.subscribe((event) => {
        if (event.type === "complete") {
          resolve();
        }
      });
    });
    experiment.start();
    await complete;

    expect([...experiment.runResults.get().entries()]).toStrictEqual([
      [0, { "run-index": 0 }],
      [1, { "run-index": 1 }],
    ]);
    experiment.dispose();
  });
});

describe("createMonteCarloExperiment sharding", () => {
  it("splits runs across shards with global run index offsets", async () => {
    const { mocks } = createShardedExperiment({ runCount: 10, shardCount: 4 });
    await flushMicrotasks();

    expect(mocks).toHaveLength(4);
    expect(
      mocks.map((mock) => {
        const init = mock.sent.find((message) => message.type === "init");
        return init?.type === "init"
          ? { runIndexOffset: init.runIndexOffset, runCount: init.runCount }
          : null;
      }),
    ).toStrictEqual([
      { runIndexOffset: 0, runCount: 3 },
      { runIndexOffset: 3, runCount: 3 },
      { runIndexOffset: 6, runCount: 2 },
      { runIndexOffset: 8, runCount: 2 },
    ]);
  });

  it("never creates more shards than runs", async () => {
    const { mocks } = createShardedExperiment({ runCount: 2, shardCount: 8 });
    await flushMicrotasks();

    expect(mocks).toHaveLength(2);
  });

  it("resolves only once every shard is ready", async () => {
    const { promise, mocks } = createShardedExperiment({
      runCount: 4,
      shardCount: 2,
    });
    await flushMicrotasks();

    let resolved = false;
    void promise.then(() => {
      resolved = true;
    });

    mocks[0]!.simulate({ type: "ready" });
    await flushMicrotasks();
    expect(resolved).toBe(false);

    mocks[1]!.simulate({ type: "ready" });
    const experiment = await promise;

    expect(experiment.status.get()).toBe("Ready");
    experiment.dispose();
  });

  it("merges metric frames across shards before publishing them", async () => {
    const { promise, mocks } = createShardedExperiment({
      runCount: 4,
      shardCount: 2,
    });
    await flushMicrotasks();
    for (const mock of mocks) {
      mock.simulate({ type: "ready" });
    }
    const experiment = await promise;

    // One shard alone cannot finalise a frame — the other might still report it.
    mocks[0]!.simulate({ type: "metricFrames", frames: [makeMetricFrame(0)] });
    expect(experiment.metrics.get().frames).toHaveLength(0);

    mocks[1]!.simulate({ type: "metricFrames", frames: [makeMetricFrame(0)] });

    const frames = experiment.metrics.get().frames;
    expect(frames).toHaveLength(1);
    // Both shards contributed one run each at the same value.
    expect(frames[0]!.runSampleCount).toBe(2);

    experiment.dispose();
  });

  it("completes only after every shard completes", async () => {
    const { promise, mocks } = createShardedExperiment({
      runCount: 4,
      shardCount: 2,
    });
    await flushMicrotasks();
    for (const mock of mocks) {
      mock.simulate({ type: "ready" });
    }
    const experiment = await promise;
    const events = vi.fn();
    experiment.events.subscribe(events);

    mocks[0]!.simulate({
      type: "complete",
      progress: makeProgress({ allFinished: true, completedRuns: 2 }),
    });
    expect(experiment.status.get()).not.toBe("Complete");
    expect(events).not.toHaveBeenCalled();

    mocks[1]!.simulate({
      type: "complete",
      progress: makeProgress({ allFinished: true, completedRuns: 2 }),
    });

    expect(experiment.status.get()).toBe("Complete");
    expect(events).toHaveBeenCalledTimes(1);
    // Run tallies sum across shards.
    expect(experiment.progress.get()?.completedRuns).toBe(4);
    expect(experiment.progress.get()?.allFinished).toBe(true);

    experiment.dispose();
  });

  it("reports the slowest shard's position while any shard still runs", async () => {
    const { promise, mocks } = createShardedExperiment({
      runCount: 4,
      shardCount: 2,
    });
    await flushMicrotasks();
    for (const mock of mocks) {
      mock.simulate({ type: "ready" });
    }
    const experiment = await promise;

    mocks[0]!.simulate({
      type: "progress",
      progress: makeProgress({ frameNumber: 9, time: 9 }),
    });
    mocks[1]!.simulate({
      type: "progress",
      progress: makeProgress({ frameNumber: 3, time: 3 }),
    });

    // Merged metrics only extend as far as the slowest shard, so progress must
    // not run ahead of the data behind it.
    expect(experiment.progress.get()?.frameNumber).toBe(3);

    experiment.dispose();
  });

  it("cancels every shard when one reports cancellation", async () => {
    const { promise, mocks } = createShardedExperiment({
      runCount: 4,
      shardCount: 3,
    });
    await flushMicrotasks();
    for (const mock of mocks) {
      mock.simulate({ type: "ready" });
    }
    const experiment = await promise;

    mocks[0]!.simulate({ type: "cancelled", progress: makeProgress() });

    expect(experiment.status.get()).toBe("Cancelled");
    for (const mock of mocks.slice(1)) {
      expect(mock.sent.some((message) => message.type === "cancel")).toBe(true);
    }
    // Cancelled runs were abandoned, not finished.
    expect(experiment.progress.get()?.allFinished).toBe(false);

    experiment.dispose();
  });

  it("tears down surviving shards when one errors after start", async () => {
    const { promise, mocks } = createShardedExperiment({
      runCount: 4,
      shardCount: 2,
    });
    await flushMicrotasks();
    for (const mock of mocks) {
      mock.simulate({ type: "ready" });
    }
    const experiment = await promise;
    const events = vi.fn();
    experiment.events.subscribe(events);

    mocks[1]!.simulate({ type: "error", message: "boom", itemId: null });

    expect(experiment.status.get()).toBe("Error");
    expect(events).toHaveBeenCalledWith({
      type: "error",
      message: "boom",
      itemId: null,
    });
    expect(mocks[0]!.isTerminated()).toBe(true);
  });

  it("forwards start to every shard", async () => {
    const { promise, mocks } = createShardedExperiment({
      runCount: 4,
      shardCount: 2,
    });
    await flushMicrotasks();
    for (const mock of mocks) {
      mock.simulate({ type: "ready" });
    }
    const experiment = await promise;

    experiment.start();

    for (const mock of mocks) {
      expect(mock.sent.some((message) => message.type === "start")).toBe(true);
    }
    expect(experiment.status.get()).toBe("Running");

    experiment.dispose();
  });
});

describe("createMonteCarloExperiment", () => {
  it("sends init and resolves when the worker reports ready", async () => {
    const mock = makeMockTransport();
    const promise = createExperimentWithMockTransport(mock);

    expect(mock.sent[0]).toMatchObject({
      type: "init",
      seed: 1,
      dt: 1,
      maxTime: 10,
      runCount: 1,
    });

    mock.simulate({ type: "ready" });

    const experiment = await promise;
    expect(experiment.status.get()).toBe("Ready");

    experiment.dispose();
  });

  it("updates progress and emits completion", async () => {
    const mock = makeMockTransport();
    const promise = createExperimentWithMockTransport(mock);
    mock.simulate({ type: "ready" });
    const experiment = await promise;

    const statusUpdates: string[] = [];
    const events = vi.fn();
    experiment.status.subscribe((status) => statusUpdates.push(status));
    experiment.events.subscribe(events);

    mock.simulate({ type: "progress", progress: makeProgress() });

    expect(experiment.progress.get()).toMatchObject({
      frameNumber: 1,
      time: 1,
    });

    const completeProgress = makeProgress({
      activeRuns: 0,
      allFinished: true,
      completedRuns: 1,
      frameNumber: 10,
      time: 10,
    });
    mock.simulate({ type: "complete", progress: completeProgress });

    expect(experiment.status.get()).toBe("Complete");
    expect(statusUpdates).toContain("Complete");
    expect(events).toHaveBeenCalledWith({
      type: "complete",
      progress: completeProgress,
    });

    experiment.dispose();
  });

  it("sends metric specs to the worker and appends metric frames", async () => {
    const mock = makeMockTransport();
    const metricSpecs = [
      {
        id: "constant",
        label: "Constant",
        kind: "expression",
        code: "return 1;",
        artifact: metricArtifact("return 1;"),
      },
    ] as const;
    const promise = createMonteCarloExperiment({
      transport: mock.transport,
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 1,
      maxTime: 10,
      runCount: 1,
      metricSpecs,
    });

    expect(mock.sent[0]).toMatchObject({
      type: "init",
      metricSpecs,
    });

    mock.simulate({ type: "ready" });
    const experiment = await promise;
    const firstFrame = makeMetricFrame(0);
    const secondFrame = makeMetricFrame(1);
    mock.simulate({
      type: "metricFrames",
      frames: [firstFrame, secondFrame],
    });

    expect(experiment.metrics.get()).toEqual({
      frames: [firstFrame, secondFrame],
      latestByMetricId: {
        constant: secondFrame,
      },
    });

    experiment.dispose();
  });

  it("runs locally when user-defined metrics are provided", async () => {
    const experiment = await createMonteCarloExperiment({
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 1,
      maxTime: 2,
      runCount: 2,
      metrics: [
        {
          id: "frame-number",
          label: "Frame number",
          sampleRuns: "all",
          aggregateRuns: "mean",
          aggregateTime: "mean",
          measure: ({ frame }) => frame.number,
        },
      ],
    });

    expect(experiment.status.get()).toBe("Ready");
    expect(experiment.metrics.get().latestByMetricId["frame-number"]).toEqual(
      expect.objectContaining({
        value: 0,
        frameValue: 0,
        timeValue: 0,
        runSampleCount: 2,
      }),
    );

    const complete = new Promise<void>((resolve) => {
      experiment.events.subscribe((event) => {
        if (event.type === "complete") {
          resolve();
        }
      });
    });

    experiment.start();
    await complete;

    expect(experiment.status.get()).toBe("Complete");
    expect(experiment.metrics.get().latestByMetricId["frame-number"]).toEqual(
      expect.objectContaining({
        frameNumber: 1,
        value: 0.5,
        frameValue: 1,
        timeValue: 0.5,
        runSampleCount: 2,
        timeSampleCount: 2,
      }),
    );
  });

  it("compiles experiment metric specs into local metrics", async () => {
    const experiment = await createMonteCarloExperiment({
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 1,
      maxTime: 1,
      runCount: 2,
      metricSpecs: [
        {
          id: "constant",
          label: "Constant",
          kind: "expression",
          code: "return 1;",
          artifact: metricArtifact("return 1;"),
          sampleRuns: "all",
          aggregateRuns: "mean",
          aggregateTime: "none",
        },
      ],
    });

    expect(experiment.metrics.get().latestByMetricId.constant).toEqual(
      expect.objectContaining({
        value: 1,
        frameValue: 1,
        runSampleCount: 2,
      }),
    );
  });

  it("keeps per-frame distributions for sampled metric values", async () => {
    const experiment = await createMonteCarloExperiment({
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 1,
      maxTime: 1,
      runCount: 2,
      metricSpecs: [
        {
          id: "constant-distribution",
          label: "Constant distribution",
          kind: "expression",
          code: "return 1;",
          artifact: metricArtifact("return 1;"),
          sampleRuns: "all",
          runOutput: { type: "distribution" },
        },
      ],
    });

    expect(
      experiment.metrics.get().latestByMetricId["constant-distribution"],
    ).toEqual(
      expect.objectContaining({
        outputType: "distribution",
        bins: [[1, 2]],
        runSampleCount: 2,
        value: null,
      }),
    );
  });

  it("can aggregate over time before keeping a run distribution", async () => {
    const experiment = await createMonteCarloExperiment({
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 1,
      maxTime: 2,
      runCount: 2,
      metrics: [
        {
          id: "time-distribution",
          label: "Time distribution",
          sampleRuns: "all",
          runOutput: { type: "distribution" },
          aggregateTime: "mean",
          measure: ({ frame, runIndex }) => runIndex + frame.number,
        },
      ],
    });

    const complete = new Promise<void>((resolve) => {
      experiment.events.subscribe((event) => {
        if (event.type === "complete") {
          resolve();
        }
      });
    });

    experiment.start();
    await complete;

    expect(
      experiment.metrics.get().latestByMetricId["time-distribution"],
    ).toEqual(
      expect.objectContaining({
        outputType: "distribution",
        bins: [
          [0.5, 1],
          [1.5, 1],
        ],
        frameNumber: 1,
        runSampleCount: 2,
        timeSampleCount: 2,
        value: null,
      }),
    );
  });

  it("forwards start and cancel messages over the transport", async () => {
    const mock = makeMockTransport();
    const promise = createExperimentWithMockTransport(mock);
    mock.simulate({ type: "ready" });
    const experiment = await promise;

    experiment.start();
    experiment.cancel();

    expect(mock.sent.map((message) => message.type)).toEqual([
      "init",
      "start",
      "cancel",
    ]);

    experiment.dispose();
  });

  it("emits cancelled and tears down idempotently", async () => {
    const mock = makeMockTransport();
    const promise = createExperimentWithMockTransport(mock);
    mock.simulate({ type: "ready" });
    const experiment = await promise;

    const events = vi.fn();
    experiment.events.subscribe(events);
    const progress = makeProgress({ advancedRuns: 0 });

    mock.simulate({ type: "cancelled", progress });
    expect(experiment.status.get()).toBe("Cancelled");
    expect(events).toHaveBeenCalledWith({ type: "cancelled", progress });

    experiment.dispose();
    experiment.dispose();
    expect(mock.isTerminated()).toBe(true);
  });

  it("rejects when the worker reports an initialization error", async () => {
    const mock = makeMockTransport();
    const promise = createExperimentWithMockTransport(mock);

    mock.simulate({ type: "error", message: "boom", itemId: "transition-a" });

    await expect(promise).rejects.toThrow("boom");
    expect(mock.isTerminated()).toBe(true);
  });

  it("emits errors reported after initialization", async () => {
    const mock = makeMockTransport();
    const promise = createExperimentWithMockTransport(mock);
    mock.simulate({ type: "ready" });
    const experiment = await promise;

    const events = vi.fn();
    experiment.events.subscribe(events);

    mock.simulate({ type: "error", message: "late boom", itemId: null });

    expect(experiment.status.get()).toBe("Error");
    expect(events).toHaveBeenCalledWith({
      type: "error",
      message: "late boom",
      itemId: null,
    });

    experiment.dispose();
  });
});
