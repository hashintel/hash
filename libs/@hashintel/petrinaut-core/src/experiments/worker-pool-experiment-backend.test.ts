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
  it("accepts a request with a run plan", async () => {
    const assessment = await backend.assess(
      request({ runPlan: { ids: ["rate"], values: Float64Array.of(1, 2) } }),
    );

    expect(assessment.eligible).toBe(true);
  });
});
