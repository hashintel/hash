import { describe, expect, it } from "vitest";

import { createWebGpuExperimentBackend } from "./webgpu-experiment-backend";

import type { ExperimentRequest } from "../experiments/experiment-request";

const request: ExperimentRequest = {
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
};

describe("createWebGpuExperimentBackend", () => {
  it("refuses a request that names a simulator, which it does not host", async () => {
    const backend = createWebGpuExperimentBackend();
    const assessment = await backend.assess({
      ...request,
      simulator: { id: "js-adaptive", parameters: { tolerance: 1e-6 } },
    });

    expect(assessment).toMatchObject({
      eligible: false,
      blockers: [{ code: "simulator-not-hosted", origin: "configuration" }],
    });
    backend.dispose?.();
  });
});
