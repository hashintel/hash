/**
 * Metrics, reduced on the device into per-frame histograms.
 *
 * Shipping raw per-run samples back would be gigabytes for a large experiment
 * (600 frames × 1M runs × 4 B ≈ 2.4 GB); a histogram is under a megabyte.
 * Each frame's histogram is built in workgroup memory and flushed once —
 * measured at 2× the throughput of hitting global atomics directly, because
 * runs in a workgroup collide on the same bin constantly.
 */
import { placeCountCeiling } from "../eligibility";
import { WgslBailError } from "../emit-wgsl";
import { emitMetricSample } from "./metric-sample";

import type { HirFunction } from "../../hir/hir";
import type { MonteCarloUserDefinedMetricSampleRuns } from "../../simulation/monte-carlo/metrics";
import type { GpuNetProfile } from "../eligibility";
import type { WgslParameterValue, WgslValue } from "../emit-wgsl";

/** Most bins any shader allocates, however generous the budget. */
export const GPU_HISTOGRAM_MAX_BINS = 1024;

/**
 * `maxComputeWorkgroupStorageSize` every conformant WebGPU device supports.
 *
 * The per-workgroup histogram (`local_hist`) lives in workgroup storage, so
 * this budget is what bounds the bin count. `requestGpuDevice` asks only for
 * larger *buffer* limits, which leaves the created device at exactly this
 * default — so sizing against the baseline is sizing against the actual
 * device, and the shader stays device-independent and deterministic.
 */
export const GPU_BASELINE_WORKGROUP_STORAGE_BYTES = 16384;

export type GpuMetricSpec = {
  id: string;
  /** Every sample is a whole number, so bins keep exact integer labels. */
  integer: boolean;
  /**
   * Which runs a frame samples, read off the run's status word as the CPU
   * reads it off the run's status: `active` is a run still stepping,
   * `completed` one that reached the frame limit or deadlocked, `all` both.
   * A run halted by an error is never sampled.
   */
  sampleRuns: MonteCarloUserDefinedMetricSampleRuns;
  sample:
    /** A place's token count, read from `counts[]`. */
    | { kind: "placeCount"; placeId: string }
    /** A metric body over `state.places`, emitted per run per frame. */
    | { kind: "expression"; hir: HirFunction };
};

/**
 * Histogram bins per metric per frame, for one compiled shader.
 *
 * Bins are the values the charts can distinguish plus one saturating top bin;
 * an integer window spends one bin per whole number. Two inputs size it:
 *
 * - The workgroup-storage budget: `local_hist` holds `bins × metricCount`
 *   u32 atomics, so more metrics mean fewer bins. Up to four metrics get the
 *   full `GPU_HISTOGRAM_MAX_BINS`; a fixed 256 both wasted the budget below
 *   five metrics and exceeded it (failing pipeline creation) above sixteen.
 * - The sampled places' count ceiling, when every metric is a place count
 *   with one: counts past the ceiling cannot occur, so bins past it would
 *   only slow the per-frame zero/merge loops. An expression metric has no
 *   ceiling and takes the full budget.
 */
export function histogramBinCount(
  metricCount: number,
  sampledCountCeiling: number | null,
): number {
  // The observed-range reduction (`local_min`/`local_max`, one u32 atomic
  // of each per metric) shares the workgroup budget with `local_hist`.
  const metrics = Math.max(1, metricCount);
  const budget = Math.floor(
    (GPU_BASELINE_WORKGROUP_STORAGE_BYTES - 8 * metrics) / (4 * metrics),
  );
  const bins = Math.max(2, Math.min(GPU_HISTOGRAM_MAX_BINS, budget));
  if (sampledCountCeiling === null) {
    return bins;
  }
  return Math.max(2, Math.min(bins, sampledCountCeiling + 1));
}

/**
 * The largest count any sampled place can reach, or null when one is
 * unbounded or any metric is an expression.
 */
export const sampledCountCeiling = (
  metrics: readonly GpuMetricSpec[],
  profile: GpuNetProfile,
  placeIndexById: ReadonlyMap<string, number>,
): number | null => {
  let ceiling = 0;
  for (const metric of metrics) {
    if (metric.sample.kind === "expression") {
      return null;
    }
    const place =
      profile.places[placeIndexById.get(metric.sample.placeId) ?? -1];
    const placeCeiling = place === undefined ? null : placeCountCeiling(place);
    if (placeCeiling === null) {
      return null;
    }
    ceiling = Math.max(ceiling, placeCeiling);
  }
  return ceiling;
};

/**
 * Each metric's window as uniform fields: bin i covers values
 * [lo + i*stride, lo + (i+1)*stride). Uniforms, not constants, so the host
 * recalibrates the window between attempts without recompiling. Both are
 * f32 for every metric: an integer window's `lo` and `stride` are whole
 * numbers, exact in f32 below 2^24.
 */
export const histogramWindowUniformLines = (metricCount: number): string[] =>
  Array.from({ length: metricCount }, (_, metricIndex) => [
    `  m${metricIndex}_lo: f32,`,
    `  m${metricIndex}_stride: f32,`,
  ]).flat();

/**
 * The sampling helpers, emitted once after the prelude when the shader has
 * metrics. `HIST_BINS` is the module-scope constant `compile-net-shader.ts`
 * emits first, so the helpers are valid anywhere after it.
 */
export const histogramHelperLines = (metricCount: number): string[] =>
  metricCount === 0
    ? []
    : [
        `// f32 as u32 preserving order, so u32 atomicMin/atomicMax reduce a float range:`,
        `// positives set the sign bit, negatives flip every bit.`,
        `fn f32_order_key(v: f32) -> u32 {`,
        `  let bits = bitcast<u32>(v);`,
        `  return select(~bits, bits | 0x80000000u, (bits & 0x80000000u) == 0u);`,
        `}`,
        ``,
        `// Bin of \`v\` in a window: -1 below it, HIST_BINS at or above its top edge.`,
        `// f32 division carries up to 2.5 ULP, so the quotient is settled against the`,
        `// edges the host labels by; both products are exact for integer windows below`,
        `// 2^24, which keeps every place count in the bin the u32 path put it in.`,
        `fn window_bin(v: f32, lo: f32, stride: f32) -> i32 {`,
        `  let t = (v - lo) / stride;`,
        `  if (t < -1.0) { return -1; }`,
        `  if (t >= f32(HIST_BINS) + 1.0) { return i32(HIST_BINS); }`,
        `  var bin = i32(floor(t));`,
        `  if (lo + f32(bin) * stride > v) {`,
        `    bin = bin - 1;`,
        `  } else if (lo + f32(bin + 1) * stride <= v) {`,
        `    bin = bin + 1;`,
        `  }`,
        `  return clamp(bin, -1, i32(HIST_BINS));`,
        `}`,
        ``,
      ];

/**
 * Per metric: [observed min, observed max, escapes below, escapes above].
 * Min/max drive window recalibration; the escape counters say whether any
 * sample was clamped into an edge bin.
 */
export const observedRangeBindingLines = (metricCount: number): string[] =>
  metricCount === 0
    ? []
    : [
        `@group(0) @binding(5) var<storage, read_write> range: array<atomic<u32>>;`,
      ];

/** The workgroup-reduced histogram and observed range, flushed once per frame. */
export const workgroupHistogramLines = (
  metricCount: number,
  bins: number,
): string[] =>
  metricCount === 0
    ? []
    : [
        `var<workgroup> local_hist: array<atomic<u32>, ${bins * metricCount}>;`,
        `var<workgroup> local_min: array<atomic<u32>, ${metricCount}>;`,
        `var<workgroup> local_max: array<atomic<u32>, ${metricCount}>;`,
        "",
      ];

/**
 * The status test a metric's `sampleRuns` selects. Status 0 is a run still
 * stepping; 1 (deadlocked) and 2 (reached the frame limit) are both `complete`
 * on the CPU; 3 and above are halted runs, which no mode samples.
 */
const sampledStatusCondition = (
  sampleRuns: MonteCarloUserDefinedMetricSampleRuns,
): string => {
  switch (sampleRuns) {
    case "active":
      return "status == 0u";
    case "completed":
      return "(status == 1u || status == 2u)";
    case "notErrored":
    case "all":
      return "status <= 2u";
  }
};

/**
 * Emits the start-of-frame sampling: zero the workgroup histogram, sample each
 * run the metric asks for as f32 and bin it, then flush to the global
 * histogram and range. Sampling precedes the step, so row `f` holds the state
 * after `f` steps and row 0 is the initial marking. The host dispatches one
 * iteration past the frame limit, in which nothing runs: it writes row
 * `frame_limit`, the CPU's final frame, where every run is complete and only a
 * metric sampling completed runs has anything to count.
 *
 * A finished run's registers and token slots hold its final state, since
 * every write is gated on `running`, so sampling it later is the same read as
 * sampling a live run: `active` takes `status == 0u`, `completed` the two
 * finished statuses, `all` both. A run halted by an overflow or a non-finite
 * sample (status 3 and above) is never sampled, as the CPU skips an errored
 * run.
 *
 * One path for every metric: the sample is an f32 — a place count cast from
 * its register, or a metric body emitted over `metricState` — its observed
 * range travels as order-preserving u32 keys through the existing min/max
 * atomics, and `window_bin` settles the bin against the window's exact edges.
 * A non-finite sample halts the run with `status = 4u + metric`, so the host
 * can fail the experiment naming the metric, as the CPU evaluator does when
 * it throws.
 */
export const emitFrameHistograms = (
  push: (line: string) => void,
  options: {
    metrics: readonly GpuMetricSpec[];
    placeIndexById: ReadonlyMap<string, number>;
    bins: number;
    workgroupSize: number;
    /** `state` for expression metrics, bound to the real layout. */
    metricState: WgslValue;
    parameterValues: Readonly<Record<string, WgslParameterValue>>;
  },
): void => {
  const {
    metrics,
    placeIndexById,
    bins,
    workgroupSize,
    metricState,
    parameterValues,
  } = options;
  if (metrics.length === 0) {
    return;
  }
  const totalBins = bins * metrics.length;
  push(
    `    // per-frame histograms, reduced in workgroup memory: the state after`,
  );
  push(
    `    // \`absolute_frame\` steps, so row f is frame f and row 0 is the initial`,
  );
  push(
    `    // marking. Each metric samples the runs its \`sampleRuns\` names by status:`,
  );
  push(
    `    // 0 active, 1 deadlocked, 2 complete; a halted run is never sampled.`,
  );
  push(
    `    for (var b: u32 = lid; b < ${totalBins}u; b = b + ${workgroupSize}u) {`,
  );
  push(`      atomicStore(&local_hist[b], 0u);`);
  push(`    }`);
  push(
    `    for (var m: u32 = lid; m < ${metrics.length}u; m = m + ${workgroupSize}u) {`,
  );
  push(`      atomicStore(&local_min[m], 0xffffffffu);`);
  push(`      atomicStore(&local_max[m], 0u);`);
  push(`    }`);
  push(`    workgroupBarrier();`);
  for (const [metricIndex, metric] of metrics.entries()) {
    const value = `v${metricIndex}`;
    const key = `k${metricIndex}`;
    const bin = `b${metricIndex}`;
    // The previous step set the status, so a run is excluded from `active`
    // in the frame it deadlocks or completes, as on the CPU. A sample outside
    // the window clamps into the edge bin and is counted as an escape, which
    // triggers a recalibrated re-run — the clamped picture is only ever an
    // intermediate.
    push(`    if (in_range && ${sampledStatusCondition(metric.sampleRuns)}) {`);
    if (metric.sample.kind === "placeCount") {
      const placeIndex = placeIndexById.get(metric.sample.placeId);
      if (placeIndex === undefined) {
        throw new WgslBailError(
          `metric \`${metric.id}\` references unknown place ${metric.sample.placeId}`,
        );
      }
      push(`      let ${value}: f32 = f32(counts[${placeIndex}u]);`);
    } else {
      // Each metric's temporaries carry their own scope, so two metrics
      // binding the same `const` name declare distinct identifiers.
      const sample = emitMetricSample(metric.sample.hir, {
        state: metricState,
        parameterValues,
        identifierScope: `m${metricIndex}_`,
      });
      for (const statement of sample.statements) {
        push(`      ${statement}`);
      }
      push(`      let ${value}: f32 = ${sample.code};`);
    }
    push(`      if ((bitcast<u32>(${value}) & 0x7f800000u) == 0x7f800000u) {`);
    push(
      `        // NaN or an infinity: the CPU evaluator throws here, so the run halts`,
    );
    push(`        // and the host fails the experiment naming the metric.`);
    push(`        status = ${4 + metricIndex}u;`);
    push(`      } else {`);
    push(`        let ${key} = f32_order_key(${value});`);
    push(`        atomicMin(&local_min[${metricIndex}u], ${key});`);
    push(`        atomicMax(&local_max[${metricIndex}u], ${key});`);
    push(
      `        let ${bin} = window_bin(${value}, config.m${metricIndex}_lo, config.m${metricIndex}_stride);`,
    );
    push(`        if (${bin} < 0) {`);
    push(`          atomicAdd(&range[${metricIndex * 4 + 2}u], 1u);`);
    push(`          atomicAdd(&local_hist[${metricIndex * bins}u], 1u);`);
    push(`        } else if (${bin} >= i32(HIST_BINS)) {`);
    push(`          atomicAdd(&range[${metricIndex * 4 + 3}u], 1u);`);
    push(
      `          atomicAdd(&local_hist[${metricIndex * bins}u + HIST_BINS - 1u], 1u);`,
    );
    push(`        } else {`);
    push(
      `          atomicAdd(&local_hist[${metricIndex * bins}u + u32(${bin})], 1u);`,
    );
    push(`        }`);
    push(`      }`);
    push(`    }`);
  }
  push(`    workgroupBarrier();`);
  push(
    `    for (var b: u32 = lid; b < ${totalBins}u; b = b + ${workgroupSize}u) {`,
  );
  push(`      let v = atomicLoad(&local_hist[b]);`);
  push(`      if (v > 0u) {`);
  push(`        atomicAdd(&hist[absolute_frame * ${totalBins}u + b], v);`);
  push(`      }`);
  push(`    }`);
  push(
    `    for (var m: u32 = lid; m < ${metrics.length}u; m = m + ${workgroupSize}u) {`,
  );
  push(`      let lo = atomicLoad(&local_min[m]);`);
  push(`      if (lo != 0xffffffffu) {`);
  push(`        atomicMin(&range[m * 4u], lo);`);
  push(`        atomicMax(&range[m * 4u + 1u], atomicLoad(&local_max[m]));`);
  push(`      }`);
  push(`    }`);
  push(`    workgroupBarrier();`);
};
