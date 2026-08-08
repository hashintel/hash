import { describe, expect, it, vi } from "vitest";

import { selectExperimentBackend } from "./select-experiment-backend";

import type {
  ExperimentAssessment,
  ExperimentBlockers,
} from "./experiment-assessment";
import type {
  ExperimentBackend,
  ExperimentBackendRegistration,
} from "./experiment-backend";
import type { ExperimentRequest } from "./experiment-request";
import type { MonteCarloExperiment } from "../simulation/monte-carlo/runtime/experiment";

/** Enough of a handle to be identity-compared; nothing here starts it. */
function stubHandle(name: string): MonteCarloExperiment {
  return { name } as unknown as MonteCarloExperiment;
}

const REQUEST = { runCount: 10 } as unknown as ExperimentRequest;

function stubBackend({
  id,
  needsHirTrees = false,
  available = true,
  assessment,
}: {
  id: string;
  needsHirTrees?: boolean;
  available?: boolean;
  assessment: (request: ExperimentRequest) => ExperimentAssessment;
}): ExperimentBackend {
  return {
    id,
    label: id.toUpperCase(),
    needsHirTrees,
    isAvailable: () => available,
    assess: (request) => Promise.resolve(assessment(request)),
  };
}

function registrationFor(
  backend: ExperimentBackend,
): ExperimentBackendRegistration {
  return {
    id: backend.id,
    label: backend.label,
    load: () => Promise.resolve(backend),
  };
}

/** An eligible assessment whose `instantiate` succeeds. */
function accepts(handleName: string, runtimeInfo?: string): ExperimentAssessment {
  return {
    eligible: true,
    notes: [],
    instantiate: () =>
      Promise.resolve({
        ok: true,
        handle: stubHandle(handleName),
        ...(runtimeInfo === undefined ? {} : { runtimeInfo }),
      }),
  };
}

const MODEL_BLOCKERS: ExperimentBlockers = [
  {
    code: "colored-place-without-capacity",
    message: "Place `Space` holds typed tokens but has no token capacity.",
    origin: "model",
    itemId: "p_space",
  },
];

describe("selectExperimentBackend", () => {
  it("uses the first backend that accepts, without loading later ones", async () => {
    // Loading is deferred precisely so the GPU shader generator stays out of the
    // bundle until a GPU run is attempted; if selection loaded every candidate
    // eagerly that would be pointless.
    const secondLoad = vi.fn(() =>
      Promise.resolve(stubBackend({ id: "second", assessment: () => accepts("b") })),
    );

    const result = await selectExperimentBackend({
      registrations: [
        registrationFor(
          stubBackend({ id: "first", assessment: () => accepts("a") }),
        ),
        { id: "second", label: "SECOND", load: secondLoad },
      ],
      buildRequest: () => Promise.resolve(REQUEST),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backendId).toBe("first");
    expect(result.declined).toStrictEqual([]);
    expect(secondLoad).not.toHaveBeenCalled();
  });

  it("falls through to the next backend and records why the first declined", async () => {
    const result = await selectExperimentBackend({
      registrations: [
        registrationFor(
          stubBackend({
            id: "webgpu",
            assessment: () => ({ eligible: false, blockers: MODEL_BLOCKERS }),
          }),
        ),
        registrationFor(
          stubBackend({ id: "cpu", assessment: () => accepts("cpu") }),
        ),
      ],
      buildRequest: () => Promise.resolve(REQUEST),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backendId).toBe("cpu");
    // The reason must survive, because this is what tells the user their
    // experiment is not running where they asked.
    expect(result.declined).toStrictEqual([
      {
        backendId: "webgpu",
        origin: "model",
        reason: "Place `Space` holds typed tokens but has no token capacity.",
      },
    ]);
  });

  it("treats a failed instantiation as a refusal and keeps going", async () => {
    // Assessment is authoritative about the net; instantiation can still fail for
    // the environment — a device that will not allocate. Surfacing that as a dead
    // end rather than falling through would strand the user on a working net.
    const result = await selectExperimentBackend({
      registrations: [
        registrationFor(
          stubBackend({
            id: "webgpu",
            assessment: () => ({
              eligible: true,
              notes: [],
              instantiate: () =>
                Promise.resolve({
                  ok: false,
                  blockers: [
                    {
                      code: "gpu-allocation-failed",
                      message: "The GPU could not allocate memory for 1000000 runs.",
                      origin: "capacity",
                    },
                  ],
                }),
            }),
          }),
        ),
        registrationFor(
          stubBackend({ id: "cpu", assessment: () => accepts("cpu") }),
        ),
      ],
      buildRequest: () => Promise.resolve(REQUEST),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backendId).toBe("cpu");
    expect(result.declined[0]?.origin).toBe("capacity");
  });

  it("leads with the most actionable blocker and counts the rest", async () => {
    // A net failing several checks should be described by the one the author can
    // act on, not by whichever the pipeline happened to hit first.
    const result = await selectExperimentBackend({
      registrations: [
        registrationFor(
          stubBackend({
            id: "webgpu",
            assessment: () => ({
              eligible: false,
              blockers: [
                {
                  code: "no-webgpu",
                  message: "This browser does not expose WebGPU.",
                  origin: "environment",
                },
                {
                  code: "colored-place-without-capacity",
                  message: "Place `Space` has no token capacity.",
                  origin: "model",
                },
              ],
            }),
          }),
        ),
      ],
      buildRequest: () => Promise.resolve(REQUEST),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.declined[0]).toStrictEqual({
      backendId: "webgpu",
      origin: "model",
      reason: "Place `Space` has no token capacity. (+1 more)",
    });
  });

  it("skips an unavailable backend without assessing it", async () => {
    const assess = vi.fn(() => accepts("never"));

    const result = await selectExperimentBackend({
      registrations: [
        registrationFor(
          stubBackend({ id: "webgpu", available: false, assessment: assess }),
        ),
        registrationFor(
          stubBackend({ id: "cpu", assessment: () => accepts("cpu") }),
        ),
      ],
      buildRequest: () => Promise.resolve(REQUEST),
    });

    expect(assess).not.toHaveBeenCalled();
    expect(result.ok && result.backendId).toBe("cpu");
  });

  it("survives a backend whose module will not load", async () => {
    const result = await selectExperimentBackend({
      registrations: [
        {
          id: "webgpu",
          label: "WEBGPU",
          load: () => Promise.reject(new Error("chunk load failed")),
        },
        registrationFor(
          stubBackend({ id: "cpu", assessment: () => accepts("cpu") }),
        ),
      ],
      buildRequest: () => Promise.resolve(REQUEST),
    });

    expect(result.ok && result.backendId).toBe("cpu");
    if (!result.ok) return;
    expect(result.declined[0]?.reason).toMatch(/could not be loaded.*chunk load/);
  });

  it("builds the request once per distinct artifact requirement", async () => {
    // Compiling HIR trees roughly triples artifact size, so the worker-pool path
    // must not pay for them — but two backends wanting the same artifacts should
    // not compile twice either.
    const buildRequest = vi.fn((_options: { needsHirTrees: boolean }) =>
      Promise.resolve(REQUEST),
    );

    await selectExperimentBackend({
      registrations: [
        registrationFor(
          stubBackend({
            id: "webgpu",
            needsHirTrees: true,
            assessment: () => ({ eligible: false, blockers: MODEL_BLOCKERS }),
          }),
        ),
        registrationFor(
          stubBackend({
            id: "wasm",
            needsHirTrees: true,
            assessment: () => ({ eligible: false, blockers: MODEL_BLOCKERS }),
          }),
        ),
        registrationFor(
          stubBackend({ id: "cpu", assessment: () => accepts("cpu") }),
        ),
      ],
      buildRequest,
    });

    // Once with trees (shared by webgpu and wasm), once without (cpu).
    expect(buildRequest.mock.calls.map(([options]) => options)).toStrictEqual([
      { needsHirTrees: true },
      { needsHirTrees: false },
    ]);
  });

  it("reports every refusal when nothing can run it", async () => {
    const result = await selectExperimentBackend({
      registrations: [
        registrationFor(
          stubBackend({
            id: "webgpu",
            assessment: () => ({ eligible: false, blockers: MODEL_BLOCKERS }),
          }),
        ),
        registrationFor(
          stubBackend({
            id: "cpu",
            assessment: () => ({
              eligible: false,
              blockers: [
                {
                  code: "no-artifacts",
                  message: "The net's code did not compile.",
                  origin: "configuration",
                },
              ],
            }),
          }),
        ),
      ],
      buildRequest: () => Promise.resolve(REQUEST),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.declined.map((entry) => entry.backendId)).toStrictEqual([
      "webgpu",
      "cpu",
    ]);
  });

  it("passes the instantiate options through to the chosen backend", async () => {
    // The signal and the post-hoc note channel are deliberately not on the
    // request, so they have to arrive here or they arrive nowhere.
    const instantiate = vi.fn(() =>
      Promise.resolve({ ok: true as const, handle: stubHandle("cpu") }),
    );
    const onNote = () => {};

    await selectExperimentBackend({
      registrations: [
        registrationFor(
          stubBackend({
            id: "cpu",
            assessment: () => ({ eligible: true, notes: [], instantiate }),
          }),
        ),
      ],
      buildRequest: () => Promise.resolve(REQUEST),
      instantiateOptions: { onNote },
    });

    expect(instantiate).toHaveBeenCalledWith({ onNote });
  });
});
