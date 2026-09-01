/**
 * Histogram windows: which count range each metric's bins cover.
 *
 * Bins used to be zero-anchored — bin `i` meant count `i` — which coupled the
 * representable range to the bin budget: a place living in [1000, 1200]
 * wasted a thousand bins and a count past the budget clamped into the top
 * bin, surfacing as a warning the user could do nothing about. A window maps
 * bin `i` to count `lo + i × stride` instead, and the window is a *uniform*,
 * so moving it needs no shader recompile.
 *
 * The window is planned, observed, and replanned:
 *
 * 1. The first attempt anchors on what is known exactly — a sampled place's
 *    initial count, and its capacity ceiling when it has one.
 * 2. The shader tracks each metric's observed min/max on the device and
 *    counts values that escaped the window (clamped into an edge bin).
 * 3. Any escape recalibrates: the handle replans from the observed range and
 *    re-runs. Seeds derive from absolute run indices, so a re-run reproduces
 *    the same trajectories and the observed range is exact — one re-run
 *    always converges.
 *
 * Pure and separate from the handle so the arithmetic is unit-testable.
 */

export type MetricWindow = {
  /** Count the first bin represents. */
  lo: number;
  /** Counts per bin; 1 is exact, wider strides trade resolution for range. */
  stride: number;
};

/** What the device observed for one metric across every run and frame. */
export type ObservedMetricRange = {
  /** Smallest and largest sampled count; `min > max` means no samples. */
  min: number;
  max: number;
  /** Samples clamped into an edge bin because they fell outside the window. */
  below: number;
  above: number;
};

/** What window planning knows about one metric before any run. */
export type MetricWindowInput = {
  /** The sampled place's initial token count. */
  initialCount: number;
  /**
   * Largest count the place can reach, or null when unbounded. A ceiling
   * makes the window exact and escape-free by construction.
   */
  countCeiling: number | null;
};

const spanStride = (lo: number, hi: number, bins: number): number =>
  Math.max(1, Math.ceil((hi - lo + 1) / bins));

/**
 * First-attempt windows: exact for ceiling-bounded metrics, a generous
 * anchored guess for unbounded ones. The guess trades resolution, not
 * memory — a wider window is a larger stride over the same bins — so
 * guessing large is cheap and the calibrated re-run restores resolution.
 */
export function planInitialWindows(
  inputs: readonly MetricWindowInput[],
  bins: number,
): MetricWindow[] {
  return inputs.map(({ initialCount, countCeiling }) => {
    if (countCeiling !== null) {
      return { lo: 0, stride: spanStride(0, countCeiling, bins) };
    }
    const hi = Math.max(2 * initialCount, initialCount + bins - 1, bins - 1);
    return { lo: 0, stride: spanStride(0, hi, bins) };
  });
}

/**
 * Windows replanned from what a run observed, with margin.
 *
 * A probe's extremes understate a larger run's (more runs, wider tails), so
 * `marginFraction` widens the observed span on both sides; the escape
 * counters catch an undershoot and trigger one more calibration. A metric
 * the run never sampled (`min > max`) keeps its previous window.
 */
export function windowsFromObserved(
  observed: readonly ObservedMetricRange[],
  previous: readonly MetricWindow[],
  bins: number,
  marginFraction: number,
): MetricWindow[] {
  return observed.map((range, index) => {
    const fallback = previous[index] ?? { lo: 0, stride: 1 };
    if (range.min > range.max) {
      return fallback;
    }
    const margin = Math.max(
      2,
      Math.ceil((range.max - range.min + 1) * marginFraction),
    );
    const lo = Math.max(0, range.min - margin);
    const hi = range.max + margin;
    return { lo, stride: spanStride(lo, hi, bins) };
  });
}

/** Whether any metric's samples fell outside its window. */
export function anyEscapes(observed: readonly ObservedMetricRange[]): boolean {
  return observed.some((range) => range.below > 0 || range.above > 0);
}

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
