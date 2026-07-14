import { describe, expect, it, vi } from "vitest";

import { compileHirArtifacts } from "../../../hir/compile";
import { createMonteCarloExperiment } from "./experiment";

import type { HirMetricArtifact } from "../../../hir/instantiate";
import type { SDCPN } from "../../../types/sdcpn";
import type { SimulationTransport } from "../../api";
import type {
  MonteCarloUserDefinedMetricFrame,
  MonteCarloUserDefinedPredicateSnapshot,
} from "../metrics";
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
  returnType: "number" | "boolean" = "number",
): HirMetricArtifact {
  const { artifacts, failures } = compileHirArtifacts(
    {
      ...sdcpn,
      metrics: [{ id: "__test__", name: "test", code }],
    },
    undefined,
    { metricReturnTypes: { __test__: returnType } },
  );
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
  };
}

function makePredicateSnapshot(
  trueRunCount: number,
): MonteCarloUserDefinedPredicateSnapshot {
  return {
    predicateId: "done",
    label: "Done",
    frameNumber: 1,
    time: 1,
    runCount: 2,
    trueRunCount,
    runResults: [
      { runIndex: 0, value: true, trueAt: 0 },
      {
        runIndex: 1,
        value: trueRunCount === 2,
        trueAt: trueRunCount === 2 ? 1 : null,
      },
    ],
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

  it("sends predicate metric specs to the worker and stores predicate snapshots", async () => {
    const mock = makeMockTransport();
    const metricSpecs = [
      {
        id: "done",
        label: "Done",
        type: "Predicate",
        kind: "expression",
        code: "return true;",
        artifact: metricArtifact("return true;", empty(), "boolean"),
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
      runCount: 2,
      metricSpecs,
    });

    // Predicate specs travel in-band in `metricSpecs`; the worker splits them.
    expect(mock.sent[0]).toMatchObject({
      type: "init",
      metricSpecs,
    });

    mock.simulate({ type: "ready" });
    const experiment = await promise;
    const snapshot = makePredicateSnapshot(2);
    mock.simulate({
      type: "predicateSnapshots",
      snapshots: [snapshot],
    });

    expect(experiment.predicates.get()).toEqual({
      latestByPredicateId: {
        done: snapshot,
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

  it("checks local predicates until each run first becomes true", async () => {
    const callsByRunIndex = new Map<number, number[]>();
    const experiment = await createMonteCarloExperiment({
      sdcpn: empty(),
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 1,
      maxTime: 2,
      runCount: 2,
      metrics: [],
      predicates: [
        {
          id: "done",
          label: "Done",
          test: ({ frame, runIndex }) => {
            callsByRunIndex.set(runIndex, [
              ...(callsByRunIndex.get(runIndex) ?? []),
              frame.number,
            ]);

            return frame.number >= runIndex;
          },
        },
      ],
    });

    expect(experiment.predicates.get().latestByPredicateId.done).toEqual(
      expect.objectContaining({
        trueRunCount: 1,
        runResults: [
          { runIndex: 0, value: true, trueAt: 0 },
          { runIndex: 1, value: false, trueAt: null },
        ],
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

    expect(experiment.predicates.get().latestByPredicateId.done).toEqual(
      expect.objectContaining({
        trueRunCount: 2,
        runResults: [
          { runIndex: 0, value: true, trueAt: 0 },
          { runIndex: 1, value: true, trueAt: 1 },
        ],
      }),
    );
    expect(callsByRunIndex.get(0)).toEqual([0]);
    expect(callsByRunIndex.get(1)).toEqual([0, 1]);
  });

  it("evaluates compiled predicate artifacts against real frames", async () => {
    const sdcpn: SDCPN = {
      ...empty(),
      places: [
        {
          id: "place-done",
          name: "Done",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
    };
    const predicateSpec = (id: string, code: string) =>
      ({
        id,
        label: id,
        type: "Predicate",
        kind: "expression",
        code,
        artifact: metricArtifact(code, sdcpn, "boolean"),
      }) as const;

    const experiment = await createMonteCarloExperiment({
      sdcpn,
      initialMarking: { "place-done": 2 },
      parameterValues: {},
      seed: 1,
      dt: 1,
      maxTime: 1,
      runCount: 2,
      metricSpecs: [
        predicateSpec("has-tokens", "return state.places.Done.count > 0;"),
        predicateSpec("many-tokens", "return state.places.Done.count > 100;"),
      ],
    });

    const { latestByPredicateId } = experiment.predicates.get();
    expect(latestByPredicateId["has-tokens"]).toEqual(
      expect.objectContaining({
        trueRunCount: 2,
        runResults: [
          { runIndex: 0, value: true, trueAt: 0 },
          { runIndex: 1, value: true, trueAt: 0 },
        ],
      }),
    );
    expect(latestByPredicateId["many-tokens"]).toEqual(
      expect.objectContaining({ runCount: 2, trueRunCount: 0 }),
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
