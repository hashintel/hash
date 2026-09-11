import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestGpuExperimentBackend } from "./backend";
import { createGpuMonteCarloExperiment } from "./gpu-experiment-handle";
import { runGpuExperiment } from "./runner";

import type { HirArtifacts } from "../hir-runtime";
import type { SDCPN } from "../types/sdcpn";
import type { GpuBackend } from "./backend";
import type { CompiledNetShader } from "./compile-net-shader";
import type { GpuNetProfile } from "./eligibility";
import type { GpuExperimentRequest, GpuExperimentResult } from "./runner";

vi.mock("./backend", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestGpuExperimentBackend: vi.fn(),
}));

vi.mock("./runner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runGpuExperiment: vi.fn(),
}));

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

/** A shader whose only relevant facts are its size and its derived places. */
const shaderAt = (
  capacities: ReadonlyMap<string, number>,
): CompiledNetShader => {
  const slabWords = [...capacities.values()].reduce(
    (sum, capacity) => sum + capacity * 2,
    0,
  );
  return {
    wgsl: "",
    stateWordsPerRun: 4 + slabWords,
    summaryWordsPerRun: 2 + capacities.size,
    placeCountOffsets: [0],
    placeTokenOffsets: [4],
    placeTokenStrides: [2],
    summaryStatusOffset: 1,
    rngOffset: 2,
    statusOffset: 3,
    derivedCapacityPlaceIndices: [...capacities.keys()].map(
      (_, index) => index,
    ),
    metricIds: [],
    histogramBins: 64,
    runParameterIds: [],
    compiledLambdas: [],
  };
};

const placeAt = ([id, capacity]: [
  string,
  number,
]): GpuNetProfile["places"][number] => ({
  id,
  name: id.toUpperCase(),
  capacity,
  capacitySource: "derived",
  declaredCapacity: 0xffffffff,
  realFields: ["x", "y"],
  discreteFields: [],
  colored: true,
  pairConsumed: false,
});

/** A backend with a derived-capacity place per slab and no device behind it. */
const fakeBackend = (capacities: Record<string, number>): GpuBackend => {
  const derived = new Map(Object.entries(capacities));
  return {
    supported: true,
    handle: {
      device: { destroy: () => {}, lost: new Promise(() => {}) },
      info: "fake adapter",
    } as unknown as GpuBackend["handle"],
    shader: shaderAt(derived),
    profile: {
      places: [...derived].map(placeAt),
      uncolouredOnly: derived.size === 0,
      bytesPerRun: 16,
    },
    derivedCapacities: derived,
    recompile: (next) => ({ ok: true, shader: shaderAt(next) }),
    calibration: new Map(),
    calibrating: new Map(),
    framesPerDispatch: 16,
    warnings: [],
  };
};

const outcome = (
  overrides: Partial<GpuExperimentResult> = {},
): GpuExperimentResult => ({
  cancelled: false,
  frames: [],
  finalPlaceCounts: new Uint32Array(0),
  deadlockedRuns: 0,
  completedRuns: 0,
  overflowRuns: 0,
  derivedPlaceMaxes: [],
  dispatchMs: 0,
  metricRanges: [],
  metricErrors: [],
  ...overrides,
});

type PendingRun = {
  shader: CompiledNetShader;
  request: GpuExperimentRequest;
  resolve: (result: GpuExperimentResult) => void;
};

/** Every attempt the handles under test asked the runner for, unresolved until the test says. */
const pendingRuns: PendingRun[] = [];

const createHandle = async (backend: GpuBackend) => {
  vi.mocked(requestGpuExperimentBackend).mockResolvedValue(backend);
  const created = await createGpuMonteCarloExperiment({
    sdcpn: emptyNet,
    hirArtifacts: {} as unknown as HirArtifacts,
    initialMarking: {},
    parameterValues: {},
    seed: 1,
    dt: 0.1,
    maxTime: 1,
    runCount: 1000,
    metricSpecs: [],
  });
  if (!created.supported) {
    throw new Error(created.reason);
  }
  return created.handle;
};

/** Lets the handles' attempt chains settle: each await in them costs a microtask. */
const flush = async () => {
  for (let tick = 0; tick < 32; tick += 1) {
    await Promise.resolve();
  }
};

describe("createGpuMonteCarloExperiment", () => {
  beforeEach(() => {
    pendingRuns.length = 0;
    vi.mocked(runGpuExperiment).mockImplementation(
      (_handle, shader, request) =>
        new Promise((resolve) => {
          pendingRuns.push({
            shader,
            request,
            resolve: (result) => resolve({ ok: true, result }),
          });
        }),
    );
  });

  it("runs two batches on one marking at once when neither needs a probe", async () => {
    const backend = fakeBackend({});
    const first = await createHandle(backend);
    const second = await createHandle(backend);

    first.start();
    second.start();
    await flush();

    expect(pendingRuns.map(({ request }) => request.runCount)).toEqual([
      1000, 1000,
    ]);

    for (const pending of pendingRuns) {
      pending.resolve(outcome({ completedRuns: 1000 }));
    }
    await flush();
    expect([first.status.get(), second.status.get()]).toEqual([
      "Complete",
      "Complete",
    ]);
  });

  it("makes a batch wait for the probe another runs on its marking, then adopt it", async () => {
    const backend = fakeBackend({ p: 64 });
    const first = await createHandle(backend);
    const second = await createHandle(backend);

    first.start();
    await flush();
    second.start();
    await flush();

    expect(pendingRuns.map(({ request }) => request.runCount)).toEqual([128]);

    pendingRuns[0]!.resolve(
      outcome({ derivedPlaceMaxes: [{ max: 10, meanRunMax: 8 }] }),
    );
    await flush();

    // Both full attempts run at the slab the one probe sized.
    expect(pendingRuns.slice(1).map(({ request }) => request.runCount)).toEqual(
      [1000, 1000],
    );
    expect(
      pendingRuns.slice(1).map(({ shader }) => shader.stateWordsPerRun),
    ).toEqual([4 + 19 * 2, 4 + 19 * 2]);
    expect(backend.calibration.size).toBe(1);
  });

  it("publishes no progress for a probe's chunks", async () => {
    const handle = await createHandle(fakeBackend({ p: 64 }));

    handle.start();
    await flush();

    pendingRuns[0]!.request.onChunk?.({
      framesDone: 10,
      frameLimit: 10,
      runsCompleted: 128,
      runsInTile: 0,
      runCount: 128,
    });
    expect(handle.progress.get()?.completedRuns).toBe(0);

    pendingRuns[0]!.resolve(
      outcome({ derivedPlaceMaxes: [{ max: 10, meanRunMax: 8 }] }),
    );
    await flush();
    pendingRuns[1]!.request.onChunk?.({
      framesDone: 5,
      frameLimit: 10,
      runsCompleted: 0,
      runsInTile: 128,
      runCount: 1000,
    });
    expect(handle.progress.get()).toMatchObject({
      completedRuns: 0,
      advancedRuns: 128,
    });
  });
});
