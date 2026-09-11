import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestGpuExperimentBackend } from "./backend";
import { createGpuMonteCarloExperiment } from "./gpu-experiment-handle";
import {
  outcome,
  placeAt,
  shaderAt,
} from "./gpu-experiment-handle/calibration.test-helpers";
import { runGpuExperiment } from "./runner";

import type { HirArtifacts } from "../hir-runtime";
import type { SDCPN } from "../types/sdcpn";
import type { GpuBackend } from "./backend";
import type { CompiledNetShader } from "./compile-net-shader";
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

/** A backend with a derived-capacity place per slab and no device behind it. */
const fakeBackend = (capacities: Record<string, number>): GpuBackend => {
  const derived = new Map(Object.entries(capacities));
  return {
    supported: true,
    handle: {
      device: { destroy: () => {}, lost: new Promise(() => {}) },
      info: "fake adapter",
    } as unknown as GpuBackend["handle"],
    shader: shaderAt(derived, { metricIds: [] }),
    profile: {
      places: [...derived].map((entry) => placeAt(entry)),
      uncolouredOnly: derived.size === 0,
      bytesPerRun: 16,
    },
    derivedCapacities: derived,
    recompile: (next) => ({
      ok: true,
      shader: shaderAt(next, { metricIds: [] }),
    }),
    calibration: new Map(),
    calibrating: new Map(),
    framesPerDispatch: 16,
    warnings: [],
  };
};

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
