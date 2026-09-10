/**
 * Histogram windows: which value range each metric's bins cover.
 *
 * Bins used to be zero-anchored — bin `i` meant count `i` — which coupled the
 * representable range to the bin budget: a place living in [1000, 1200]
 * wasted a thousand bins and a count past the budget clamped into the top
 * bin, surfacing as a warning the user could do nothing about. A window maps
 * bin `i` to the value `lo + i × stride` instead, and the window is a
 * *uniform*, so moving it needs no shader recompile.
 *
 * The window is planned, observed, and replanned:
 *
 * 1. The first attempt is exact for a ceiling-bounded place count; any other
 *    metric gets a blind `lo 0, stride 1` window, which the handle always
 *    probes before the full run.
 * 2. The shader tracks each metric's observed min/max on the device — as
 *    order-preserving u32 keys, so the u32 atomics reduce floats — and counts
 *    values that escaped the window (clamped into an edge bin).
 * 3. Any escape recalibrates: the handle replans from the observed range and
 *    re-runs. Seeds derive from absolute run indices, so a re-run reproduces
 *    the same trajectories and the observed range is exact — one re-run
 *    always converges.
 *
 * Pure and separate from the handle so the arithmetic is unit-testable.
 */

export type MetricWindow = {
  /** Value at the first bin's lower edge. */
  lo: number;
  /**
   * Values per bin: an integer ≥ 1 for integer windows, any positive f32
   * otherwise.
   */
  stride: number;
  /**
   * Whether samples are whole numbers: integer windows label a bin by its
   * middle integer, real ones by its centre.
   */
  integer: boolean;
};

/** What the device observed for one metric across every run and frame. */
export type ObservedMetricRange = {
  /**
   * Smallest and largest sampled value, decoded from the device's order keys;
   * `min > max` (±Infinity) means no samples.
   */
  min: number;
  max: number;
  /** Samples clamped into an edge bin because they fell outside the window. */
  below: number;
  above: number;
};

/** What window planning knows about one metric before any run. */
export type MetricWindowInput = {
  integer: boolean;
  /**
   * Largest value the metric can reach, or null. Only a declared place
   * capacity provides one; it makes the window exact and escape-free by
   * construction.
   */
  ceiling: number | null;
};

const spanStride = (lo: number, hi: number, bins: number): number =>
  Math.max(1, Math.ceil((hi - lo + 1) / bins));

/**
 * First-attempt windows: exact for ceiling-bounded metrics, blind otherwise.
 * A blind window is always probed, and the probe's observed range replans it
 * whatever the blind window clamped — range tracking is independent of the
 * window.
 */
export function planInitialWindows(
  inputs: readonly MetricWindowInput[],
  bins: number,
): MetricWindow[] {
  return inputs.map(({ integer, ceiling }) =>
    ceiling === null
      ? { lo: 0, stride: 1, integer }
      : { lo: 0, stride: spanStride(0, ceiling, bins), integer: true },
  );
}

/**
 * Windows replanned from what a run observed, with margin.
 *
 * A probe's extremes understate a larger run's (more runs, wider tails), so
 * `marginFraction` widens the observed span on both sides; the escape
 * counters catch an undershoot and trigger one more calibration. A metric
 * the run never sampled (`min > max`) keeps its previous window. `lo` clamps
 * at zero only when no negative value was observed, so a count metric never
 * spends bins below zero and a signed metric keeps its margin.
 */
export function windowsFromObserved(
  observed: readonly ObservedMetricRange[],
  previous: readonly MetricWindow[],
  bins: number,
  marginFraction: number,
): MetricWindow[] {
  return observed.map((range, index) => {
    const fallback = previous[index] ?? { lo: 0, stride: 1, integer: true };
    if (range.min > range.max) {
      return fallback;
    }
    if (fallback.integer) {
      const margin = Math.max(
        2,
        Math.ceil((range.max - range.min + 1) * marginFraction),
      );
      const lo =
        range.min >= 0 ? Math.max(0, range.min - margin) : range.min - margin;
      const hi = range.max + margin;
      return { lo, stride: spanStride(lo, hi, bins), integer: true };
    }
    const pad = (range.max - range.min) * marginFraction;
    const lo = range.min >= 0 ? Math.max(0, range.min - pad) : range.min - pad;
    const stride = Math.fround((range.max + pad - lo) / bins);
    if (stride > 0) {
      return { lo: Math.fround(lo), stride, integer: false };
    }
    // A constant metric: one bin, centred on the value.
    return { lo: Math.fround(range.min - 0.5), stride: 1, integer: false };
  });
}

/** Whether any metric's samples fell outside its window. */
export function anyEscapes(observed: readonly ObservedMetricRange[]): boolean {
  return observed.some((range) => range.below > 0 || range.above > 0);
}

const keyView = new DataView(new ArrayBuffer(4));

/* eslint-disable no-bitwise -- the order key is bit arithmetic */
/**
 * The shader's `f32_order_key`: the f32's bits as a u32 whose order matches
 * the float's, so the device's u32 min/max atomics reduce a float range.
 * Positives set the sign bit, negatives flip every bit.
 */
export const f32OrderKey = (value: number): number => {
  keyView.setFloat32(0, value);
  const bits = keyView.getUint32(0);
  return ((bits & 0x80000000) === 0 ? bits | 0x80000000 : ~bits) >>> 0;
};

/** Inverse of `f32OrderKey`, for the device's range readback. */
export const decodeF32OrderKey = (key: number): number => {
  const bits = ((key & 0x80000000) === 0 ? ~key : key & 0x7fffffff) >>> 0;
  keyView.setUint32(0, bits);
  return keyView.getFloat32(0);
};
/* eslint-enable no-bitwise */

/**
 * The cache key for a batch's calibration (windows + derived capacities).
 *
 * Calibration observes the dynamics FROM an initial marking, for a metric
 * set: batches sharing both can reuse it — a sweep re-instantiates a batch
 * per ladder rung and every one re-probed from scratch. Parameter values are
 * deliberately NOT in the key: different rates shift the observed ranges,
 * and the escape/overflow machinery already recalibrates and re-runs when a
 * cached calibration no longer covers a batch, updating the cache. The key
 * only has to be right about what a calibration is FOR, not about whether it
 * still fits.
 */
export function calibrationKey(options: {
  placeCounts: ArrayLike<number>;
  /** Per place, the typed marking's packed token words. */
  placeTokenWords?: readonly ArrayLike<number>[] | undefined;
  metricIds: readonly string[];
}): string {
  // FNV-1a over the marking, so a typed marking's token words do not turn
  // into a megabyte-long string key.
  /* eslint-disable no-bitwise -- FNV-1a is bit arithmetic */
  let hash = 0x811c9dc5;
  const mix = (value: number) => {
    hash ^= value >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  const counts = options.placeCounts;
  for (let index = 0; index < counts.length; index++) {
    mix(counts[index]!);
  }
  for (const words of options.placeTokenWords ?? []) {
    // A place boundary, so [1,2],[3] never hashes like [1],[2,3].
    mix(0xffffffff);
    for (let index = 0; index < words.length; index++) {
      mix(words[index]!);
    }
  }
  /* eslint-enable no-bitwise */
  return `${hash.toString(16)}|${options.metricIds.join(",")}`;
}
