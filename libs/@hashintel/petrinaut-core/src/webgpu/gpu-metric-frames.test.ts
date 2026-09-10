import { describe, expect, it } from "vitest";

import { productionMachines } from "../examples/production-with-machine-failure";
import { sirModel } from "../examples/sir-model";
import { compileHirArtifacts } from "../hir";
import { toGpuMetricFrames, toGpuMetricSpecs } from "./gpu-metric-frames";
import { decodeHistogramFrames } from "./runner/histogram-frames";

import type {
  MonteCarloExpressionMetricSpec,
  MonteCarloMetricSpec,
} from "../simulation/monte-carlo/metrics";
import type { SDCPN } from "../types/sdcpn";
import type { GpuHistogramFrame } from "./runner";

const sir = sirModel.petriNetDefinition;
const production = productionMachines.petriNetDefinition;

/** One of the net's model metrics as the expression spec an experiment sends. */
const modelMetricSpec = (
  sdcpn: SDCPN,
  metricId: string,
  overrides: Partial<MonteCarloExpressionMetricSpec> = {},
): MonteCarloExpressionMetricSpec => {
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
    ...overrides,
  };
};

const susceptibleCount: MonteCarloMetricSpec = {
  kind: "placeTokenCountMean",
  id: "susceptible",
  label: "Susceptible",
  placeId: sir.places[0]!.id,
};

const infectionFirings: MonteCarloMetricSpec = {
  kind: "transitionFiringCount",
  id: "infections",
  label: "Infections",
  transitionId: sir.transitions[0]!.id,
};

describe("toGpuMetricSpecs", () => {
  it("accepts a place count as an integer metric", () => {
    expect(toGpuMetricSpecs([susceptibleCount], { sdcpn: sir })).toStrictEqual({
      ok: true,
      metrics: [
        {
          id: "susceptible",
          integer: true,
          sample: { kind: "placeCount", placeId: sir.places[0]!.id },
        },
      ],
    });
  });

  it("accepts a translatable expression metric, classified by its return type", () => {
    // SIR's Infected Fraction divides two counts, so its samples are real.
    const spec = modelMetricSpec(sir, "metric__infected_fraction");

    const result = toGpuMetricSpecs([spec], { sdcpn: sir });

    expect(result).toStrictEqual({
      ok: true,
      metrics: [
        {
          id: "metric__infected_fraction",
          integer: false,
          sample: { kind: "expression", hir: spec.artifact.hir },
        },
      ],
    });
  });

  it("refuses an expression the shader cannot translate and names the construct", () => {
    const result = toGpuMetricSpecs(
      [modelMetricSpec(production, "metric__average_machine_damage")],
      { sdcpn: production },
    );

    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toMatch(
      /^Metric "Average machine damage" cannot be translated to WGSL: `\.concat` joins the tokens of two places, which the shader reads one place at a time\.$/,
    );
  });

  it("refuses an expression compiled without its HIR tree", () => {
    const spec = modelMetricSpec(sir, "metric__infected_fraction");
    const { hir: _stripped, ...artifact } = spec.artifact;

    const result = toGpuMetricSpecs([{ ...spec, artifact }], { sdcpn: sir });

    expect(result).toStrictEqual({
      ok: false,
      reason:
        'Metric "Infected Fraction" was compiled without its HIR tree, which the GPU shader is generated from; compile with includeHir.',
    });
  });

  it("refuses transition firings", () => {
    expect(toGpuMetricSpecs([infectionFirings], { sdcpn: sir })).toStrictEqual({
      ok: false,
      reason:
        'The GPU backend cannot measure transition firings; metric "Infections" counts them.',
    });
  });

  it("refuses a time aggregation before trying to translate", () => {
    const result = toGpuMetricSpecs(
      [
        modelMetricSpec(sir, "metric__infected_fraction", {
          aggregateTime: "max",
        }),
      ],
      { sdcpn: sir },
    );

    expect(result).toStrictEqual({
      ok: false,
      reason:
        'The GPU backend does not aggregate metrics over time yet; metric "Infected Fraction" uses a time aggregation.',
    });
  });

  it("stops at the first refusal", () => {
    const result = toGpuMetricSpecs(
      [
        susceptibleCount,
        infectionFirings,
        modelMetricSpec(production, "metric__average_machine_damage"),
      ],
      { sdcpn: sir },
    );

    expect(result.ok ? "" : result.reason).toMatch(/transition firings/);
  });
});

describe("toGpuMetricFrames", () => {
  it("carries a real window's centre labels and bin extent into a distribution frame", () => {
    // Four bins of width 0.25 over [0, 1): the decoder labels each by its
    // centre and the frame keeps that labelling and the half-stride reach.
    const [histogram] = decodeHistogramFrames({
      data: Uint32Array.from([1, 0, 2, 1]),
      firstFrame: 3,
      frameCount: 1,
      metricIds: ["metric__infected_fraction"],
      histogramBins: 4,
      windows: [{ lo: 0, stride: 0.25, integer: false }],
    });

    const frames = toGpuMetricFrames(
      [histogram!],
      [
        modelMetricSpec(sir, "metric__infected_fraction", {
          runOutput: { type: "distribution" },
        }),
      ],
      0.5,
    );

    expect(frames).toStrictEqual([
      {
        metricId: "metric__infected_fraction",
        label: "Infected Fraction",
        outputType: "distribution",
        frameNumber: 3,
        time: 1.5,
        value: null,
        frameValue: null,
        timeValue: null,
        bins: [
          [0.125, 1],
          [0.625, 2],
          [0.875, 1],
        ],
        binExtent: { below: 0.125, above: 0.125 },
        runSampleCount: 4,
        timeSampleCount: 4,
      },
    ]);
  });

  it("reduces a scalar frame's run aggregate from integer bins", () => {
    const histogram: GpuHistogramFrame = {
      frameNumber: 2,
      metricId: "susceptible",
      bins: [
        [3, 2],
        [5, 1],
      ],
      binExtent: { below: 0.5, above: 0.5 },
      sampleCount: 3,
    };

    const frames = toGpuMetricFrames([histogram], [susceptibleCount], 0.1);

    expect(frames).toStrictEqual([
      {
        metricId: "susceptible",
        label: "Susceptible",
        outputType: "scalar",
        frameNumber: 2,
        time: 0.2,
        value: 11 / 3,
        frameValue: 11 / 3,
        timeValue: null,
        runSampleCount: 3,
        timeSampleCount: 3,
        runAggregate: { count: 3, sum: 11, min: 3, max: 5, last: 5 },
        aggregateRuns: "mean",
        aggregateTime: "none",
      },
    ]);
  });

  it("maps an expression spec's scalar frame and drops histograms no served spec names", () => {
    const histogram = (metricId: string): GpuHistogramFrame => ({
      frameNumber: 0,
      metricId,
      bins: [[1, 4]],
      binExtent: { below: 0.5, above: 0.5 },
      sampleCount: 4,
    });

    const frames = toGpuMetricFrames(
      [
        histogram("metric__infected_fraction"),
        histogram("infections"),
        histogram("unknown"),
      ],
      [
        modelMetricSpec(sir, "metric__infected_fraction", {
          aggregateRuns: "sum",
        }),
        infectionFirings,
      ],
      0.1,
    );

    expect(frames.map((frame) => frame.metricId)).toStrictEqual([
      "metric__infected_fraction",
    ]);
    expect(frames[0]).toMatchObject({
      outputType: "scalar",
      value: 4,
      aggregateRuns: "sum",
    });
  });
});
