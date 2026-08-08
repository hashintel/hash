import { describe, expect, it } from "vitest";

import { sirModel } from "../examples/sir-model";
import { compileHirArtifacts } from "../hir";
import { runGpuMonteCarloExperiment } from "./gpu-experiment";

import type { MonteCarloMetricSpec } from "../simulation/monte-carlo/metrics";

const sir = sirModel.petriNetDefinition;

const baseConfig = {
  sdcpn: sir,
  hirArtifacts: compileHirArtifacts(sir, undefined, { includeHir: true })
    .artifacts,
  initialMarking: {
    place__susceptible: 100,
    place__infected: 5,
    place__recovered: 0,
  },
  parameterValues: {},
  seed: 1,
  dt: 0.1,
  maxTime: 10,
  runCount: 64,
};

/**
 * These cover the refusals that happen before a device is touched, so they run
 * without a GPU. The paths that need one are exercised by
 * `benchmarks/webgpu-vs-cpu.html` against a real adapter.
 */
describe("runGpuMonteCarloExperiment gating", () => {
  it("refuses a metric kind it cannot measure rather than substituting one", async () => {
    const metricSpecs: MonteCarloMetricSpec[] = [
      {
        kind: "transitionFiringCount",
        id: "f",
        label: "Firings",
        transitionId: "transition__infection",
      },
    ];

    const outcome = await runGpuMonteCarloExperiment({
      ...baseConfig,
      metricSpecs,
    });

    expect(outcome.ran).toBe(false);
    if (outcome.ran) return;
    expect(outcome.reason).toContain("can only measure place token counts");
  });

  it("refuses time aggregation rather than reporting it as absent", async () => {
    // Silently returning `aggregateTime: "none"` would make the chart look
    // right while showing per-frame values where the user asked for a running
    // aggregate.
    const metricSpecs: MonteCarloMetricSpec[] = [
      {
        kind: "placeTokenCountMean",
        id: "i",
        label: "I",
        placeId: "place__infected",
        aggregateTime: "mean",
      },
    ];

    const outcome = await runGpuMonteCarloExperiment({
      ...baseConfig,
      metricSpecs,
    });

    expect(outcome.ran).toBe(false);
    if (outcome.ran) return;
    expect(outcome.reason).toContain("does not aggregate metrics over time");
  });

  it("names the offending place when a typed place has no capacity", async () => {
    const typed = {
      ...sir,
      types: [
        {
          id: "c",
          name: "Item",
          iconSlug: "circle",
          displayColor: "#0f0",
          elements: [{ elementId: "v", name: "v", type: "real" as const }],
        },
      ],
      places: sir.places.map((place, index) =>
        index === 0 ? { ...place, colorId: "c" } : place,
      ),
    };

    const outcome = await runGpuMonteCarloExperiment({
      ...baseConfig,
      sdcpn: typed,
      hirArtifacts: compileHirArtifacts(typed, undefined, { includeHir: true })
        .artifacts,
      metricSpecs: [],
    });

    expect(outcome.ran).toBe(false);
    if (outcome.ran) return;
    // A reason that does not name the place is not actionable.
    expect(outcome.reason).toContain("Susceptible");
    expect(outcome.reason).toMatch(/capacity/i);
  });
});

/**
 * Metrics are reduced on the device into a histogram with one bin per integer
 * token count, and the shader clamps that index into range. A place holding more
 * tokens than there are bins therefore reads as the ceiling — a flat line where
 * the CPU shows a declining trajectory. Refusing beats reporting that.
 */
describe("histogram range gating", () => {
  const susceptibleMean: MonteCarloMetricSpec[] = [
    {
      kind: "placeTokenCountMean",
      id: "s",
      label: "Susceptible tokens",
      placeId: "place__susceptible",
    },
  ];

  it("refuses a net whose sampled place starts beyond the histogram's range", async () => {
    const outcome = await runGpuMonteCarloExperiment({
      ...baseConfig,
      // 1000 tokens against 256 bins: every sample lands in the top bin until the
      // count falls below it, which is exactly the flat-then-cliff artefact.
      initialMarking: {
        ...baseConfig.initialMarking,
        place__susceptible: 1000,
      },
      metricSpecs: susceptibleMean,
    });

    expect(outcome.ran).toBe(false);
    expect(outcome.ran ? "" : outcome.reason).toMatch(
      /starts with 1000 tokens.*256 bins/s,
    );
  });

  it("refuses at the ceiling, not one past it", async () => {
    // Bin indices run 0..255, so 256 tokens is already unrepresentable. Asserting
    // on the reason rather than on `ran`: with no GPU in this environment every
    // path ends up refusing, so `ran === false` would pass either way.
    const atCeiling = await runGpuMonteCarloExperiment({
      ...baseConfig,
      initialMarking: { ...baseConfig.initialMarking, place__susceptible: 256 },
      metricSpecs: susceptibleMean,
    });
    expect(atCeiling.ran ? "" : atCeiling.reason).toMatch(/histogram/);

    // 255 fits, so this must get past the range check — it then stops for want of
    // a GPU device, which is a different refusal.
    const belowCeiling = await runGpuMonteCarloExperiment({
      ...baseConfig,
      initialMarking: { ...baseConfig.initialMarking, place__susceptible: 255 },
      metricSpecs: susceptibleMean,
    });
    expect(belowCeiling.ran ? "" : belowCeiling.reason).not.toMatch(
      /histogram/,
    );
  });

  it("ignores places no metric samples", async () => {
    // `Recovered` accumulates well past the ceiling, but nothing measures it, so
    // it has no bearing on whether the histogram can represent the results.
    const outcome = await runGpuMonteCarloExperiment({
      ...baseConfig,
      initialMarking: { ...baseConfig.initialMarking, place__recovered: 5000 },
      metricSpecs: susceptibleMean,
    });

    expect(outcome.ran ? "" : outcome.reason).not.toMatch(/histogram/);
  });
});
