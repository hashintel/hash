import assert from "node:assert/strict";

const { sirModel } = /** @type {typeof import("../../src/examples/index")} */ (
  await import("../../dist/examples/index.js")
);
const { compileHirArtifacts } = /** @type {typeof import("../../src/hir")} */ (
  await import("../../dist/hir.js")
);

/** @returns {import("../../src/types/sdcpn").SDCPN} */
const ring = () => ({
  places: Array.from({ length: 64 }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
    x: index * 100,
    y: 0,
    colorId: null,
    differentialEquationId: null,
    dynamicsEnabled: false,
    capacity: 100,
  })),
  transitions: Array.from({ length: 64 }, (_, index) => ({
    id: `t${index}`,
    name: `T${index}`,
    x: index * 100,
    y: 100,
    inputArcs: [{ placeId: `p${index}`, weight: 1, type: "standard" }],
    outputArcs: [{ placeId: `p${(index + 1) % 64}`, weight: 1 }],
    lambdaType: "stochastic",
    lambdaCode:
      "const r = parameters.rate; return r > 0 ? Math.max(r, 0.5) : 0;",
    transitionKernelCode: "",
  })),
  parameters: [
    {
      id: "rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "3",
    },
  ],
  types: [],
  differentialEquations: [],
  metrics: [
    {
      id: "balance",
      name: "Balance",
      code: "return state.places.P0.count - state.places.P32.count;",
    },
  ],
});

/** @param {number} scale @param {number} frames */
export const fixtures = (scale, frames) => {
  const cases = [
    {
      id: "sir-1000",
      sdcpn: sirModel.petriNetDefinition,
      runCount: 1000,
      metrics: true,
    },
    {
      id: "sir-10000",
      sdcpn: sirModel.petriNetDefinition,
      runCount: 10000,
      metrics: true,
    },
    { id: "ring64-1000", sdcpn: ring(), runCount: 1000, metrics: true },
    {
      id: "sir-10000-no-metrics",
      sdcpn: sirModel.petriNetDefinition,
      runCount: 10000,
      metrics: false,
    },
  ];
  return cases.map(({ id, sdcpn, runCount, metrics }) => {
    const start = performance.now();
    const compiled = compileHirArtifacts(sdcpn, undefined, {
      includeHir: true,
    });
    const frontendMs = performance.now() - start;
    assert.deepEqual(
      compiled.failures,
      [],
      "Fixture must compile without failures",
    );
    const isRing = id.startsWith("ring");
    /** @type {import("../../src/simulation/monte-carlo/worker/messages").MonteCarloInitMessage} */
    const config = {
      type: "init",
      sdcpn,
      runCount: Math.max(1, Math.round(runCount * scale)),
      initialMarking: isRing
        ? Object.fromEntries(sdcpn.places.map((place) => [place.id, 20]))
        : { place__susceptible: 990, place__infected: 10, place__recovered: 0 },
      parameterValues: isRing
        ? { rate: "3" }
        : { infection_rate: "1.5", recovery_rate: "0.8" },
      seed: 42,
      dt: 0.1,
      maxTime: frames * 0.1,
      hirArtifacts: compiled.artifacts,
      metricSpecs: metrics
        ? (sdcpn.metrics ?? []).map((metric) => {
            const artifact = compiled.artifacts.metrics[metric.id];
            assert(artifact, "Metric artifact must exist");
            return {
              id: metric.id,
              label: metric.name,
              kind: "expression",
              code: metric.code,
              artifact,
              sampleRuns: "all",
            };
          })
        : [],
    };
    return { id, frames, frontendMs, config };
  });
};
