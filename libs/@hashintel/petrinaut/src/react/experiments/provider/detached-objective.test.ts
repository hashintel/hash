import { describe, expect, it, vi } from "vitest";

import { sirModel } from "@hashintel/petrinaut-core/examples";
import { WORKER_POOL_BACKEND_ID } from "@hashintel/petrinaut-core/experiments";
import {
  compileHirArtifacts,
  lowerScenarioToHir,
} from "@hashintel/petrinaut-core/hir";

import { createDetachedObjectiveSampler } from "./detached-objective";
import { createWritableStore } from "./detached-objective/writable-store";

import type { LanguageClientContextValue } from "../../lsp/context";
import type { DetachedObjectiveRunRequest } from "../context";
import type { experimentBackendRegistrations } from "./create-experiment";
import type {
  MonteCarloExperiment,
  MonteCarloExperimentEvent,
  MonteCarloExperimentMetrics,
  MonteCarloExperimentState,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloWorkerProgress,
} from "@hashintel/petrinaut-core";
import type {
  ExperimentAssessment,
  ExperimentBackend,
  ExperimentRequest,
  ReusableWorkerFactory,
} from "@hashintel/petrinaut-core/experiments";

const scenario = sirModel.petriNetDefinition.scenarios?.find(
  (candidate) => candidate.id === "scenario__seasonal_flu",
);
const metric = sirModel.petriNetDefinition.metrics?.find(
  (candidate) => candidate.id === "metric__infected_fraction",
);
if (!scenario || !metric) {
  throw new Error("The SIR fixtures are incomplete");
}
const definition = {
  ...sirModel.petriNetDefinition,
  scenarios: [scenario],
  metrics: [metric],
};

const runRequest = (
  overrides: Partial<DetachedObjectiveRunRequest> = {},
): DetachedObjectiveRunRequest => ({
  cacheKey: "study",
  definition,
  scenarioId: scenario.id,
  scenarioParameterValues: { population: 1_000, infected_ratio: 0.05 },
  metric: { id: metric.id, label: metric.name, code: metric.code },
  seed: 7,
  runCount: 3,
  runSeeds: [7, 11, 13],
  dt: 1,
  maxTime: 180,
  computeBackend: "cpu",
  ...overrides,
});

const progressOf = (
  completedRuns: number,
  erroredRuns = 0,
): MonteCarloWorkerProgress => ({
  activeRuns: 0,
  advancedRuns: completedRuns,
  allFinished: completedRuns + erroredRuns >= 3,
  completedRuns,
  erroredRuns,
  frameNumber: 180,
  runCount: 3,
  time: 180,
});

const frameOf = (value: number): MonteCarloUserDefinedMetricFrame => ({
  metricId: metric.id,
  label: metric.name,
  outputType: "distribution",
  frameNumber: 1,
  time: 1,
  bins: [[value, 3]],
  value: null,
  frameValue: null,
  timeValue: null,
  runSampleCount: 3,
  timeSampleCount: 0,
});

type FakeHandle = {
  handle: MonteCarloExperiment;
  metrics: ReturnType<typeof createWritableStore<MonteCarloExperimentMetrics>>;
  progress: ReturnType<
    typeof createWritableStore<MonteCarloWorkerProgress | null>
  >;
  runResults: ReturnType<
    typeof createWritableStore<
      ReadonlyMap<number, Readonly<Record<string, number>>>
    >
  >;
  emit: (event: MonteCarloExperimentEvent) => void;
};

const createFakeHandle = (): FakeHandle => {
  const status = createWritableStore<MonteCarloExperimentState>("Ready");
  const progress = createWritableStore<MonteCarloWorkerProgress | null>(null);
  const metrics = createWritableStore<MonteCarloExperimentMetrics>({
    frames: [],
    latestByMetricId: {},
  });
  const runResults = createWritableStore<
    ReadonlyMap<number, Readonly<Record<string, number>>>
  >(new Map());
  const listeners = new Set<(event: MonteCarloExperimentEvent) => void>();
  const emit = (event: MonteCarloExperimentEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  };
  const handle: MonteCarloExperiment = {
    status,
    progress,
    metrics,
    runResults,
    events: {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    start: vi.fn(),
    cancel: vi.fn(() => {
      emit({ type: "cancelled", progress: progress.get() });
    }),
    dispose: vi.fn(),
  };
  return { handle, metrics, progress, runResults, emit };
};

type FakeBackend = {
  backend: ExperimentBackend;
  requests: ExperimentRequest[];
  handles: FakeHandle[];
};

const createFakeBackend = (
  id: string,
  options: {
    refuse?: string;
    /** Index of the first request refused; earlier ones are accepted. */
    refuseFrom?: number;
    needsHirTrees?: boolean;
  } = {},
): FakeBackend => {
  const requests: ExperimentRequest[] = [];
  const handles: FakeHandle[] = [];
  const backend: ExperimentBackend = {
    id,
    label: id,
    needsHirTrees: options.needsHirTrees ?? false,
    isAvailable: () => true,
    assess: (request) => {
      const requestIndex = requests.length;
      requests.push(request);
      const assessment: ExperimentAssessment =
        options.refuse === undefined || requestIndex < (options.refuseFrom ?? 0)
          ? {
              eligible: true,
              notes: [],
              instantiate: () => {
                const fake = createFakeHandle();
                handles.push(fake);
                return Promise.resolve({ ok: true, handle: fake.handle });
              },
            }
          : {
              eligible: false,
              blockers: [
                { code: "refused", message: options.refuse, origin: "model" },
              ],
            };
      return Promise.resolve(assessment);
    },
    dispose: vi.fn(),
  };
  return { backend, requests, handles };
};

/** Compiles inline what the language worker compiles in the app. */
const languageClient: Pick<
  LanguageClientContextValue,
  "requestHirArtifacts" | "requestScenarioHir"
> = {
  requestHirArtifacts: (sdcpn, extensions, options) =>
    Promise.resolve(compileHirArtifacts(sdcpn, extensions, options)),
  requestScenarioHir: (candidate, adHocContext) =>
    Promise.resolve(lowerScenarioToHir(candidate, { adHocContext })),
};

const unusedWorkerFactory = Object.assign(
  () => Promise.reject(new Error("The fake backends lease no workers")),
  { drain: () => {}, dispose: () => {} },
) as ReusableWorkerFactory;

const createSampler = (backends: { cpu: FakeBackend; gpu?: FakeBackend }) => {
  const registrations = vi.fn(
    ({
      computeBackend,
    }: Parameters<typeof experimentBackendRegistrations>[0]) => [
      ...(computeBackend === "webgpu" && backends.gpu
        ? [
            {
              id: "webgpu",
              label: "GPU",
              load: () => Promise.resolve(backends.gpu!.backend),
            },
          ]
        : []),
      {
        id: WORKER_POOL_BACKEND_ID,
        label: "CPU",
        load: () => Promise.resolve(backends.cpu.backend),
      },
    ],
  );
  const sampler = createDetachedObjectiveSampler({
    languageClient: { current: languageClient },
    createWorker: unusedWorkerFactory,
    shardCount: 6,
    backendRegistrations: registrations,
  });
  return { sampler, registrations };
};

const completeWith = (fake: FakeHandle, value: number) => {
  fake.metrics.set({
    frames: [frameOf(value)],
    latestByMetricId: { [metric.id]: frameOf(value) },
  });
  fake.runResults.set(
    new Map([
      [0, { [metric.id]: value }],
      [1, { [metric.id]: value }],
      [2, { [metric.id]: value }],
    ]),
  );
  fake.emit({ type: "complete", progress: progressOf(3) });
};

describe("createDetachedObjectiveSampler().run", () => {
  it("streams frames and progress, then settles the result with the seeds pinned on the CPU pool", async () => {
    const cpu = createFakeBackend(WORKER_POOL_BACKEND_ID);
    const { sampler } = createSampler({ cpu });

    const run = sampler.run(runRequest());
    await vi.waitFor(() => expect(cpu.handles).toHaveLength(1));
    const fake = cpu.handles[0]!;
    expect(fake.handle.start).toHaveBeenCalledOnce();
    expect(cpu.requests[0]).toMatchObject({
      seed: 7,
      runCount: 3,
      runs: [{ seed: 7 }, { seed: 11 }, { seed: 13 }],
      metricSpecs: [
        {
          kind: "expression",
          id: metric.id,
          sampleRuns: "all",
          runOutput: { type: "distribution" },
        },
      ],
    });

    fake.progress.set(progressOf(1));
    fake.metrics.set({
      frames: [frameOf(0.2)],
      latestByMetricId: { [metric.id]: frameOf(0.2) },
    });
    await vi.waitFor(() => expect(run.frames.get()).toEqual([frameOf(0.2)]));
    expect(run.progress.get()).toEqual(progressOf(1));

    completeWith(fake, 0.25);
    const outcome = await run.completion;
    expect(outcome).toMatchObject({
      ok: true,
      runsCompleted: 3,
      metricFrames: [frameOf(0.25)],
      computeBackend: "cpu",
      computeBackendFallbackReason: null,
    });
    expect(outcome.ok && outcome.runResults.get(2)).toEqual({
      [metric.id]: 0.25,
    });
    expect(run.frames.get()).toEqual([frameOf(0.25)]);
    expect(run.progress.get()).toEqual(progressOf(3));
    expect(fake.handle.dispose).toHaveBeenCalled();
  });

  it("names why a batch failed: errored runs, a terminal error, every backend refusing, a study that does not compile", async () => {
    const cpu = createFakeBackend(WORKER_POOL_BACKEND_ID);
    const { sampler } = createSampler({ cpu });

    const errored = sampler.run(runRequest());
    await vi.waitFor(() => expect(cpu.handles).toHaveLength(1));
    cpu.handles[0]!.emit({ type: "complete", progress: progressOf(2, 1) });
    await expect(errored.completion).resolves.toEqual({
      ok: false,
      cancelled: false,
      reason: "1 of 3 runs failed",
    });

    const crashed = sampler.run(runRequest());
    await vi.waitFor(() => expect(cpu.handles).toHaveLength(2));
    cpu.handles[1]!.emit({
      type: "error",
      message: "worker crashed",
      itemId: null,
    });
    await expect(crashed.completion).resolves.toEqual({
      ok: false,
      cancelled: false,
      reason: "worker crashed",
    });

    const refusing = createFakeBackend(WORKER_POOL_BACKEND_ID, {
      refuse: "no",
    });
    const refused = createSampler({ cpu: refusing }).sampler.run(runRequest());
    await expect(refused.completion).resolves.toEqual({
      ok: false,
      cancelled: false,
      reason: "cpu: no",
    });
    expect(refusing.handles).toHaveLength(0);

    const uncompilable = sampler.run(
      runRequest({ cacheKey: "missing-scenario", scenarioId: "missing" }),
    );
    await expect(uncompilable.completion).resolves.toEqual({
      ok: false,
      cancelled: false,
      reason: "Scenario missing is not in the model snapshot",
    });

    const broken = sampler.run(
      runRequest({
        cacheKey: "broken-metric",
        definition: {
          ...definition,
          metrics: [{ ...metric, code: "return (" }],
        },
      }),
    );
    const outcome = await broken.completion;
    expect(outcome).toMatchObject({ ok: false, cancelled: false });
    expect(outcome.ok ? "" : outcome.reason).toMatch(
      new RegExp(`^${metric.id}: .+`),
    );
    expect(cpu.handles).toHaveLength(2);
  });

  it("names why the scenario does not compile at a point", async () => {
    const cpu = createFakeBackend(WORKER_POOL_BACKEND_ID);
    const { sampler } = createSampler({ cpu });

    const run = sampler.run(
      runRequest({
        scenarioParameterValues: {
          population: Number.NaN,
          infected_ratio: 0.05,
        },
      }),
    );
    const outcome = await run.completion;
    expect(outcome).toMatchObject({ ok: false, cancelled: false });
    expect(outcome.ok ? "" : outcome.reason).toMatch(
      /^Scenario parameter "population" must be a finite number\./,
    );
    expect(cpu.requests).toHaveLength(0);
  });

  it("names the kept backend when it refuses a later batch", async () => {
    const cpu = createFakeBackend(WORKER_POOL_BACKEND_ID, {
      refuse: "pool drained",
      refuseFrom: 1,
    });
    const { sampler } = createSampler({ cpu });

    const first = sampler.run(runRequest());
    await vi.waitFor(() => expect(cpu.handles).toHaveLength(1));
    completeWith(cpu.handles[0]!, 0.1);
    await expect(first.completion).resolves.toMatchObject({ ok: true });

    const second = sampler.run(runRequest({ seed: 8, runSeeds: [8, 9, 10] }));
    await expect(second.completion).resolves.toEqual({
      ok: false,
      cancelled: false,
      reason: "cpu: pool drained",
    });
    expect(cpu.requests).toHaveLength(2);
    expect(cpu.handles).toHaveLength(1);
  });

  it("passes no pinned seeds to the GPU and records where the batch ran", async () => {
    const cpu = createFakeBackend(WORKER_POOL_BACKEND_ID);
    const gpu = createFakeBackend("webgpu", { needsHirTrees: true });
    const { sampler } = createSampler({ cpu, gpu });

    const run = sampler.run(runRequest({ computeBackend: "webgpu" }));
    await vi.waitFor(() => expect(gpu.handles).toHaveLength(1));
    expect(gpu.requests[0]?.runs).toBeUndefined();
    expect(gpu.requests[0]?.seed).toBe(7);
    expect(gpu.requests[0]?.hirArtifacts).toBeDefined();
    expect(cpu.requests).toHaveLength(0);

    completeWith(gpu.handles[0]!, 0.1);
    await expect(run.completion).resolves.toMatchObject({
      computeBackend: "webgpu",
      computeBackendFallbackReason: null,
    });
  });

  it("pins the seeds after all when a GPU request falls back to the CPU pool", async () => {
    const cpu = createFakeBackend(WORKER_POOL_BACKEND_ID);
    const gpu = createFakeBackend("webgpu", { refuse: "unsupported net" });
    const { sampler } = createSampler({ cpu, gpu });

    const run = sampler.run(runRequest({ computeBackend: "webgpu" }));
    await vi.waitFor(() => expect(cpu.handles).toHaveLength(2));
    // The walk's request carried no seeds (the GPU would have refused them);
    // the handle it produced is replaced by one that pins them.
    expect(cpu.requests[0]?.runs).toBeUndefined();
    expect(cpu.requests[1]?.runs).toEqual([
      { seed: 7 },
      { seed: 11 },
      { seed: 13 },
    ]);
    expect(cpu.handles[0]!.handle.dispose).toHaveBeenCalled();
    expect(cpu.handles[0]!.handle.start).not.toHaveBeenCalled();

    completeWith(cpu.handles[1]!, 0.3);
    await expect(run.completion).resolves.toMatchObject({
      computeBackend: "cpu",
      computeBackendFallbackReason: "unsupported net",
    });
  });

  it("walks the registrations once per study and backend, reusing the chosen backend", async () => {
    const cpu = createFakeBackend(WORKER_POOL_BACKEND_ID);
    const { sampler, registrations } = createSampler({ cpu });

    const first = sampler.run(runRequest());
    await vi.waitFor(() => expect(cpu.handles).toHaveLength(1));
    completeWith(cpu.handles[0]!, 0.1);
    await first.completion;

    const second = sampler.run(runRequest({ seed: 8, runSeeds: [8, 9, 10] }));
    await vi.waitFor(() => expect(cpu.handles).toHaveLength(2));
    expect(cpu.requests[1]?.runs).toEqual([
      { seed: 8 },
      { seed: 9 },
      { seed: 10 },
    ]);
    completeWith(cpu.handles[1]!, 0.1);
    await second.completion;
    expect(registrations).toHaveBeenCalledOnce();
    expect(registrations).toHaveBeenCalledWith(
      expect.objectContaining({ computeBackend: "cpu", shardCount: 2 }),
    );
  });

  it("queues one study's runs in order and runs studies side by side", async () => {
    const cpu = createFakeBackend(WORKER_POOL_BACKEND_ID);
    const { sampler } = createSampler({ cpu });

    const firstOfA = sampler.run(runRequest({ cacheKey: "a" }));
    const secondOfA = sampler.run(runRequest({ cacheKey: "a" }));
    const onlyOfB = sampler.run(runRequest({ cacheKey: "b" }));
    await vi.waitFor(() => expect(cpu.handles).toHaveLength(2));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(cpu.handles).toHaveLength(2);

    completeWith(cpu.handles[0]!, 0.1);
    completeWith(cpu.handles[1]!, 0.2);
    await Promise.all([firstOfA.completion, onlyOfB.completion]);
    await vi.waitFor(() => expect(cpu.handles).toHaveLength(3));
    completeWith(cpu.handles[2]!, 0.3);
    await expect(secondOfA.completion).resolves.toMatchObject({
      metricFrames: [frameOf(0.3)],
    });
  });

  it("settles as cancelled on cancel, whether the batch is running or still queued", async () => {
    const cpu = createFakeBackend(WORKER_POOL_BACKEND_ID);
    const { sampler } = createSampler({ cpu });

    const running = sampler.run(runRequest());
    const queued = sampler.run(runRequest());
    await vi.waitFor(() => expect(cpu.handles).toHaveLength(1));
    queued.cancel();
    running.cancel();
    expect(cpu.handles[0]!.handle.cancel).toHaveBeenCalledOnce();
    const cancelled = { ok: false, cancelled: true, reason: "cancelled" };
    await expect(running.completion).resolves.toEqual(cancelled);
    await expect(queued.completion).resolves.toEqual(cancelled);
    expect(cpu.handles).toHaveLength(1);
  });

  it("cancels through the request's signal and releases chosen backends on dispose", async () => {
    const cpu = createFakeBackend(WORKER_POOL_BACKEND_ID);
    const gpu = createFakeBackend("webgpu", { needsHirTrees: true });
    const { sampler } = createSampler({ cpu, gpu });
    const controller = new AbortController();

    const run = sampler.run(
      runRequest({ computeBackend: "webgpu", signal: controller.signal }),
    );
    await vi.waitFor(() => expect(gpu.handles).toHaveLength(1));
    controller.abort();
    await expect(run.completion).resolves.toEqual({
      ok: false,
      cancelled: true,
      reason: "cancelled",
    });

    sampler.dispose();
    expect(gpu.backend.dispose).toHaveBeenCalledOnce();
  });
});
