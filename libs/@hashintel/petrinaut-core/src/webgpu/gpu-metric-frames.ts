/**
 * Translating between metric specs and the GPU's on-device histograms.
 *
 * Shared by the compilation report, the editor's GPU switch and the experiment
 * handle (`gpu-experiment-handle.ts`) so a spec accepted by one is accepted by
 * the other, and both produce byte-identical frames.
 *
 * What the shader serves: place-token-count metrics, and expression metrics
 * whose body `tryTranslateMetric` can emit as WGSL — counts, parameters,
 * arithmetic, conditionals, `tokens.length` and one place's `tokens.reduce`
 * with a numeric or boolean accumulator. A body using `.concat`, indexing a
 * token by position, a `string` or `uuid` attribute, a distribution or a
 * non-finite constant is refused with the emitter's reason, and so is any
 * metric with a time aggregation and every transition-firing metric. Across
 * the bundled examples' 30 model metrics, 28 translate; the two `.concat`
 * averages stay on the CPU.
 *
 * Where a GPU frame differs from the CPU's: the shader samples the runs still
 * active in a frame, whatever `sampleRuns` asks (the spec is accepted and the
 * setting ignored), so on a terminating net late frames weight the
 * longest-lived runs. A non-finite sample halts its run on the device and the
 * handle fails the experiment after the attempt, where the CPU throws at the
 * frame. Scalar aggregates are reduced from bin labels — exact for integer
 * metrics at stride 1, quantised to the labels otherwise — and `last` is the
 * highest bin label rather than the highest run index's sample.
 */
import { tryTranslateMetric } from "./try-translate-metric";

import type { PetrinautExtensionSettings } from "../extensions";
import type {
  MonteCarloMetricSpec,
  MonteCarloUserDefinedMetricFrame,
} from "../simulation/monte-carlo/metrics";
import type { SDCPN } from "../types/sdcpn";
import type { GpuMetricSpec } from "./compile-net-shader";
import type { GpuHistogramFrame } from "./runner";

/** The net an expression metric is translated against. */
export type GpuMetricNet = {
  sdcpn: SDCPN;
  extensions?: PetrinautExtensionSettings;
  /** Resolved parameter values; defaults to the net's declared defaults. */
  parameterValues?: Readonly<Record<string, number | boolean>>;
};

export type GpuMetricSpecsResult =
  | { ok: true; metrics: GpuMetricSpec[] }
  | { ok: false; reason: string };

/**
 * Validates metric specs against what the shader can measure.
 *
 * Accepts place-count metrics and translatable expression metrics; the first
 * refusal wins, so the caller falls back to the CPU with one reason rather
 * than being shown a different measurement than it asked for.
 */
export function toGpuMetricSpecs(
  specs: readonly MonteCarloMetricSpec[],
  net: GpuMetricNet,
): GpuMetricSpecsResult {
  const metrics: GpuMetricSpec[] = [];

  for (const spec of specs) {
    if (spec.kind === "transitionFiringCount") {
      return {
        ok: false,
        reason: `The GPU backend cannot measure transition firings; metric "${spec.label}" counts them.`,
      };
    }
    if (spec.aggregateTime !== undefined && spec.aggregateTime !== "none") {
      // Returning `aggregateTime: "none"` would make the chart look right while
      // plotting per-frame values where a running aggregate was asked for.
      return {
        ok: false,
        reason: `The GPU backend does not aggregate metrics over time yet; metric "${spec.label}" uses a time aggregation.`,
      };
    }
    if (spec.kind === "placeTokenCountMean") {
      metrics.push({
        id: spec.id,
        integer: true,
        sample: { kind: "placeCount", placeId: spec.placeId },
      });
      continue;
    }

    const hir = spec.artifact.hir;
    if (hir === undefined) {
      return {
        ok: false,
        reason: `Metric "${spec.label}" was compiled without its HIR tree, which the GPU shader is generated from; compile with includeHir.`,
      };
    }
    const translation = tryTranslateMetric({
      sdcpn: net.sdcpn,
      hir,
      extensions: net.extensions,
      parameterValues: net.parameterValues,
    });
    if (!translation.translatable) {
      return {
        ok: false,
        reason: `Metric "${spec.label}" cannot be translated to WGSL: ${translation.reason}.`,
      };
    }
    metrics.push({
      id: spec.id,
      integer: translation.integer,
      sample: { kind: "expression", hir },
    });
  }

  return { ok: true, metrics };
}

/** A spec the shader samples: everything but a transition-firing metric. */
type GpuServedMetricSpec = Exclude<
  MonteCarloMetricSpec,
  { kind: "transitionFiringCount" }
>;

/**
 * Rebuilds one metric frame from a GPU histogram.
 *
 * Distribution metrics use the bins directly. Scalar metrics reduce
 * mean/sum/min/max from the bin labels, which is exact for integer metrics at
 * stride 1 and otherwise quantised to the labels.
 */
function toMetricFrame(
  histogram: GpuHistogramFrame,
  spec: GpuServedMetricSpec,
  dt: number,
): MonteCarloUserDefinedMetricFrame {
  const time = histogram.frameNumber * dt;

  if (spec.runOutput?.type === "distribution") {
    return {
      metricId: spec.id,
      label: spec.label,
      outputType: "distribution",
      frameNumber: histogram.frameNumber,
      time,
      value: null,
      frameValue: null,
      timeValue: null,
      bins: histogram.bins,
      binExtent: histogram.binExtent,
      runSampleCount: histogram.sampleCount,
      timeSampleCount: histogram.sampleCount,
    };
  }

  let count = 0;
  let sum = 0;
  let min: number | null = null;
  let max: number | null = null;
  let last: number | null = null;
  for (const [value, frequency] of histogram.bins) {
    count += frequency;
    sum += value * frequency;
    min = min === null ? value : Math.min(min, value);
    max = max === null ? value : Math.max(max, value);
    last = value;
  }

  // `aggregateRuns` only exists on the scalar variant of `runOutput`.
  const aggregateRuns =
    (spec.runOutput?.type === "scalar"
      ? spec.runOutput.aggregateRuns
      : undefined) ??
    spec.aggregateRuns ??
    "mean";
  const frameValue =
    count === 0
      ? null
      : aggregateRuns === "mean"
        ? sum / count
        : aggregateRuns === "sum"
          ? sum
          : aggregateRuns === "min"
            ? min
            : aggregateRuns === "max"
              ? max
              : last;

  return {
    metricId: spec.id,
    label: spec.label,
    outputType: "scalar",
    frameNumber: histogram.frameNumber,
    time,
    value: frameValue,
    frameValue,
    // Time aggregation is refused by `toGpuMetricSpecs`, so it is always absent.
    timeValue: null,
    runSampleCount: count,
    timeSampleCount: count,
    // Carried so a GPU frame merges through the same monoid as a CPU frame.
    runAggregate: { count, sum, min, max, last },
    aggregateRuns,
    aggregateTime: "none",
  };
}

/**
 * Converts every histogram frame, in frame order.
 *
 * Histograms whose metric id is not in `specs` are dropped rather than guessed
 * at; that can only happen if the shader and the spec list disagree, which
 * would be a bug worth failing quietly over rather than mislabelling.
 */
export function toGpuMetricFrames(
  histograms: readonly GpuHistogramFrame[],
  specs: readonly MonteCarloMetricSpec[],
  dt: number,
): MonteCarloUserDefinedMetricFrame[] {
  const specById = new Map(
    specs.flatMap((spec) =>
      spec.kind === "transitionFiringCount" ? [] : [[spec.id, spec] as const],
    ),
  );

  return histograms.flatMap((histogram) => {
    const spec = specById.get(histogram.metricId);
    return spec ? [toMetricFrame(histogram, spec, dt)] : [];
  });
}
