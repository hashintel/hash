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

import type { GpuNetProfile } from "../eligibility";

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
  /** Place whose token count is sampled. */
  placeId: string;
};

/**
 * Histogram bins per metric per frame, for one compiled shader.
 *
 * One bin per integer token count, so the bin count is the largest count the
 * charts can distinguish plus one saturating top bin. Two inputs size it:
 *
 * - The workgroup-storage budget: `local_hist` holds `bins × metricCount`
 *   u32 atomics, so more metrics mean fewer bins. Up to four metrics get the
 *   full `GPU_HISTOGRAM_MAX_BINS`; a fixed 256 both wasted the budget below
 *   five metrics and exceeded it (failing pipeline creation) above sixteen.
 * - The sampled places' count ceiling, when every sampled place has one:
 *   counts past the ceiling cannot occur, so bins past it would only slow
 *   the per-frame zero/merge loops.
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
 * unbounded.
 */
export const sampledCountCeiling = (
  metrics: readonly GpuMetricSpec[],
  profile: GpuNetProfile,
  placeIndexById: ReadonlyMap<string, number>,
): number | null => {
  let ceiling = 0;
  for (const metric of metrics) {
    const place = profile.places[placeIndexById.get(metric.placeId) ?? -1];
    const placeCeiling = place === undefined ? null : placeCountCeiling(place);
    if (placeCeiling === null) {
      return null;
    }
    ceiling = Math.max(ceiling, placeCeiling);
  }
  return ceiling;
};

/**
 * Each metric's window as uniform fields: bin i covers counts
 * [lo + i*stride, lo + (i+1)*stride). Uniforms, not constants, so the host
 * recalibrates the window between attempts without recompiling.
 */
export const histogramWindowUniformLines = (metricCount: number): string[] =>
  Array.from({ length: metricCount }, (_, metricIndex) => [
    `  m${metricIndex}_lo: u32,`,
    `  m${metricIndex}_stride: u32,`,
  ]).flat();

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
 * Emits the end-of-frame sampling: zero the workgroup histogram, bin each
 * live run's counts, then flush to the global histogram and range.
 */
export const emitFrameHistograms = (
  push: (line: string) => void,
  options: {
    metrics: readonly GpuMetricSpec[];
    placeIndexById: ReadonlyMap<string, number>;
    bins: number;
    workgroupSize: number;
  },
): void => {
  const { metrics, placeIndexById, bins, workgroupSize } = options;
  if (metrics.length === 0) {
    return;
  }
  const totalBins = bins * metrics.length;
  push(`    // per-frame histograms, reduced in workgroup memory`);
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
    const placeIndex = placeIndexById.get(metric.placeId);
    if (placeIndex === undefined) {
      throw new WgslBailError(
        `metric \`${metric.id}\` references unknown place ${metric.placeId}`,
      );
    }
    // Samples only runs still active after this frame's step: the CPU metric
    // default excludes a run in the frame it deadlocks or completes, because
    // its status flips before the observation. A sample outside the window
    // clamps into the edge bin and is counted as an escape, which triggers a
    // recalibrated re-run — the clamped picture is only ever an intermediate.
    push(`    if (running && status == 0u) {`);
    push(`      let c${metricIndex} = counts[${placeIndex}u];`);
    push(`      atomicMin(&local_min[${metricIndex}u], c${metricIndex});`);
    push(`      atomicMax(&local_max[${metricIndex}u], c${metricIndex});`);
    push(`      var bin${metricIndex}: u32;`);
    push(`      if (c${metricIndex} < config.m${metricIndex}_lo) {`);
    push(`        atomicAdd(&range[${metricIndex * 4 + 2}u], 1u);`);
    push(`        bin${metricIndex} = 0u;`);
    push(`      } else {`);
    push(
      `        bin${metricIndex} = (c${metricIndex} - config.m${metricIndex}_lo) / config.m${metricIndex}_stride;`,
    );
    push(`        if (bin${metricIndex} >= HIST_BINS) {`);
    push(`          atomicAdd(&range[${metricIndex * 4 + 3}u], 1u);`);
    push(`          bin${metricIndex} = HIST_BINS - 1u;`);
    push(`        }`);
    push(`      }`);
    push(
      `      atomicAdd(&local_hist[${metricIndex * bins}u + bin${metricIndex}], 1u);`,
    );
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
