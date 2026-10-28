import { beforeAll, expect, test, vi } from "vitest";

import { readRustWasm } from "../../scripts/read-rust-wasm.mjs";
import { compileHirArtifacts } from "../hir/compile";
import { initializeRust } from "../rust/initialize";
import {
  createMonteCarloUserDefinedMetric,
  createMonteCarloUserDefinedMetricConfigsFromSpecs,
} from "../simulation/monte-carlo/metrics";
import { createMonteCarloSimulator } from "../simulation/monte-carlo/monte-carlo-simulator";
import { attachMonteCarloWorker } from "../simulation/monte-carlo/worker/attach";
import { createInProcessMonteCarloWorker } from "../simulation/monte-carlo/worker/in-process-worker";
import { createWasmExperimentBackend } from "../wasm";
import { createWasmSimulation } from "./simulator";

import type {
  MonteCarloInitMessage,
  MonteCarloToMainMessage,
  MonteCarloToWorkerMessage,
} from "../simulation/monte-carlo/worker/messages";
import type { SDCPN } from "../types/sdcpn";

const net = (): SDCPN => ({
  places: ["Queue", "Done", "Blocked"].map((name) => ({
    id: name,
    name,
    x: 0,
    y: 0,
    colorId: null,
    differentialEquationId: null,
    dynamicsEnabled: false,
    capacity: name === "Done" ? 2 : null,
  })),
  transitions: [
    {
      id: "produce",
      name: "Produce",
      x: 0,
      y: 0,
      inputArcs: [
        { placeId: "Queue", weight: 1, type: "standard" },
        { placeId: "Blocked", weight: 1, type: "inhibitor" },
      ],
      outputArcs: [{ placeId: "Done", weight: 1 }],
      lambdaType: "stochastic",
      lambdaCode:
        "const rate = parameters.rate; return rate > 0 ? Math.max(rate, 0.5) : 0;",
      transitionKernelCode: "",
    },
    {
      id: "consume",
      name: "Consume",
      x: 0,
      y: 0,
      inputArcs: [
        { placeId: "Done", weight: 1, type: "standard" },
        { placeId: "Queue", weight: 1, type: "read" },
      ],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "return parameters.enabled;",
      transitionKernelCode: "",
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [
    {
      id: "rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "2",
    },
    {
      id: "enabled",
      name: "Enabled",
      variableName: "enabled",
      type: "boolean",
      defaultValue: "true",
    },
  ],
  metrics: [
    {
      id: "counts",
      name: "Counts",
      code: "return state.places.Done.count + state.places.Queue.count;",
    },
  ],
});

const configuration = (sdcpn = net()): MonteCarloInitMessage => {
  const { artifacts, failures } = compileHirArtifacts(sdcpn, undefined, {
    includeHir: true,
  });
  expect(failures).toEqual([]);
  return {
    type: "init",
    sdcpn,
    initialMarking: { Queue: 5 },
    parameterValues: {},
    seed: 42,
    runCount: 24,
    runIndexOffset: 17,
    dt: 0.1,
    maxTime: 3,
    hirArtifacts: artifacts,
    metricSpecs: [
      {
        id: "counts",
        label: "Counts",
        kind: "expression",
        code: sdcpn.metrics![0]!.code,
        artifact: artifacts.metrics.counts!,
      },
      {
        id: "fired",
        label: "Fired",
        kind: "transitionFiringCount",
        transitionId: "produce",
        mode: "cumulative",
        sampleRuns: "all",
      },
    ],
  };
};

beforeAll(async () => {
  await initializeRust(await readRustWasm());
});

test.each([0, 0.1, 3])(
  "matches CPU frames, RNG, metrics and termination at maxTime %s",
  async (maxTime) => {
    const config = { ...configuration(), maxTime };
    const cpuMetrics = createMonteCarloUserDefinedMetricConfigsFromSpecs(
      config.metricSpecs!,
      config.sdcpn,
    ).map(createMonteCarloUserDefinedMetric);
    const cpu = createMonteCarloSimulator({ ...config, metrics: cpuMetrics });
    const wasm = await createWasmSimulation(config);
    try {
      for (let step = 0; step < 50; step++) {
        const expected = cpu.advanceAll();
        expect(wasm.simulator.advanceAll()).toEqual(expected);
        for (let index = 0; index < config.runCount; index++) {
          expect(wasm.simulator.getRunSnapshot(index)).toEqual(
            cpu.getRunSnapshot(index),
          );
        }
        if (expected.allFinished) {
          break;
        }
      }
      expect(wasm.userMetrics.map((metric) => metric.frames)).toEqual(
        cpuMetrics.map((metric) => metric.frames),
      );
    } finally {
      wasm.simulator.dispose?.();
    }
  },
);

test("compiles per-run parameters into shared-buffer reads without invoking JS artifacts", async () => {
  const sdcpn = net();
  sdcpn.metrics![0]!.code = "return parameters.rate + state.places.Done.count;";
  const config = configuration(sdcpn);
  const wasm = await createWasmSimulation({
    ...config,
    runCount: 2,
    runs: [
      { parameterValues: { rate: "0" } },
      { parameterValues: { rate: "1000" }, initialMarking: { Queue: 2 } },
    ],
    hirArtifacts: {
      ...config.hirArtifacts!,
      lambdas: Object.fromEntries(
        Object.entries(config.hirArtifacts!.lambdas).map(([id, artifact]) => [
          id,
          {
            ...artifact,
            source: "throw new Error('JS lambda must not execute');",
          },
        ]),
      ),
    },
    metricSpecs: config.metricSpecs!.map((spec) =>
      spec.kind === "expression"
        ? {
            ...spec,
            artifact: {
              ...spec.artifact,
              source: "throw new Error('JS metric must not execute');",
            },
          }
        : spec,
    ),
  });
  try {
    expect(wasm.simulator.advanceAll().advancedRuns).toBe(2);
    expect(wasm.simulator.getRunSnapshot(0).placeTokenCounts).toEqual({
      Queue: 5,
      Done: 0,
      Blocked: 0,
    });
    expect(wasm.simulator.getRunSnapshot(1).placeTokenCounts).toEqual({
      Queue: 1,
      Done: 1,
      Blocked: 0,
    });
    expect(wasm.userMetrics[0]!.getLatestFrame()?.value).toBe(500.5);
  } finally {
    wasm.simulator.dispose?.();
  }
  expect(() => wasm.simulator.advanceAll()).toThrow("disposed");
});

test("assessment declines coloured places and unsupported authored operations before allocating workers", async () => {
  const config = configuration();
  const backend = createWasmExperimentBackend();
  const request = {
    ...config,
    parameterValues: {},
    seed: 42,
    metricSpecs: config.metricSpecs!,
  };
  expect((await backend.assess(request)).eligible).toBe(true);
  const coloured = await backend.assess({
    ...request,
    sdcpn: {
      ...config.sdcpn,
      places: config.sdcpn.places.map((place) => ({
        ...place,
        colorId: "colour",
      })),
    },
  });
  expect(coloured.eligible).toBe(false);
  if (!coloured.eligible) {
    expect(coloured.blockers[0].message).toContain("uncoloured");
  }
  const unsupported = net();
  unsupported.transitions[0]!.lambdaCode = "return Math.exp(parameters.rate);";
  const unsupportedConfig = configuration(unsupported);
  const declined = await backend.assess({
    ...request,
    ...unsupportedConfig,
    metricSpecs: unsupportedConfig.metricSpecs!,
  });
  expect(declined.eligible).toBe(false);
  if (!declined.eligible) {
    expect(declined.blockers[0].message).toContain("mathCall (exp)");
  }
});

test("sharded experiments run Wasm and merge global run results from a parameter plan", async () => {
  const config = configuration();
  const backend = createWasmExperimentBackend({
    createWorker: () => createInProcessMonteCarloWorker(createWasmSimulation),
    shardCount: 2,
    batchSize: 3,
  });
  const assessment = await backend.assess({
    ...config,
    parameterValues: {},
    seed: 42,
    runCount: 4,
    maxTime: 0.1,
    metricSpecs: config.metricSpecs!,
    runPlan: { ids: ["rate"], values: Float64Array.of(0, 1000, 0, 1000) },
  });
  if (!assessment.eligible) {
    throw new Error(assessment.blockers[0].message);
  }
  const result = await assessment.instantiate();
  if (!result.ok) {
    throw new Error(result.blockers[0].message);
  }
  try {
    result.handle.start();
    await vi.waitFor(() => expect(result.handle.status.get()).toBe("Complete"));
    expect(result.runtimeInfo).toContain("runtime-compiled Wasm");
    expect(
      Array.from(result.handle.runResults.get(), ([index, metrics]) => [
        index,
        metrics.fired,
      ]),
    ).toEqual([
      [0, 0],
      [1, 1],
      [2, 0],
      [3, 1],
    ]);
  } finally {
    result.handle.dispose();
  }
});

test("cancelling during Wasm compilation disposes the late result without publishing ready", async () => {
  const pending =
    Promise.withResolvers<Awaited<ReturnType<typeof createWasmSimulation>>>();
  const received: MonteCarloToMainMessage[] = [];
  let send: (message: MonteCarloToWorkerMessage) => void = () => {
    throw new Error("Worker listener is missing");
  };
  attachMonteCarloWorker(
    {
      onMessage: (listener) => {
        send = listener;
      },
      postMessage: (message) => {
        received.push(message);
      },
      delay: () => Promise.resolve(),
    },
    () => pending.promise,
  );
  const config = configuration();
  send(config);
  send({ type: "cancel" });
  const initialized = await createWasmSimulation(config);
  const dispose = vi.spyOn(initialized.simulator, "dispose");
  pending.resolve(initialized);
  await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
  expect(received.map((message) => message.type)).toEqual(["cancelled"]);
});
