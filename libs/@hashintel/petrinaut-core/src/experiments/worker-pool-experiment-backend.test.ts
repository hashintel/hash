import { describe, expect, it } from "vitest";

import { createWorkerPoolExperimentBackend } from "./worker-pool-experiment-backend";

import type { ExperimentRequest } from "./experiment-request";

const request = (
  overrides: Partial<ExperimentRequest> = {},
): ExperimentRequest => ({
  sdcpn: {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
  initialMarking: {},
  parameterValues: {},
  seed: 1,
  dt: 0.1,
  maxTime: 1,
  runCount: 2,
  metricSpecs: [],
  ...overrides,
});

const backend = createWorkerPoolExperimentBackend({
  createWorker: () => {
    throw new Error("assessment must not spawn a worker");
  },
});

describe("createWorkerPoolExperimentBackend", () => {
  it("accepts a request whose per-run overrides take one form", async () => {
    const asRuns = await backend.assess(
      request({ runs: [{ seed: 1 }, { seed: 2 }] }),
    );
    const asPlan = await backend.assess(
      request({ runPlan: { ids: ["rate"], values: Float64Array.of(1, 2) } }),
    );

    expect(asRuns.eligible).toBe(true);
    expect(asPlan.eligible).toBe(true);
  });

  it("refuses a request carrying both runs and a run plan", async () => {
    const assessment = await backend.assess(
      request({
        runs: [{ seed: 1 }, { seed: 2 }],
        runPlan: { ids: ["rate"], values: Float64Array.of(1, 2) },
      }),
    );

    expect(assessment.eligible).toBe(false);
    if (!assessment.eligible) {
      expect(assessment.blockers).toEqual([
        expect.objectContaining({
          code: "conflicting-run-overrides",
          origin: "configuration",
        }),
      ]);
    }
  });
});
