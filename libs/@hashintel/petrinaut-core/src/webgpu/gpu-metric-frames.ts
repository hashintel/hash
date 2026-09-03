/**
 * Translating between metric specs and the GPU's on-device histograms.
 *
 * Shared by the compilation report and the experiment handle
 * (`gpu-experiment-handle.ts`) so a spec accepted by one is accepted by the
 * other, and both produce byte-identical frames.
 */
import type {
  MonteCarloMetricSpec,
  MonteCarloUserDefinedMetricFrame,
} from "../simulation/monte-carlo/metrics";
import type { GpuMetricSpec } from "./compile-net-shader";
import type { GpuHistogramFrame } from "./runner";

export type GpuMetricSpecsResult =
  | { ok: true; metrics: GpuMetricSpec[] }
  | { ok: false; reason: string };

/**
 * Validates metric specs against what the shader can measure.
 *
 * Only place-token-count metrics are served: the shader samples a place's count
 * into a histogram. Expression metrics would need the metric HIR surface
 * compiled to WGSL too, and transition-firing metrics need a different sample
 * source. Both are follow-on work, and a spec asking for them is refused so the
 * caller falls back to the CPU rather than being shown a different measurement
 * than it asked for.
 */
export function toGpuMetricSpecs(
  specs: readonly MonteCarloMetricSpec[],
): GpuMetricSpecsResult {
  const metrics: GpuMetricSpec[] = [];

  for (const spec of specs) {
    if (spec.kind !== "placeTokenCountMean") {
      return {
        ok: false,
        reason: `The GPU backend can only measure place token counts; metric "${spec.label}" is a ${spec.kind} metric instead.`,
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
    metrics.push({ id: spec.id, placeId: spec.placeId });
  }

  return { ok: true, metrics };
}

/**
 * Rebuilds one metric frame from a GPU histogram.
 *
 * Distribution metrics use the bins directly. Scalar metrics reduce from the
 * histogram, which is exact for mean/sum/min/max because a histogram of integer
 * counts loses nothing the run-axis aggregation would have used.
 */
function toMetricFrame(
  histogram: GpuHistogramFrame,
  spec: Extract<MonteCarloMetricSpec, { kind: "placeTokenCountMean" }>,
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
      spec.kind === "placeTokenCountMean" ? [[spec.id, spec] as const] : [],
    ),
  );

  return histograms.flatMap((histogram) => {
    const spec = specById.get(histogram.metricId);
    return spec ? [toMetricFrame(histogram, spec, dt)] : [];
  });
}
