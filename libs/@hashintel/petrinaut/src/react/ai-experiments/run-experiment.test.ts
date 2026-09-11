import { describe, expect, it, vi } from "vitest";

import {
  createReadableStore,
  DEFAULT_PETRINAUT_EXTENSIONS,
} from "@hashintel/petrinaut-core";

import { sweepCellObjective } from "../experiments/sweep-cell-objective";
import { prepareExperiment } from "./prepare-experiment";
import { runExperiment } from "./run-experiment";

import type {
  CreateExperimentOptions,
  ExperimentRecord,
  SweepVisitedCell,
} from "../experiments/context";
import type { OptimizationRecord } from "../optimizations/context";
import type { ExperimentHostDependencies } from "./run-experiment";
import type {
  MonteCarloUserDefinedMetricFrame,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type { PetrinautExperimentRequest } from "@hashintel/petrinaut-core/ai";

const makeDefinition = (): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  scenarios: [
    {
      id: "scenario",
      name: "Scenario",
      scenarioParameters: [
        { identifier: "rate", type: "real", default: 0.5 },
        { identifier: "count", type: "integer", default: 3 },
        { identifier: "enabled", type: "boolean", default: 0 },
      ],
      parameterOverrides: {},
      initialState: { type: "per_place", content: {} },
    },
  ],
  metrics: [{ id: "metric", name: "Metric", code: "return 1;" }],
});

const makeRequest = (optimize = false): PetrinautExperimentRequest => ({
  name: "Requested experiment",
  scenarioId: "scenario",
  scenarioParameterValues: {
    count: { mode: "fixed", value: 7 },
    ...(optimize ? { rate: { mode: "range" as const, min: 0, max: 1 } } : {}),
  },
  runCount: 25,
  seed: 1,
  dt: 1,
  maxTime: 10,
  metricIds: ["metric"],
  execution: optimize
    ? {
        mode: "optimize",
        objectiveMetricId: "metric",
        direction: "maximize",
        steps: 2,
        runsPerStep: 4,
      }
    : { mode: "simulate" },
});

const makeRecord = (optimize = false): ExperimentRecord => ({
  id: "experiment",
  name: "Requested experiment",
  createdAt: 0,
  scenarioId: "scenario",
  scenarioName: "Scenario",
  runCount: 25,
  seed: 1,
  dt: 1,
  maxTime: 10,
  status: optimize ? "idle" : "running",
  error: null,
  metricSpecs: [],
  computeBackend: "cpu",
  computeBackendFallbackReason: null,
  startedAt: 0,
  finishedAt: null,
  progress: {
    activeRuns: 25,
    advancedRuns: 0,
    allFinished: false,
    completedRuns: 0,
    erroredRuns: 0,
    frameNumber: 0,
    runCount: 25,
    time: 0,
  },
  metricFrames: [],
  latestMetricFramesById: {},
  sweepBatches: [],
  parameterAxes: optimize
    ? [{ identifier: "rate", min: 0, max: 1, integer: false, stepCount: 50 }]
    : [],
  sweep: optimize
    ? {
        selection: { rate: { from: 0, to: 50 } },
        runsCompleted: 0,
        runsSampled: 0,
        runTarget: null,
        computing: false,
        visited: [],
      }
    : null,
});

const makeStudy = (): OptimizationRecord => ({
  id: "optimization",
  input: prepareExperiment(makeRequest(true), makeDefinition(), "Net")
    .optimization!,
  createdAt: 0,
  origin: { kind: "sweep", experimentId: "experiment" },
  status: "running",
  error: null,
  errorCategory: null,
  errorDiagnostics: null,
  runId: "run",
  lastSeq: 0,
  connectionState: null,
  requestedTrials: 2,
  completedTrials: 0,
  prunedTrials: 0,
  failedTrials: 0,
  trials: [],
  best: null,
  importance: null,
  computeBackend: "cpu",
  axes: [],
  connected: null,
});

const createHarness = (optimize = false) => {
  const experiments = createReadableStore<readonly ExperimentRecord[]>([]);
  const optimizations = createReadableStore<readonly OptimizationRecord[]>([]);
  const record = makeRecord(optimize);
  const study = makeStudy();
  const refinement = Promise.withResolvers<SweepVisitedCell | null>();
  let released = false;
  let createOptions: CreateExperimentOptions | undefined;
  const actions: ExperimentHostDependencies["actions"] = {
    createExperiment: vi.fn<
      ExperimentHostDependencies["actions"]["createExperiment"]
    >(async (_input, options) => {
      createOptions = options;
      void options?.ownership?.finished.then(() => {
        released = true;
      });
      experiments.set([record]);
      return record.id;
    }),
    createOptimization: vi.fn(async () => {
      optimizations.set([study]);
      return study.id;
    }),
    cancelExperiment: vi.fn(() => {
      refinement.resolve(null);
    }),
    cancelOptimization: vi.fn(),
    navigateSweep: vi.fn(() => refinement.promise),
  };
  const dependencies: ExperimentHostDependencies = {
    definition: makeDefinition(),
    extensions: DEFAULT_PETRINAUT_EXTENSIONS,
    title: "Net",
    validate: vi.fn(async () => {}),
    experiments,
    optimizations,
    actions,
  };
  return {
    dependencies,
    experiments,
    optimizations,
    actions,
    record,
    study,
    refinement,
    get released() {
      return released;
    },
    get createOptions() {
      return createOptions;
    },
  };
};

const completeSearch = (harness: ReturnType<typeof createHarness>) => {
  harness.optimizations.set([
    {
      ...harness.study,
      status: "complete",
      completedTrials: 2,
      best: { trial: 1, parameters: { rate: 0.251 }, objective: 7 },
    },
  ]);
};

describe("runExperiment", () => {
  it("coalesces progress outside store publication and ignores unchanged values", async () => {
    const harness = createHarness();
    const onProgress = vi.fn();
    const pending = runExperiment(harness.dependencies, makeRequest(), {
      onProgress,
    });
    await vi.waitFor(() => expect(onProgress).toHaveBeenCalledOnce());
    onProgress.mockClear();

    for (const completedRuns of [1, 2, 3]) {
      harness.experiments.set([
        {
          ...harness.record,
          progress: { ...harness.record.progress!, completedRuns },
        },
      ]);
    }
    expect(onProgress).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ phase: "running", runsCompleted: 3 }),
    );

    harness.experiments.set([...harness.experiments.get()]);
    await Promise.resolve();
    expect(onProgress).toHaveBeenCalledOnce();

    harness.experiments.set([{ ...harness.record, status: "complete" }]);
    await pending;
    const callsAtCompletion = onProgress.mock.calls.length;
    harness.experiments.set([harness.record]);
    await Promise.resolve();
    expect(onProgress).toHaveBeenCalledTimes(callsAtCompletion);
  });

  it("publishes optimization phase changes even when no runs have completed", async () => {
    const harness = createHarness(true);
    const onProgress = vi.fn();
    const pending = runExperiment(harness.dependencies, makeRequest(true), {
      onProgress,
    });
    await vi.waitFor(() =>
      expect(harness.actions.createOptimization).toHaveBeenCalledOnce(),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "optimizing", runsCompleted: 0 }),
    );
    completeSearch(harness);
    await vi.waitFor(() =>
      expect(harness.actions.navigateSweep).toHaveBeenCalledOnce(),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "refining", runsCompleted: 0 }),
    );
    harness.refinement.resolve(null);
    await pending;
  });

  it("captures the final distribution mean and releases its controls after completion", async () => {
    const harness = createHarness();
    const onProgress = vi.fn();
    const pending = runExperiment(harness.dependencies, makeRequest(), {
      onProgress,
    });
    await vi.waitFor(() =>
      expect(harness.actions.createExperiment).toHaveBeenCalledOnce(),
    );
    expect(harness.released).toBe(false);
    const frame: MonteCarloUserDefinedMetricFrame = {
      metricId: "metric",
      label: "Metric",
      outputType: "distribution",
      frameNumber: 10,
      time: 10,
      bins: [
        [1, 5],
        [6, 20],
      ],
      value: null,
      frameValue: null,
      timeValue: null,
      runSampleCount: 25,
      timeSampleCount: 25,
    };
    harness.experiments.set([
      {
        ...harness.record,
        status: "complete",
        progress: {
          ...harness.record.progress!,
          activeRuns: 0,
          completedRuns: 25,
          allFinished: true,
        },
        metricFrames: [frame],
      },
    ]);
    const result = await pending;
    frame.bins = [[100, 25]];
    expect(result).toMatchObject({
      status: "complete",
      experimentId: "experiment",
      runsCompleted: 25,
      metrics: [{ id: "metric", value: 5 }],
    });
    expect(harness.released).toBe(true);
    expect(harness.createOptions?.select).toBe(false);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ experimentId: "experiment", phase: "running" }),
    );
  });

  it("keeps the validated snapshot and fixed parameters while the editor changes", async () => {
    const harness = createHarness(true);
    const validation = Promise.withResolvers<void>();
    harness.dependencies.validate = vi.fn(() => validation.promise);
    const pending = runExperiment(harness.dependencies, makeRequest(true));
    harness.dependencies.definition.scenarios![0]!.scenarioParameters[1]!.default = 99;
    harness.dependencies.definition.metrics![0]!.code = "return 99;";
    validation.resolve();
    await vi.waitFor(() =>
      expect(harness.actions.createOptimization).toHaveBeenCalledOnce(),
    );
    expect(harness.createOptions?.definition?.metrics?.[0]?.code).toBe(
      "return 1;",
    );
    const [optimizationInput, options] =
      vi.mocked(harness.actions.createOptimization).mock.calls[0] ?? [];
    expect(optimizationInput).toMatchObject({
      scenario: {
        parameterBindings: {
          count: { kind: "fixed", value: 7 },
          enabled: { kind: "fixed", value: false },
        },
      },
      execution: { seedsPerTrial: 4 },
    });
    expect(options).toMatchObject({
      sweep: { runCap: 4, refineOnSettle: false },
    });
    harness.createOptions?.ownership?.cancel();
    expect((await pending).status).toBe("cancelled");
  });

  it("waits for the refined distribution and returns its mean at the quantized point", async () => {
    const harness = createHarness(true);
    const pending = runExperiment(harness.dependencies, makeRequest(true));
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.waitFor(() =>
      expect(harness.actions.createOptimization).toHaveBeenCalledOnce(),
    );
    completeSearch(harness);
    await vi.waitFor(() =>
      expect(harness.actions.navigateSweep).toHaveBeenCalledOnce(),
    );
    expect(settled).toBe(false);
    expect(harness.released).toBe(false);
    const refinedFrame: MonteCarloUserDefinedMetricFrame = {
      metricId: "metric",
      label: "Metric",
      outputType: "distribution",
      frameNumber: 10,
      time: 10,
      bins: [
        [4, 5],
        [9, 20],
      ],
      value: null,
      frameValue: null,
      timeValue: null,
      runSampleCount: 25,
      timeSampleCount: 25,
    };
    harness.experiments.set([
      { ...harness.record, metricFrames: [refinedFrame] },
    ]);
    harness.refinement.resolve({
      position: { rate: 13 },
      runsCompleted: 25,
      means: { metric: sweepCellObjective([refinedFrame], "metric")! },
    });
    expect(harness.experiments.get()[0]?.metricFrames).toEqual([refinedFrame]);
    expect(await pending).toMatchObject({
      status: "complete",
      runsCompleted: 25,
      metrics: [{ id: "metric", value: 8 }],
      optimization: {
        parameters: { rate: 0.26, count: 7, enabled: false },
        objectiveValue: 8,
        stepsCompleted: 2,
      },
    });
    expect(harness.released).toBe(true);
  });

  it("cancels both the optimizer and final refinement without returning success", async () => {
    const harness = createHarness(true);
    const controller = new AbortController();
    const pending = runExperiment(harness.dependencies, makeRequest(true), {
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(harness.actions.createOptimization).toHaveBeenCalledOnce(),
    );
    completeSearch(harness);
    await vi.waitFor(() =>
      expect(harness.actions.navigateSweep).toHaveBeenCalledOnce(),
    );
    controller.abort();
    expect(await pending).toMatchObject({ status: "cancelled", metrics: [] });
    expect(harness.actions.cancelOptimization).toHaveBeenCalledWith(
      "optimization",
    );
    expect(harness.actions.cancelExperiment).toHaveBeenCalledWith("experiment");
    expect(harness.released).toBe(true);
  });

  it("does not create an experiment after snapshot validation fails", async () => {
    const harness = createHarness();
    harness.dependencies.validate = vi.fn(async () => {
      throw new Error("Transition lambda must return a number");
    });
    expect(
      await runExperiment(harness.dependencies, makeRequest()),
    ).toMatchObject({
      status: "error",
      experimentId: null,
      message: "Transition lambda must return a number",
    });
    expect(harness.actions.createExperiment).not.toHaveBeenCalled();
  });

  it("returns the metric compile error when no optimization trial produces a value", async () => {
    const harness = createHarness(true);
    const pending = runExperiment(harness.dependencies, makeRequest(true));
    await vi.waitFor(() =>
      expect(harness.actions.createOptimization).toHaveBeenCalledOnce(),
    );
    harness.createOptions?.ownership?.onError?.(
      'Metric "Metric" did not compile: Cannot find name "missingValue"',
    );
    harness.optimizations.set([
      { ...harness.study, status: "complete", prunedTrials: 2 },
    ]);
    expect(await pending).toMatchObject({
      status: "error",
      message:
        'Metric "Metric" did not compile: Cannot find name "missingValue"',
    });
  });

  it("returns a final refinement error before React has published the failed record", async () => {
    const harness = createHarness(true);
    const pending = runExperiment(harness.dependencies, makeRequest(true));
    await vi.waitFor(() =>
      expect(harness.actions.createOptimization).toHaveBeenCalledOnce(),
    );
    completeSearch(harness);
    await vi.waitFor(() =>
      expect(harness.actions.navigateSweep).toHaveBeenCalledOnce(),
    );
    harness.createOptions?.ownership?.onError?.("1 of 17 runs failed");
    harness.refinement.resolve(null);
    expect(await pending).toMatchObject({
      status: "error",
      message: "1 of 17 runs failed",
      metrics: [],
    });
  });

  it("settles cancellation while validation is still pending", async () => {
    const harness = createHarness();
    const controller = new AbortController();
    const validation = Promise.withResolvers<void>();
    harness.dependencies.validate = () => validation.promise;
    const pending = runExperiment(harness.dependencies, makeRequest(), {
      signal: controller.signal,
    });
    controller.abort();
    expect(await pending).toMatchObject({
      status: "cancelled",
      experimentId: null,
    });
    validation.resolve();
    expect(harness.actions.createExperiment).not.toHaveBeenCalled();
  });

  it.each<Partial<PetrinautExperimentRequest>>([
    { scenarioId: "missing" },
    { metricIds: ["missing"] },
    {
      scenarioParameterValues: {
        missing: { mode: "fixed" as const, value: 1 },
      },
    },
    {
      scenarioParameterValues: {
        count: { mode: "fixed" as const, value: 1.5 },
      },
    },
    {
      scenarioParameterValues: {
        enabled: { mode: "fixed" as const, value: 1 },
      },
    },
  ])("rejects invalid references and typed parameters: %j", async (patch) => {
    const harness = createHarness();
    expect(
      (
        await runExperiment(harness.dependencies, {
          ...makeRequest(),
          ...patch,
        })
      ).status,
    ).toBe("error");
    expect(harness.actions.createExperiment).not.toHaveBeenCalled();
  });
});
