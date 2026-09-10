import { describe, expect, it } from "vitest";

import { cafeQueue } from "../examples/cafe-queue";
import { dronePatrol } from "../examples/drone-patrol";
import * as allExamples from "../examples/index";
import { probabilisticSatellitesSDCPN } from "../examples/satellites-launcher";
import { sirModel } from "../examples/sir-model";
import { compileHirArtifacts } from "../hir";
import {
  analyzeCompilation,
  summarizeGpuUnavailability,
} from "./compilation-report";

import type { MonteCarloExpressionMetricSpec } from "../simulation/monte-carlo/metrics";
import type { SDCPN } from "../types/sdcpn";

function analyze(sdcpn: SDCPN) {
  const { artifacts } = compileHirArtifacts(sdcpn, undefined, {
    includeHir: true,
  });
  // Parameter values are deliberately not passed: the net's own defaults are the
  // documented fallback, and every caller in the app relies on that.
  return analyzeCompilation({ sdcpn, artifacts });
}

/** One of the net's model metrics as the expression spec an experiment sends. */
function modelMetricSpec(
  sdcpn: SDCPN,
  metricId: string,
): MonteCarloExpressionMetricSpec {
  const metric = sdcpn.metrics?.find((candidate) => candidate.id === metricId);
  const artifact = compileHirArtifacts(sdcpn, undefined, { includeHir: true })
    .artifacts.metrics[metricId];
  if (metric === undefined || artifact === undefined) {
    throw new Error(`metric ${metricId} is not on the net or did not compile`);
  }
  return {
    kind: "expression",
    id: metric.id,
    label: metric.name,
    code: metric.code,
    artifact,
  };
}

const satellites = probabilisticSatellitesSDCPN.petriNetDefinition;

describe("gpu-ready shipped examples", () => {
  // The two examples that exist to exercise the GPU out of the box; a
  // regression that breaks either's eligibility should fail here, not in a
  // user's hands.
  it("keeps Café Queue gpu-ready", () => {
    expect(analyze(cafeQueue.petriNetDefinition).gpuReady).toBe(true);
  });

  it("keeps Drone Patrol gpu-ready", () => {
    expect(analyze(dronePatrol.petriNetDefinition).gpuReady).toBe(true);
  });
});

/** The satellites net with a `string` attribute, which stays GPU-ineligible. */
const withStringAttribute: SDCPN = {
  ...satellites,
  types: satellites.types.map((type) => ({
    ...type,
    elements: [
      ...type.elements,
      { elementId: "tag", name: "tag", type: "string" as const },
    ],
  })),
};

describe("analyzeCompilation", () => {
  it("reports an uncoloured net as GPU-ready and keeps the WGSL", () => {
    const report = analyze(sirModel.petriNetDefinition);

    expect(report.gpuReady).toBe(true);
    expect(report.eligibilityReasons).toStrictEqual([]);
    expect(report.shaderFailure).toBeNull();
    expect(report.wgsl).toContain("@compute");
    expect(report.bytesPerRun).toBeGreaterThan(0);
    // Both transitions' conditions lowered and emitted.
    expect(
      report.items.filter(
        (item) => item.kind === "lambda" && item.status === "gpu-ready",
      ),
    ).toHaveLength(2);
  });

  it("accepts every bundled example except the one multi-place consumer", () => {
    // With derived capacities, calibrated histogram windows, forwarded
    // kernel tokens, and the tiling-aware state gate, the only example the
    // GPU still declines is Production Machines — its \`Start Repair\`
    // consumes typed tokens from two places, a cross-product enumeration
    // the shader does not scan yet (the weight > 2 family).
    // Deliberately exhaustive over the examples namespace: adding an example
    // MUST extend this matrix, so its GPU verdict is a decision, not an
    // accident.
    const readiness = Object.fromEntries(
      Object.entries(allExamples).map(([name, example]) => {
        const definition = (
          example as { petriNetDefinition: typeof satellites }
        ).petriNetDefinition;
        return [name, analyze(definition).gpuReady];
      }),
    );
    expect(readiness).toStrictEqual({
      productionMachines: false,
      deploymentPipelineSDCPN: true,
      probabilisticSatellitesSDCPN: true,
      sirModel: true,
      cafeQueue: true,
      dronePatrol: true,
      supplyChainWithDisruption: true,
      supplyChainProfit: true,
      vaccinationCampaign: true,
    });
    const production = analyze(
      allExamples.productionMachines.petriNetDefinition,
    );
    expect(production.shaderFailure).toMatch(
      /consumes typed tokens from 2 places/,
    );
  });

  it("reports the satellites example GPU-ready with derived capacities", () => {
    // Typed places without declared capacities used to be the example's
    // structural blocker; their slabs now derive by probing, so the whole
    // net compiles.
    const report = analyze(satellites);

    expect(report.gpuReady).toBe(true);
    expect(report.eligibilityReasons).toStrictEqual([]);
  });

  it("does not claim an item is GPU-ready when emission never ran", () => {
    // A `string` attribute still refuses eligibility, so nothing was emitted.
    // Saying "GPU" here would assert something untested.
    const report = analyze(withStringAttribute);

    const dynamics = report.items.filter((item) => item.kind === "dynamics");
    expect(dynamics.length).toBeGreaterThan(0);
    for (const item of dynamics) {
      expect(item.status).toBe("not-attempted");
      expect(item.detail).toMatch(/refused before shader emission/i);
    }
    expect(report.items.some((item) => item.status === "gpu-ready")).toBe(
      false,
    );
  });

  it("reports the structural blockers for a string-carrying net", () => {
    const report = analyze(withStringAttribute);

    expect(report.gpuReady).toBe(false);
    for (const reason of report.eligibilityReasons) {
      expect(reason.code).toBe("unsupported-attribute-type");
    }
    expect(report.eligibilityReasons.length).toBeGreaterThan(0);
    // Eligibility failed, so emission never ran — there is nothing to report.
    expect(report.shaderFailure).toBeNull();
    expect(report.wgsl).toBeNull();
  });

  it("compiles a weight-1 typed condition once capacities let the net through", () => {
    // `Crash` reads `tokens.Space[0].x` and `.y`. That used to bail — the shader
    // bound `tokens` to an empty tuple — and now emits a scan over candidate
    // tokens with the same slot arithmetic the dynamics loop uses.
    const capped: SDCPN = {
      ...satellites,
      places: satellites.places.map((place) => ({ ...place, capacity: 32 })),
      transitions: satellites.transitions.filter(
        (transition) => transition.name === "Crash",
      ),
    };

    const report = analyze(capped);

    expect(report.eligibilityReasons).toStrictEqual([]);
    expect(report.shaderFailure).toBeNull();
    expect(report.items.find((item) => item.kind === "lambda")?.status).toBe(
      "gpu-ready",
    );
    // And GPU-ready overall now that its kernel writes the debris attributes.
    expect(report.gpuReady).toBe(true);
  });

  it("reports a kernel as GPU-ready once the net compiles", () => {
    // Every satellites kernel translates, distributions included, and the shader
    // now writes the attributes they produce.
    const capped: SDCPN = {
      ...satellites,
      places: satellites.places.map((place) => ({ ...place, capacity: 32 })),
    };
    const kernels = analyze(capped).items.filter(
      (item) => item.kind === "kernel",
    );

    expect(kernels.length).toBeGreaterThan(0);
    for (const kernel of kernels) {
      expect(kernel.status).toBe("gpu-ready");
      expect(kernel.hirNodeCount).toBeGreaterThan(0);
    }
  });

  it("names the code that stops a kernel translating", () => {
    // No built-in example has an untranslatable kernel, so this adds a `string`
    // attribute — 64-bit string-pool ids, which WGSL has no room for. The point
    // is that the report says *that*, rather than the generic "the GPU does not
    // run kernels" it says when the backend is what is missing.
    const labelled: SDCPN = {
      ...satellites,
      types: satellites.types.map((type, index) =>
        index === 0
          ? {
              ...type,
              elements: [
                ...type.elements,
                { elementId: "el__tag", name: "tag", type: "string" as const },
              ],
            }
          : type,
      ),
      transitions: satellites.transitions.map((transition) =>
        transition.name === "LaunchSatellite"
          ? {
              ...transition,
              transitionKernelCode: `export default TransitionKernel(() => ({
  Space: [{ x: 0, y: 0, direction: 0, velocity: 1, tag: "sat" }],
}))`,
            }
          : transition,
      ),
    };

    const launch = analyze(labelled).items.find(
      (item) => item.kind === "kernel" && item.itemName === "LaunchSatellite",
    );

    expect(launch?.status).toBe("cpu-only");
    expect(launch?.detail).toMatch(/Cannot be translated to WGSL: .*string/);
  });

  it("does not blame the GPU for a kernel neither engine uses", () => {
    // A kernel is only compiled when the transition has a typed output place
    // (`isTransitionKernelAvailable`). SIR has kernel *code* but no typed places,
    // so the engine ignores it — reporting that as a GPU limitation was wrong.
    const report = analyze(sirModel.petriNetDefinition);
    const kernels = report.items.filter((item) => item.kind === "kernel");

    expect(kernels.length).toBeGreaterThan(0);
    for (const kernel of kernels) {
      expect(kernel.status).toBe("disabled");
      expect(kernel.detail).toMatch(/no typed output place/);
    }
  });

  it("counts HIR nodes so the panel can show expression size", () => {
    // SIR's condition is exactly `parameters.infection_rate` — one node. Pinning
    // it at 1 keeps the count honest at the bottom end.
    const sir = analyze(sirModel.petriNetDefinition);
    expect(sir.items.find((item) => item.kind === "lambda")?.hirNodeCount).toBe(
      1,
    );

    // Satellites' `Crash` condition is a comparison over a hypot of two token
    // fields against a sum of three parameters, so the walk has to recurse.
    const capped: SDCPN = {
      ...satellites,
      places: satellites.places.map((place) => ({ ...place, capacity: 32 })),
    };
    const crash = analyze(capped).items.find(
      (item) => item.kind === "lambda" && item.itemName === "Crash",
    );
    expect(crash?.hirNodeCount).toBeGreaterThan(8);
  });

  it("classifies every bundled example's model metrics", () => {
    // One `metric` row per model metric, whether or not an experiment
    // measures it. Deliberately exhaustive over the examples namespace, like
    // the readiness matrix: a metric added to an example fails here until its
    // GPU verdict is recorded. Every translatable metric on a GPU-ready net is
    // `gpu-ready`; the two `.concat` averages are `cpu-only` with their own
    // reason; Production Machines' other metrics are `cpu-only` because the
    // net's shader fails, which is a different sentence.
    const statuses = Object.fromEntries(
      Object.entries(allExamples).map(([name, example]) => {
        const definition = (example as { petriNetDefinition: SDCPN })
          .petriNetDefinition;
        const rows = analyze(definition).items.filter(
          (item) => item.kind === "metric",
        );
        expect(rows.map((row) => row.itemId).sort(), name).toStrictEqual(
          (definition.metrics ?? []).map((metric) => metric.id).sort(),
        );
        return [
          name,
          Object.fromEntries(rows.map((row) => [row.itemId, row.status])),
        ];
      }),
    );
    expect(statuses).toStrictEqual({
      productionMachines: {
        metric__good_products: "cpu-only",
        metric__defective_products: "cpu-only",
        metric__yield: "cpu-only",
        metric__machines_down: "cpu-only",
        metric__average_machine_damage: "cpu-only",
      },
      deploymentPipelineSDCPN: {
        metric__successful_deployments: "gpu-ready",
        metric__failed_deployments: "gpu-ready",
        metric__release_queue_length: "gpu-ready",
        metric__active_incidents: "gpu-ready",
        metric__deployment_gate_blocked: "gpu-ready",
        metric__failure_share: "gpu-ready",
      },
      probabilisticSatellitesSDCPN: {
        metric__satellites_in_orbit: "gpu-ready",
        metric__debris: "gpu-ready",
        metric__average_orbital_radius: "gpu-ready",
        metric__average_orbital_speed: "gpu-ready",
      },
      sirModel: { metric__infected_fraction: "gpu-ready" },
      cafeQueue: {},
      dronePatrol: {},
      supplyChainWithDisruption: {
        metric_service_level: "gpu-ready",
        metric_customer_pressure: "gpu-ready",
        metric_stock_position: "gpu-ready",
        metric_inbound_pipeline: "gpu-ready",
        metric_average_inbound_risk: "gpu-ready",
        metric_factory_available: "gpu-ready",
        metric_scrap_rate: "gpu-ready",
        metric_supplier_outages: "gpu-ready",
        metric_average_order_age: "cpu-only",
      },
      supplyChainProfit: {
        metric_service_level: "gpu-ready",
        metric_profit: "gpu-ready",
      },
      vaccinationCampaign: {
        metric__total_cost: "gpu-ready",
        metric__infected: "gpu-ready",
        metric__attack_rate: "gpu-ready",
      },
    });

    const production = analyze(
      allExamples.productionMachines.petriNetDefinition,
    );
    const productionRows = production.items.filter(
      (item) => item.kind === "metric",
    );
    for (const row of productionRows) {
      if (row.itemId === "metric__average_machine_damage") {
        expect(row.detail).toMatch(/Cannot be translated to WGSL: .*concat/);
      } else {
        expect(row.detail, row.itemId).toBe(production.shaderFailure);
      }
      expect(row.hirNodeCount).toBeGreaterThan(0);
    }
    const orderAge = analyze(
      allExamples.supplyChainWithDisruption.petriNetDefinition,
    ).items.find((item) => item.itemId === "metric_average_order_age");
    expect(orderAge?.detail).toMatch(/Cannot be translated to WGSL: .*concat/);
  });

  it("compiles the shader with the experiment's metrics", () => {
    // Without specs no metric is emitted; with SIR's own metric as an
    // expression spec the sample block is in the WGSL, so `wgsl` and
    // `shaderFailure` cover metric emission and not only the net's code.
    const sdcpn = sirModel.petriNetDefinition;
    expect(analyze(sdcpn).wgsl).not.toContain("let v0: f32");

    const { artifacts } = compileHirArtifacts(sdcpn, undefined, {
      includeHir: true,
    });
    const report = analyzeCompilation({
      sdcpn,
      artifacts,
      metricSpecs: [modelMetricSpec(sdcpn, "metric__infected_fraction")],
    });

    expect(report.gpuReady).toBe(true);
    expect(report.metricFailure).toBeNull();
    expect(report.wgsl).toContain("let v0: f32 = select(");
  });

  it("reports metric shapes the GPU histogram cannot serve", () => {
    const sdcpn = sirModel.petriNetDefinition;
    const { artifacts } = compileHirArtifacts(sdcpn, undefined, {
      includeHir: true,
    });

    const withPlaceCount = analyzeCompilation({
      sdcpn,
      artifacts,
      metricSpecs: [
        {
          id: "count",
          label: "Susceptible",
          kind: "placeTokenCountMean",
          placeId: sdcpn.places[0]!.id,
        },
      ],
    });
    expect(withPlaceCount.metricFailure).toBeNull();

    const withFiringCount = analyzeCompilation({
      sdcpn,
      artifacts,
      metricSpecs: [
        {
          id: "firings",
          label: "Infections",
          kind: "transitionFiringCount",
          transitionId: sdcpn.transitions[0]!.id,
        },
      ],
    });
    expect(withFiringCount.metricFailure).toMatch(/transition firings/);
    expect(withFiringCount.gpuReady).toBe(false);

    const infectedFraction = modelMetricSpec(
      sdcpn,
      "metric__infected_fraction",
    );
    const { hir: _stripped, ...artifactWithoutHir } = infectedFraction.artifact;
    const withoutHir = analyzeCompilation({
      sdcpn,
      artifacts,
      metricSpecs: [{ ...infectedFraction, artifact: artifactWithoutHir }],
    });
    expect(withoutHir.metricFailure).toMatch(/HIR tree/);
    expect(withoutHir.gpuReady).toBe(false);
  });

  it("names the construct that keeps an expression metric on the CPU", () => {
    const sdcpn = allExamples.productionMachines.petriNetDefinition;
    const { artifacts } = compileHirArtifacts(sdcpn, undefined, {
      includeHir: true,
    });
    const report = analyzeCompilation({
      sdcpn,
      artifacts,
      metricSpecs: [modelMetricSpec(sdcpn, "metric__average_machine_damage")],
    });

    expect(report.metricFailure).toMatch(
      /Metric "Average machine damage" cannot be translated to WGSL: .*concat.*\.$/,
    );
  });

  it("does not run the metric gate when no metrics are given", () => {
    // The panel analyses a net being edited, which has no experiment metrics yet.
    const report = analyze(sirModel.petriNetDefinition);

    expect(report.metricFailure).toBeNull();
  });
});

describe("summarizeGpuUnavailability", () => {
  it("says nothing when the net is GPU-ready", () => {
    expect(
      summarizeGpuUnavailability(analyze(sirModel.petriNetDefinition)),
    ).toBeNull();
  });

  it("leads with a structural reason, which is the actionable one", () => {
    const summary = summarizeGpuUnavailability(analyze(withStringAttribute));

    expect(summary).toMatch(/carries a `string` attribute/);
    // Two places carry the attribute; the tooltip says so without listing
    // both.
    expect(summary).toMatch(/\(\+1 more\)$/);
  });

  it("falls through to the emitter's message only when nothing better exists", () => {
    // A `string` attribute is refused by eligibility now, with a better message,
    // so the case that actually reaches the emitter is a limitation of the token
    // scan: consuming typed tokens from two places would be a Cartesian product
    // across arcs, which is a nested scan and is not supported.
    const debrisPlace = satellites.places.find(
      (place) => place.name === "Debris",
    )!;
    const twoTypedInputs: SDCPN = {
      ...satellites,
      places: satellites.places.map((place) => ({ ...place, capacity: 32 })),
      transitions: satellites.transitions
        .filter((transition) => transition.name === "Crash")
        .map((transition) => ({
          ...transition,
          outputArcs: [],
          inputArcs: [
            ...transition.inputArcs,
            { placeId: debrisPlace.id, weight: 1, type: "standard" as const },
          ],
        })),
    };
    const report = analyze(twoTypedInputs);

    expect(report.eligibilityReasons).toStrictEqual([]);
    expect(report.shaderFailure).toMatch(/only one is supported/);
    expect(summarizeGpuUnavailability(report)).toMatch(
      /cannot be compiled to a GPU shader/,
    );
  });

  it("reports a metric refusal ahead of the shader message", () => {
    const sdcpn = sirModel.petriNetDefinition;
    const { artifacts } = compileHirArtifacts(sdcpn, undefined, {
      includeHir: true,
    });
    const report = analyzeCompilation({
      sdcpn,
      artifacts,
      metricSpecs: [
        {
          id: "firings",
          label: "Infections",
          kind: "transitionFiringCount",
          transitionId: sdcpn.transitions[0]!.id,
        },
      ],
    });

    // The net itself compiles fine, so only the metric stands in the way.
    expect(report.shaderFailure).toBeNull();
    expect(summarizeGpuUnavailability(report)).toBe(report.metricFailure);
  });
});
